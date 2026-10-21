import type { Database } from "bun:sqlite"
import type { MessageHit, PersonCount } from "@kakao-agent/shared"

const DAY = 24 * 60 * 60 * 1000
const KST = 9 * 60 * 60 * 1000

/** Midnight (Korea time) of the day that contains the given time. */
export function startOfDayKst(at: number): number {
  return Math.floor((at + KST) / DAY) * DAY - KST
}

/** Start of a period of whole days ending today: 1 = today, 7 = the last seven days. 0 = everything. */
export function periodStart(days: number, now = Date.now()): number | null {
  return days > 0 ? startOfDayKst(now) - (days - 1) * DAY : null
}

export interface Range {
  from?: number | null
  to?: number | null
}

type Names = (userIds: string[]) => Map<string, string>

/**
 * Read-only views of ONE room's stored messages. Every query is bound to the chat id given at
 * construction, so whatever asks (a web page today, the agent later) can only see the room the
 * question came from. Cross-room access is never built on top of this class.
 */
export class RoomData {
  constructor(
    private readonly db: Database,
    readonly chatId: string,
    private readonly names: Names,
  ) {}

  /** The room condition first, then extra conditions with their arguments, then the period. */
  private where(range: Range, extra: string[] = [], extraArgs: (string | number)[] = []): { sql: string; args: (string | number)[] } {
    // The bot's own answers are left out: they are not the room's conversation.
    const parts = ["chat_id = ?", "kind != '봇'", ...extra]
    const args: (string | number)[] = [this.chatId, ...extraArgs]
    if (range.from != null) {
      parts.push("created_at >= ?")
      args.push(range.from)
    }
    if (range.to != null) {
      parts.push("created_at < ?")
      args.push(range.to)
    }
    return { sql: parts.join(" AND "), args }
  }

  private name(map: Map<string, string>, userId: string): string {
    return map.get(userId) ?? `(UID: ${userId})`
  }

  stats(range: Range = {}) {
    const { sql, args } = this.where(range)
    const total = (this.db.query(`SELECT COUNT(*) AS n FROM messages WHERE ${sql}`).get(...args) as any).n as number
    const top = this.db
      .query(`SELECT user_id, COUNT(*) AS n FROM messages WHERE ${sql} GROUP BY user_id ORDER BY n DESC LIMIT 30`)
      .all(...args) as { user_id: string; n: number }[]
    const names = this.names(top.map((row) => row.user_id))
    const people: PersonCount[] = top.map((row) => ({ userId: row.user_id, name: this.name(names, row.user_id), count: row.n }))
    const hours = Array<number>(24).fill(0)
    const byHour = this.db
      .query(
        `SELECT CAST(strftime('%H', created_at / 1000, 'unixepoch', '+9 hours') AS INTEGER) AS h, COUNT(*) AS n
         FROM messages WHERE ${sql} GROUP BY h`,
      )
      .all(...args) as { h: number; n: number }[]
    for (const row of byHour) hours[row.h] = row.n
    const days = (
      this.db
        .query(
          `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', '+9 hours') AS d, COUNT(*) AS n
           FROM messages WHERE ${sql} GROUP BY d ORDER BY d`,
        )
        .all(...args) as { d: string; n: number }[]
    ).map((row) => ({ date: row.d, count: row.n }))
    const kinds = (
      this.db.query(`SELECT kind, COUNT(*) AS n FROM messages WHERE ${sql} GROUP BY kind ORDER BY n DESC`).all(...args) as { kind: string; n: number }[]
    ).map((row) => ({ kind: row.kind, count: row.n }))
    return { total, people, hours, days, kinds }
  }

  /**
   * Messages containing every word of the query, newest first. Words of three or more letters use
   * the trigram index; shorter ones (common in Korean) fall back to a substring match in this room.
   */
  search(input: { query?: string; userId?: string; limit?: number } & Range = {}): MessageHit[] {
    const words = (input.query ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8)
    const long = words.filter((word) => [...word].length >= 3)
    const short = words.filter((word) => [...word].length < 3)
    const extra: string[] = []
    const extraArgs: string[] = []
    if (input.userId) {
      extra.push("user_id = ?")
      extraArgs.push(input.userId)
    }
    if (long.length) {
      extra.push("log_id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)")
      extraArgs.push(long.map((word) => '"' + word.replaceAll('"', '""') + '"').join(" AND "))
    }
    for (const word of short) {
      extra.push("text LIKE ? ESCAPE '\\'")
      extraArgs.push("%" + word.replace(/[\\%_]/g, (c) => "\\" + c) + "%")
    }
    const { sql, args } = this.where(input, extra, extraArgs)
    const limit = Math.min(200, Math.max(1, input.limit ?? 50))
    const rows = this.db
      .query(
        `SELECT log_id, user_id, kind, text, created_at FROM messages
         WHERE ${sql} ORDER BY created_at DESC LIMIT ?`,
      )
      .all(...args, limit) as any[]
    return this.hits(rows)
  }

  /** Up to limit text messages by one person, spread evenly across the period, oldest first. */
  person(userId: string, input: { limit?: number } & Range = {}): MessageHit[] {
    const { sql, args } = this.where(input, ["user_id = ?", "kind = '텍스트'"], [userId])
    const rows = this.db
      .query(`SELECT log_id, user_id, kind, text, created_at FROM messages WHERE ${sql} ORDER BY created_at`)
      .all(...args) as any[]
    const limit = Math.min(500, Math.max(1, input.limit ?? 80))
    const step = rows.length / limit
    const picked = rows.length <= limit ? rows : Array.from({ length: limit }, (_, i) => rows[Math.floor(i * step)])
    return this.hits(picked)
  }

  /** The latest messages, oldest first, optionally only those before a log id. */
  recent(limit = 20, beforeLogId?: number): MessageHit[] {
    const { sql, args } = beforeLogId ? this.where({}, ["log_id < ?"], [beforeLogId]) : this.where({})
    const rows = this.db
      .query(`SELECT log_id, user_id, kind, text, created_at FROM messages WHERE ${sql} ORDER BY created_at DESC, log_id DESC LIMIT ?`)
      .all(...args, Math.min(200, Math.max(1, limit))) as any[]
    return this.hits(rows.reverse())
  }

  /** Everyone who has spoken in the room, most messages first, with their display names. */
  speakers(): PersonCount[] {
    const { sql, args } = this.where({})
    const rows = this.db
      .query(`SELECT user_id, COUNT(*) AS n FROM messages WHERE ${sql} GROUP BY user_id ORDER BY n DESC`)
      .all(...args) as { user_id: string; n: number }[]
    const names = this.names(rows.map((row) => row.user_id))
    return rows.map((row) => ({ userId: row.user_id, name: this.name(names, row.user_id), count: row.n }))
  }

  private hits(rows: any[]): MessageHit[] {
    const names = this.names([...new Set(rows.map((row) => row.user_id as string))])
    return rows.map((row) => ({
      logId: String(row.log_id),
      at: row.created_at,
      userId: row.user_id,
      name: this.name(names, row.user_id),
      kind: row.kind,
      text: row.text,
    }))
  }
}
