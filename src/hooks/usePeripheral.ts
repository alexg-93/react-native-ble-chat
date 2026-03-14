import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getLocalPeerId, getPeripheralState,
  startAdvertising, stopAdvertising, sendMessage,
  addPeripheralStateListener, addAdvertisingStartedListener,
  addAdvertisingStoppedListener, addCentralSubscribedListener,
  addCentralUnsubscribedListener, addMessageReceivedListener,
} from '../../modules/expo-bluetooth-scanner';
import type { BluetoothState } from '../../modules/expo-bluetooth-scanner';
import { encodeFrames, ChunkReassembler } from '../transport/framer';

export interface ReceivedMessage {
  text: string; // fully reassembled, decoded UTF-8 text
  ts: number;
}

export function usePeripheral() {
  const [peripheralState, setPeripheralState] = useState<BluetoothState>('unknown');
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [receivedMessages, setReceivedMessages] = useState<ReceivedMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const localPeerId = useRef(getLocalPeerId()).current;
  const subs = useRef<Array<{ remove: () => void }>>([]);
  // One reassembler per hook instance — keyed by centralId from onMessageReceived.
  const reassemblerRef = useRef<ChunkReassembler | null>(null);

  useEffect(() => {
    // Seed initial state synchronously — avoids the race where
    // onPeripheralStateChanged fires before this useEffect runs.
    try {
      setPeripheralState(getPeripheralState() as BluetoothState);
    } catch {
      // peripheralManager not yet created; will update via event listener
    }

    // Create reassembler for incoming RX frames (central → peripheral writes).
    // Keys by centralId so concurrent writes from different centrals don't collide.
    const reassembler = new ChunkReassembler((text, { peerId: centralId }) => {
      setReceivedMessages((prev) =>
        [...prev, { text, ts: Date.now() }].slice(-100)
      );
      // centralId available for future per-sender routing (Phase 4)
      void centralId;
    });
    reassemblerRef.current = reassembler;

    subs.current.push(
      addPeripheralStateListener((e) => setPeripheralState(e.state)),
      addAdvertisingStartedListener((e) => {
        if (e.error) {
          setError(e.error);
        } else {
          setIsAdvertising(true);
          setError(null);
        }
      }),
      addAdvertisingStoppedListener(() => setIsAdvertising(false)),
      addCentralSubscribedListener(() => setSubscriberCount((n) => n + 1)),
      addCentralUnsubscribedListener(() => setSubscriberCount((n) => Math.max(0, n - 1))),
      addMessageReceivedListener((e) => {
        // e.value is one base64 frame; e.centralId identifies the writer.
        // Feed into reassembler — onComplete fires when all chunks arrive.
        reassembler.receive(e.centralId, e.value);
      }),
    );
    return () => {
      reassemblerRef.current = null;
      subs.current.forEach((s) => s.remove());
      subs.current = [];
    };
  }, []);

  const start = useCallback((localName: string) => {
    setError(null);
    startAdvertising(localName);
  }, []);

  const stop = useCallback(() => {
    stopAdvertising();
  }, []);

  const send = useCallback((text: string) => {
    // Encode to framed chunks and send each via a TX notification
    const frames = encodeFrames(text);
    for (const frame of frames) {
      sendMessage(frame);
    }
  }, []);

  return {
    localPeerId,
    peripheralState,
    isAdvertising,
    subscriberCount,
    receivedMessages,
    error,
    start,
    stop,
    send,
  };
}
