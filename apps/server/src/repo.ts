import type { Database } from "bun:sqlite"
import {
  DEFAULT_LIMITS,
  type AuditEntry,
  type Limits,
  type NameAliasDto,
  type Role,
  type RoomDto,
  type RoomKind,
  type UserDto,
} from "@kakao-agent/shared"
import type { KakaoProfile } from "./kakao"

export interface UserRow {
  id: string
  displayName: string
  role: Role
  disabled: boolean
  createdAt: number
  /** Kakao Login member number. */
  kakaoId: string | null
  kakaoNickname: string | null
  kakaoImage: string | null
  /** The owner chose this member's rooms (room_access) instead of every room visible to members. */
  roomsLimited: boolean
  /** The KakaoTalk user this account belongs to, once linked from chat. */
  talkUserId: string | null
}

export interface RoomRow {
  id: string
  chatId: string
  name: string
  kind: RoomKind
  enabled: boolean
  memberVisible: boolean
}

/** A message as stored in the messages table. */
export interface StoredMessage {
  logId: number
  serverId: string | null
  chatId: string
  userId: string
  type: number
  kind: string
  text: string
  attachment: string | null
  /** ms since epoch */
  createdAt: number
}

const now = () => Date.now()
const json = <T>(value: string | null, fallback: T): T => {
  if (value === null) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/** All persistence in one place. Methods are small and synchronous (bun:sqlite). */
export class Repo {
  constructor(readonly db: Database) {}

  // ─── users ───────────────────────────────────────────────────────────

  private mapUser = (r: any): UserRow => ({
    id: r.id,
    displayName: r.display_name,
    role: r.role,
    disabled: !!r.disabled,
    createdAt: r.created_at,
    kakaoId: r.kakao_id ?? null,
    kakaoNickname: r.kakao_nickname ?? null,
    kakaoImage: r.kakao_image ?? null,
    roomsLimited: !!r.rooms_limited,
    talkUserId: r.talk_user_id ?? null,
  })

  userById(id: string): UserRow | null {
    const row = this.db.query("SELECT * FROM users WHERE id = ?").get(id)
    return row ? this.mapUser(row) : null
  }

  userByKakaoId(kakaoId: string): UserRow | null {
    const row = this.db.query("SELECT * FROM users WHERE kakao_id = ?").get(kakaoId)
    return row ? this.mapUser(row) : null
  }

  hasOwner(): boolean {
    return !!this.db.query("SELECT 1 FROM users WHERE role = 'owner' LIMIT 1").get()
  }

  owner(): UserRow | null {
    const row = this.db.query("SELECT * FROM users WHERE role = 'owner' ORDER BY created_at LIMIT 1").get()
    return row ? this.mapUser(row) : null
  }

  createUser(input: { displayName: string; role: Role; kakao?: KakaoProfile }): UserRow {
    const id = crypto.randomUUID()
    this.db
      .query(
        `INSERT INTO users (id, display_name, role, created_at, kakao_id, kakao_nickname, kakao_image)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.displayName, input.role, now(), input.kakao?.id ?? null, input.kakao?.nickname ?? null, input.kakao?.image ?? null)
    return this.userById(id)!
  }

  /** Links a Kakao account, or refreshes its nickname and photo at sign-in. */
  setKakao(userId: string, kakao: KakaoProfile) {
    this.db.query("UPDATE users SET kakao_id = ?, kakao_nickname = ?, kakao_image = ? WHERE id = ?").run(kakao.id, kakao.nickname, kakao.image, userId)
  }

  listUsers(): UserDto[] {
    const rows = this.db.query("SELECT * FROM users ORDER BY role DESC, created_at").all().map(this.mapUser)
    return rows.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      role: u.role,
      disabled: u.disabled,
      createdAt: u.createdAt,
      kakao: u.kakaoId ? { nickname: u.kakaoNickname ?? "", image: u.kakaoImage } : null,
      roomIds: u.role === "member" && u.roomsLimited ? this.chosenRoomIds(u.id) : null,
    }))
  }

  private chosenRoomIds(userId: string): string[] {
    return this.db
      .query("SELECT room_id FROM room_access WHERE user_id = ? ORDER BY room_id")
      .all(userId)
      .map((r: any) => String(r.room_id))
  }

  /** Chooses the rooms a member may see, or with null gives them back every room visible to members. */
  setRoomAccess(userId: string, roomIds: string[] | null) {
    this.db.transaction(() => {
      this.db.query("DELETE FROM room_access WHERE user_id = ?").run(userId)
      this.db.query("UPDATE users SET rooms_limited = ? WHERE id = ?").run(roomIds ? 1 : 0, userId)
      const insert = this.db.query("INSERT OR IGNORE INTO room_access (user_id, room_id) SELECT ?, id FROM rooms WHERE id = ?")
      for (const roomId of roomIds ?? []) insert.run(userId, Number(roomId))
    })()
  }

  /**
   * The rooms an account may see: every room for the owner; for a member, the rooms the owner chose
   * for them, or else every room visible to members. None for an account the owner turned off.
   */
  usableRoomIds(userId: string): Set<string> {
    const user = this.userById(userId)
    if (!user || user.disabled) return new Set()
    const rooms = this.listRooms()
    if (user.role === "owner") return new Set(rooms.map((room) => room.id))
    if (user.roomsLimited) {
      const chosen = new Set(this.chosenRoomIds(userId))
      return new Set(rooms.filter((room) => chosen.has(room.id)).map((room) => room.id))
    }
    return new Set(rooms.filter((room) => room.memberVisible).map((room) => room.id))
  }

  updateUser(id: string, patch: { displayName?: string; disabled?: boolean }) {
    if (patch.displayName !== undefined) this.db.query("UPDATE users SET display_name = ? WHERE id = ?").run(patch.displayName, id)
    if (patch.disabled !== undefined) {
      this.db.query("UPDATE users SET disabled = ? WHERE id = ?").run(patch.disabled ? 1 : 0, id)
      if (patch.disabled) this.db.query("DELETE FROM sessions WHERE user_id = ?").run(id)
    }
  }

  deleteUser(id: string) {
    this.db.query("DELETE FROM users WHERE id = ? AND role != 'owner'").run(id)
  }

  // ─── sessions ────────────────────────────────────────────────────────

  createSession(tokenHash: string, userId: string, expiresAt: number, userAgent: string | null) {
    this.db
      .query("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)")
      .run(tokenHash, userId, now(), expiresAt, userAgent)
  }

  sessionUser(tokenHash: string): { user: UserRow; expiresAt: number } | null {
    const row = this.db
      .query(
        `SELECT u.*, s.expires_at AS session_expires FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`,
      )
      .get(tokenHash, now()) as any
    return row ? { user: this.mapUser(row), expiresAt: row.session_expires } : null
  }

  extendSession(tokenHash: string, expiresAt: number) {
    this.db.query("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(expiresAt, tokenHash)
  }

  deleteSession(tokenHash: string) {
    this.db.query("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash)
  }

  // ─── rooms ───────────────────────────────────────────────────────────

  private mapRoom = (r: any): RoomRow => ({
    id: String(r.id),
    chatId: r.chat_id,
    name: r.name,
    kind: r.kind,
    enabled: !!r.enabled,
    memberVisible: !!r.member_visible,
  })

  listRooms(): RoomRow[] {
    return this.db.query("SELECT * FROM rooms ORDER BY name").all().map(this.mapRoom)
  }

  roomById(id: string): RoomRow | null {
    const row = this.db.query("SELECT * FROM rooms WHERE id = ?").get(Number(id))
    return row ? this.mapRoom(row) : null
  }

  roomByChatId(chatId: string): RoomRow | null {
    const row = this.db.query("SELECT * FROM rooms WHERE chat_id = ?").get(chatId)
    return row ? this.mapRoom(row) : null
  }

  createRoom(input: { chatId: string; name: string; kind: RoomKind }): RoomRow {
    // A 1:1 chat or memo is private to the owner until they choose to show it to members.
    const memberVisible = input.kind === "direct" || input.kind === "memo" ? 0 : 1
    const result = this.db
      .query("INSERT INTO rooms (chat_id, name, kind, enabled, member_visible, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)")
      .run(input.chatId, input.name, input.kind, memberVisible, now(), now())
    return this.roomById(String(result.lastInsertRowid))!
  }

  updateRoom(id: string, patch: { name?: string; enabled?: boolean; chatId?: string; memberVisible?: boolean }) {
    const set = (column: string, value: string | number) =>
      this.db.query(`UPDATE rooms SET ${column} = ?, updated_at = ? WHERE id = ?`).run(value, now(), Number(id))
    if (patch.name !== undefined) set("name", patch.name)
    if (patch.enabled !== undefined) set("enabled", patch.enabled ? 1 : 0)
    if (patch.chatId !== undefined) set("chat_id", patch.chatId)
    if (patch.memberVisible !== undefined) set("member_visible", patch.memberVisible ? 1 : 0)
  }

  deleteRoom(id: string) {
    this.db.query("DELETE FROM rooms WHERE id = ?").run(Number(id))
  }

  /** forOwner adds the chat id, member visibility and whether the bot may send there. */
  roomDto(room: RoomRow, owner: { canSend(chatId: string): boolean } | null): RoomDto {
    return {
      id: room.id,
      name: room.name,
      enabled: room.enabled,
      kind: room.kind,
      ...(owner ? { chatId: room.chatId, memberVisible: room.memberVisible, canSend: owner.canSend(room.chatId) } : {}),
    }
  }

  // ─── KakaoTalk users and aliases ─────────────────────────────────────

  /** Records that a user spoke in a room at a time; keeps the latest room and time. */
  noteKakaoUser(userId: string, kakaoName: string | null, chatId: string, at: number) {
    this.db
      .query(
        `INSERT INTO kakao_users (user_id, kakao_name, last_chat_id, last_seen_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET kakao_name = COALESCE(kakao_users.kakao_name, excluded.kakao_name),
         last_chat_id = CASE WHEN COALESCE(kakao_users.last_seen_at, 0) < excluded.last_seen_at THEN excluded.last_chat_id ELSE kakao_users.last_chat_id END,
         last_seen_at = MAX(COALESCE(kakao_users.last_seen_at, 0), excluded.last_seen_at)`,
      )
      .run(userId, kakaoName || null, chatId, at)
  }

  // ─── messages ────────────────────────────────────────────────────────

  /** Stores messages; ones already stored (same log id) are left as they are. */
  saveMessages(items: StoredMessage[]) {
    const insert = this.db.query(
      `INSERT OR IGNORE INTO messages (log_id, server_id, chat_id, user_id, type, kind, text, attachment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    this.db.transaction(() => {
      for (const m of items) insert.run(m.logId, m.serverId, m.chatId, m.userId, m.type, m.kind, m.text, m.attachment, m.createdAt)
    })()
  }

  /** An edited message gets its new text (and the search index with it). */
  updateMessageText(logId: number, text: string) {
    this.db.query("UPDATE messages SET text = ? WHERE log_id = ?").run(text, logId)
  }

  oldestLogId(chatId: string): number | null {
    const row = this.db.query("SELECT MIN(log_id) AS id FROM messages WHERE chat_id = ?").get(chatId) as any
    return row?.id ?? null
  }

  messageCount(chatId: string): number {
    return (this.db.query("SELECT COUNT(*) AS n FROM messages WHERE chat_id = ?").get(chatId) as any).n
  }

  /** Messages since a time in rooms that are registered and on. */
  countMessagesSince(since: number): number {
    const row = this.db
      .query("SELECT COUNT(*) AS n FROM messages m JOIN rooms r ON r.chat_id = m.chat_id WHERE r.enabled = 1 AND m.created_at >= ?")
      .get(since) as any
    return row.n
  }

  /** Each user who spoke in a room, with their last message time. */
  roomSpeakers(chatId: string): { userId: string; lastAt: number }[] {
    return this.db
      .query("SELECT user_id, MAX(created_at) AS last_at FROM messages WHERE chat_id = ? GROUP BY user_id")
      .all(chatId)
      .map((r: any) => ({ userId: r.user_id, lastAt: r.last_at }))
  }

  roomSync(chatId: string): { done: boolean } {
    const row = this.db.query("SELECT done FROM room_sync WHERE chat_id = ?").get(chatId) as any
    return { done: !!row?.done }
  }

  setRoomSync(chatId: string, done: boolean) {
    this.db
      .query("INSERT INTO room_sync (chat_id, done, updated_at) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET done = excluded.done, updated_at = excluded.updated_at")
      .run(chatId, done ? 1 : 0, now())
  }

  // ─── agent turns ─────────────────────────────────────────────────────

  saveAgentTurn(turn: {
    chatId: string
    userId: string
    sender: string
    question: string
    answer: string | null
    tools: { name: string; args: string }[]
    model: string | null
    promptTokens: number
    completionTokens: number
    ms: number
    error: string | null
  }) {
    this.db
      .query(
        `INSERT INTO agent_turns (chat_id, user_id, sender, question, answer, tools, model, prompt_tokens, completion_tokens, ms, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        turn.chatId,
        turn.userId,
        turn.sender,
        turn.question,
        turn.answer,
        JSON.stringify(turn.tools),
        turn.model,
        turn.promptTokens,
        turn.completionTokens,
        turn.ms,
        turn.error,
        now(),
      )
  }

  /** Latest agent turns, newest first; with chatId only that room's. */
  agentTurns(limit: number, chatId?: string) {
    const rows = (chatId
      ? this.db.query("SELECT * FROM agent_turns WHERE chat_id = ? ORDER BY id DESC LIMIT ?").all(chatId, limit)
      : this.db.query("SELECT * FROM agent_turns ORDER BY id DESC LIMIT ?").all(limit)) as any[]
    return rows.map((r) => ({
      id: r.id as number,
      chatId: r.chat_id as string,
      userId: r.user_id as string,
      sender: r.sender as string,
      question: r.question as string,
      answer: (r.answer ?? null) as string | null,
      tools: json<{ name: string; args: string }[]>(r.tools, []),
      model: (r.model ?? null) as string | null,
      promptTokens: (r.prompt_tokens ?? 0) as number,
      completionTokens: (r.completion_tokens ?? 0) as number,
      ms: (r.ms ?? 0) as number,
      error: (r.error ?? null) as string | null,
      createdAt: r.created_at as number,
    }))
  }

  seeKakaoUser(userId: string, kakaoName: string | null, chatId: string) {
    this.db
      .query(
        `INSERT INTO kakao_users (user_id, kakao_name, last_chat_id, last_seen_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET kakao_name = COALESCE(excluded.kakao_name, kakao_name),
         last_chat_id = excluded.last_chat_id, last_seen_at = excluded.last_seen_at`,
      )
      .run(userId, kakaoName || null, chatId, now())
  }

  kakaoUser(userId: string): { alias: string | null; kakaoName: string | null } | null {
    const row = this.db.query("SELECT alias, kakao_name FROM kakao_users WHERE user_id = ?").get(userId) as any
    return row ? { alias: row.alias, kakaoName: row.kakao_name } : null
  }

  /** Remembers a name seen in any room, registered or not, without touching last-seen. */
  learnKakaoName(userId: string, kakaoName: string) {
    this.db
      .query(
        `INSERT INTO kakao_users (user_id, kakao_name) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET kakao_name = excluded.kakao_name`,
      )
      .run(userId, kakaoName)
  }

  /** Alias, else the last name seen, for each of the given KakaoTalk user IDs that has one. */
  kakaoNames(userIds: string[]): Map<string, string> {
    const names = new Map<string, string>()
    if (!userIds.length) return names
    const rows = this.db
      .query(`SELECT user_id, alias, kakao_name FROM kakao_users WHERE user_id IN (${userIds.map(() => "?").join(",")})`)
      .all(...userIds) as any[]
    for (const row of rows) {
      const name = row.alias || row.kakao_name
      if (name) names.set(row.user_id, name)
    }
    return names
  }

  setAlias(userId: string, alias: string | null) {
    this.db
      .query(
        `INSERT INTO kakao_users (user_id, alias) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET alias = excluded.alias`,
      )
      .run(userId, alias)
  }

  listKakaoUsers(): NameAliasDto[] {
    return this.db
      .query(
        `SELECT k.*, r.name AS room_name FROM kakao_users k LEFT JOIN rooms r ON r.chat_id = k.last_chat_id
         WHERE k.last_seen_at IS NOT NULL OR k.alias IS NOT NULL
         ORDER BY (k.alias IS NULL) DESC, k.last_seen_at DESC LIMIT 500`,
      )
      .all()
      .map((r: any) => ({
        userId: r.user_id,
        alias: r.alias,
        kakaoName: r.kakao_name,
        lastRoom: r.room_name ?? null,
        lastSeenAt: r.last_seen_at,
      }))
  }

  // ─── settings ────────────────────────────────────────────────────────

  setting<T>(key: string, fallback: T): T {
    const row = this.db.query("SELECT value FROM settings WHERE key = ?").get(key) as any
    return row ? json(row.value, fallback) : fallback
  }

  setSetting(key: string, value: unknown) {
    this.db
      .query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value))
  }

  limits(): Limits {
    const saved = this.setting<Partial<Limits>>("limits", {})
    return { roomPerMinute: saved.roomPerMinute ?? DEFAULT_LIMITS.roomPerMinute, globalPerMinute: saved.globalPerMinute ?? DEFAULT_LIMITS.globalPerMinute }
  }

  // ─── audit ───────────────────────────────────────────────────────────

  audit(userId: string | null, action: string, target?: string | null, detail?: unknown) {
    this.db
      .query("INSERT INTO audit_log (at, user_id, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .run(now(), userId, action, target ?? null, detail === undefined ? null : JSON.stringify(detail))
  }

  listAudit(limit: number): AuditEntry[] {
    return this.db
      .query(
        `SELECT a.*, COALESCE(u.display_name, '시스템') AS user_name FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?`,
      )
      .all(limit)
      .map((r: any) => ({ id: r.id, at: r.at, user: r.user_name, action: r.action, target: r.target, detail: r.detail }))
  }
}
