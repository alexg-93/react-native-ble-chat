/**
 * Phase 3 — BLE message transport framing
 *
 * Frame layout (big-endian binary header, then raw payload):
 *   Bytes 0–1  msgId       uint16  — unique per sender per message (wraps at 0xFFFF)
 *   Byte  2    chunkIdx    uint8   — 0-based index of this chunk
 *   Byte  3    totalChunks uint8   — total chunks for this message (1–255)
 *   Byte  4    flags       uint8   — reserved, always 0
 *   Bytes 5+   payload            — raw UTF-8 bytes for this chunk
 *
 * Each complete frame is then base64-encoded to cross the JS→Native boundary
 * (matching the existing writeCharacteristic / sendMessage API contract).
 *
 * Default chunk payload: 175 bytes → total frame 180 bytes.
 * iOS negotiates ATT MTU to ~185 bytes (→ 182 usable) so 180 is safe.
 * Call setChunkSize(maxWriteBytes) after querying getMaxWriteLength() to tune.
 */

const HEADER_SIZE = 5;

let chunkPayloadSize = 175;

export function setChunkSize(maxWriteBytes: number): void {
  chunkPayloadSize = Math.max(6, maxWriteBytes - HEADER_SIZE);
}

export function getChunkSize(): number {
  return chunkPayloadSize;
}

// ── Monotonic 16-bit message ID ───────────────────────────────────────────────

let nextMsgId = Math.floor(Math.random() * 0xffff);

function allocMsgId(): number {
  nextMsgId = (nextMsgId + 1) & 0xffff;
  return nextMsgId;
}

// ── Binary helpers ────────────────────────────────────────────────────────────

/** Encode UTF-8 text to a Uint8Array (no TextEncoder dependency). */
function textToBytes(text: string): Uint8Array {
  const encoded = encodeURIComponent(text);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; ) {
    if (encoded[i] === '%') {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 3;
    } else {
      bytes.push(encoded.charCodeAt(i));
      i++;
    }
  }
  return new Uint8Array(bytes);
}

/** Decode a UTF-8 Uint8Array to a string (no TextDecoder dependency). */
export function bytesToText(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += `%${bytes[i].toString(16).padStart(2, '0')}`;
  }
  return decodeURIComponent(s);
}

/** Uint8Array → base64 string (for the JS→Native API boundary). */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** base64 string → Uint8Array. */
export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

// ── Frame encoder ─────────────────────────────────────────────────────────────

/**
 * Encode a text message into one or more base64-encoded BLE frames.
 * Caller writes each frame as a separate BLE write / sendMessage call.
 */
export function encodeFrames(text: string): string[] {
  const msgId = allocMsgId();
  const msgBytes = textToBytes(text);
  const totalChunks = Math.max(1, Math.ceil(msgBytes.length / chunkPayloadSize));
  if (totalChunks > 255) {
    throw new Error(`Message too large (${totalChunks} chunks, max 255).`);
  }

  const frames: string[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunkStart = i * chunkPayloadSize;
    const chunk = msgBytes.slice(chunkStart, chunkStart + chunkPayloadSize);
    const frame = new Uint8Array(HEADER_SIZE + chunk.length);
    frame[0] = (msgId >> 8) & 0xff;
    frame[1] = msgId & 0xff;
    frame[2] = i;
    frame[3] = totalChunks;
    frame[4] = 0; // flags — reserved
    frame.set(chunk, HEADER_SIZE);
    frames.push(uint8ToBase64(frame));
  }
  return frames;
}

// ── Chunk reassembler ─────────────────────────────────────────────────────────

interface PendingMsg {
  chunks: Array<Uint8Array | undefined>;
  totalChunks: number;
  received: number;
}

export type OnMessageComplete = (
  text: string,
  context: { peerId: string; msgId: number }
) => void;

/**
 * Stateful chunk reassembler.
 *
 * - Feed base64 frames via receive(peerId, b64Frame).
 * - When all chunks for a (peerId, msgId) pair arrive, onComplete fires with
 *   the fully reassembled text.
 * - Call clear(peerId) on disconnect to drop any partial state.
 *
 * Keyed by "peerId:msgId" so frames from different senders never collide even
 * if they happen to pick the same msgId.
 */
export class ChunkReassembler {
  private pending = new Map<string, PendingMsg>();
  private onComplete: OnMessageComplete;

  constructor(onComplete: OnMessageComplete) {
    this.onComplete = onComplete;
  }

  receive(peerId: string, b64Frame: string): void {
    let bytes: Uint8Array;
    try {
      bytes = base64ToUint8(b64Frame);
    } catch {
      return; // malformed base64 — ignore
    }
    if (bytes.length < HEADER_SIZE) return;

    const msgId       = (bytes[0] << 8) | bytes[1];
    const chunkIdx    = bytes[2];
    const totalChunks = bytes[3];
    // bytes[4] = flags (reserved)
    const payload = bytes.slice(HEADER_SIZE);

    const key = `${peerId}:${msgId}`;
    let pending = this.pending.get(key);
    if (!pending) {
      pending = {
        chunks: new Array<Uint8Array | undefined>(totalChunks).fill(undefined),
        totalChunks,
        received: 0,
      };
      this.pending.set(key, pending);
    }

    if (chunkIdx < pending.totalChunks && !pending.chunks[chunkIdx]) {
      pending.chunks[chunkIdx] = payload;
      pending.received++;
    }

    if (pending.received >= pending.totalChunks) {
      this.pending.delete(key);
      const totalLen = pending.chunks.reduce((s, c) => s + (c?.length ?? 0), 0);
      const allBytes = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of pending.chunks) {
        if (chunk) { allBytes.set(chunk, offset); offset += chunk.length; }
      }
      let text = '';
      try { text = bytesToText(allBytes); } catch { return; }
      this.onComplete(text, { peerId, msgId });
    }
  }

  /** Drop pending state for a peer (call on disconnect). */
  clear(peerId: string): void {
    for (const key of [...this.pending.keys()]) {
      if (key.startsWith(`${peerId}:`)) this.pending.delete(key);
    }
  }
}
