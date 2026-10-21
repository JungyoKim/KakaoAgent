import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import path from "node:path"

/** Each entry runs once, in order; PRAGMA user_version records how many have run. */
const MIGRATIONS: string[] = [
  // v1: accounts (Kakao Login only), sessions, registered rooms, KakaoTalk names, settings, audit.
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    kakao_id TEXT UNIQUE,
    kakao_nickname TEXT,
    kakao_image TEXT,
    rooms_limited INTEGER NOT NULL DEFAULT 0,
    talk_user_id TEXT UNIQUE
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    user_agent TEXT
  );
  CREATE TABLE rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'other',
    enabled INTEGER NOT NULL DEFAULT 1,
    member_visible INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE room_access (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, room_id)
  );
  CREATE TABLE kakao_users (
    user_id TEXT PRIMARY KEY,
    kakao_name TEXT,
    alias TEXT,
    last_chat_id TEXT,
    last_seen_at INTEGER
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,
    target TEXT,
    detail TEXT
  );
  `,
]

export function openDb(file: string): Database {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file, { create: true, strict: true })
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA foreign_keys = ON")
  db.exec("PRAGMA busy_timeout = 5000")
  migrate(db)
  return db
}

function migrate(db: Database) {
  const row = db.query("PRAGMA user_version").get() as { user_version: number }
  for (let version = row.user_version; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]!)
      db.exec(`PRAGMA user_version = ${version + 1}`)
    })()
  }
}

export type { Database }
