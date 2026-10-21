import type { IrisClient, IrisRow } from "../iris/client"
import type { Repo, RoomRow, StoredMessage } from "../repo"
import { enrichContent, kindLabel, parseAttachment } from "./attachments"

const PAGE = 500

/** Turns a chat_logs row (selected with v and user_id, so Iris decrypts it) into a stored message. */
export function storedFromRow(chatId: string, row: IrisRow): StoredMessage | null {
  const logId = Number(row._id)
  const type = Number(row.type ?? 0)
  if (!Number.isSafeInteger(logId) || type === 0) return null
  const att = parseAttachment(row.attachment)
  return {
    logId,
    serverId: row.id ?? null,
    chatId,
    userId: row.user_id ?? "",
    type,
    kind: kindLabel(type),
    text: enrichContent(row.message ?? "", type, att),
    attachment: row.attachment && row.attachment !== "{}" ? row.attachment : null,
    createdAt: Number(row.created_at) * 1000,
  }
}

/**
 * Copies a room's past messages from the KakaoTalk DB into the messages table, newest first and
 * below the oldest one already stored, so live messages and a restart never leave gaps or doubles.
 */
export class Backfill {
  private running = new Set<string>()

  constructor(
    private readonly repo: Repo,
    private readonly iris: IrisClient,
    private readonly resolveName: (userId: string) => Promise<string | null>,
    private readonly log: (message: string) => void,
  ) {}

  isRunning(chatId: string): boolean {
    return this.running.has(chatId)
  }

  async syncRoom(room: RoomRow): Promise<void> {
    if (this.running.has(room.chatId) || this.repo.roomSync(room.chatId).done) return
    this.running.add(room.chatId)
    const started = Date.now()
    let copied = 0
    try {
      for (;;) {
        const oldest = this.repo.oldestLogId(room.chatId)
        const rows = await this.iris.query(
          `SELECT _id, id, user_id, type, v, message, attachment, created_at FROM chat_logs
           WHERE chat_id = ? AND type != 0${oldest === null ? "" : " AND _id < ?"} ORDER BY _id DESC LIMIT ${PAGE}`,
          oldest === null ? [room.chatId] : [room.chatId, oldest],
        )
        const items = rows.map((row) => storedFromRow(room.chatId, row)).filter((item): item is StoredMessage => item !== null)
        this.repo.saveMessages(items)
        copied += items.length
        if (rows.length < PAGE) break
        await Bun.sleep(150)
      }
      await this.learnNames(room.chatId)
      this.repo.setRoomSync(room.chatId, true)
      this.log(`[backfill] "${room.name}": ${copied} past messages copied in ${Math.round((Date.now() - started) / 1000)}s`)
    } catch (error) {
      this.log(`[backfill] "${room.name}" stopped after ${copied} messages: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.running.delete(room.chatId)
    }
  }

  /** Names everyone who spoke in the room, so stats and search show names rather than ids. */
  private async learnNames(chatId: string) {
    for (const speaker of this.repo.roomSpeakers(chatId)) {
      if (!speaker.userId) continue
      const known = this.repo.kakaoUser(speaker.userId)
      const name = known?.alias || known?.kakaoName ? null : await this.resolveName(speaker.userId)
      this.repo.noteKakaoUser(speaker.userId, name, chatId, speaker.lastAt)
    }
  }
}
