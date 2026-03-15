import { openDatabaseSync } from 'expo-sqlite';

const db = openDatabaseSync('chat.db');

// ── Schema ────────────────────────────────────────────────────────────────────

export function initDb(): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS messages (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      peerId    TEXT    NOT NULL,
      remotePeerId TEXT NOT NULL DEFAULT '',
      text      TEXT    NOT NULL,
      ts        INTEGER NOT NULL,
      outgoing  INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_messages_peer_ts ON messages(peerId, ts);

    CREATE TABLE IF NOT EXISTS conversations (
      peerId     TEXT    PRIMARY KEY,
      peerName   TEXT    NOT NULL DEFAULT '',
      remotePeerId TEXT  NOT NULL DEFAULT '',
      lastText   TEXT    NOT NULL DEFAULT '',
      lastTs     INTEGER NOT NULL DEFAULT 0,
      unread     INTEGER NOT NULL DEFAULT 0
    );
  `);
  // Idempotent migration: add status column if it doesn't exist yet
  try {
    db.execSync(`ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'sent'`);
  } catch { /* column already exists — ignore */ }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoredMessage {
  id: number;
  peerId: string;
  remotePeerId: string;
  text: string;
  ts: number;
  outgoing: number; // 0 = incoming, 1 = outgoing
  status: string;   // 'sending' | 'sent' | 'delivered' | 'failed'
}

export interface StoredConversation {
  peerId: string;
  peerName: string;
  remotePeerId: string;
  lastText: string;
  lastTs: number;
  unread: number;
}

// ── Writes ────────────────────────────────────────────────────────────────────

/** Inserts a message row and returns the new row's SQLite id. */
export function insertMessage(
  peerId: string,
  remotePeerId: string,
  text: string,
  ts: number,
  outgoing: boolean,
  status = 'sent',
): number {
  const result = db.runSync(
    `INSERT INTO messages (peerId, remotePeerId, text, ts, outgoing, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    peerId, remotePeerId, text, ts, outgoing ? 1 : 0, status,
  );
  return result.lastInsertRowId;
}

export function updateMessageStatus(rowId: number, status: string): void {
  db.runSync(`UPDATE messages SET status = ? WHERE id = ?`, status, rowId);
}

export function upsertConversation(
  peerId: string,
  peerName: string,
  remotePeerId: string,
  lastText: string,
  lastTs: number,
  incrUnread: boolean,
): void {
  db.runSync(
    `INSERT INTO conversations (peerId, peerName, remotePeerId, lastText, lastTs, unread)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(peerId) DO UPDATE SET
       peerName     = excluded.peerName,
       remotePeerId = CASE WHEN excluded.remotePeerId != '' THEN excluded.remotePeerId ELSE remotePeerId END,
       lastText     = excluded.lastText,
       lastTs       = excluded.lastTs,
       unread       = CASE WHEN ? THEN unread + 1 ELSE unread END`,
    peerId, peerName, remotePeerId, lastText, lastTs, 0,
    incrUnread ? 1 : 0,
  );
}

export function markConversationRead(peerId: string): void {
  db.runSync(`UPDATE conversations SET unread = 0 WHERE peerId = ?`, peerId);
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function loadConversations(): StoredConversation[] {
  return db.getAllSync<StoredConversation>(
    `SELECT * FROM conversations ORDER BY lastTs DESC`,
  );
}

/** Returns messages sorted oldest-first for display in a chat list. */
export function loadMessages(peerId: string, limit = 200): StoredMessage[] {
  return db.getAllSync<StoredMessage>(
    `SELECT * FROM (
       SELECT * FROM messages WHERE peerId = ? ORDER BY ts DESC LIMIT ?
     ) ORDER BY ts ASC`,
    peerId, limit,
  );
}
