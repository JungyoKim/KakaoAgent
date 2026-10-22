import type { IrisClient } from "../iris/client"
import type { IrisEventPayload } from "../iris/socket"
import type { Repo, RoomRow } from "../repo"
import { enrichContent, extractFileNames, extractImageUrls, kindLabel, parseAttachment } from "./attachments"

export interface RoomRef {
  id: string
  chatId: string
  name: string
}

/** A KakaoTalk message in a registered, enabled room. Deletions and edits stay with KakaoBot. */
export interface BotMessage {
  room: RoomRef
  /** chat_logs._id (local row id). */
  logId: string
  /** chat_logs.id (server log id), which replies and feeds refer to. */
  serverId: string | null
  time: Date
  text: string
  sender: string
  senderId: string
  /** chat_logs.type as KakaoTalk stores it. */
  type: number
  kind: string
  imageUrls: string[]
  fileNames: string[]
  /** Parsed attachment JSON, or null. */
  attachment: any
  /** The attachment JSON exactly as KakaoTalk stores it (64-bit ids intact), or null. */
  attachmentRaw: string | null
  /** True when this is the echo of a message the bot itself just sent. */
  fromBot: boolean
}

export interface EventProcessorDeps {
  repo: Repo
  iris: IrisClient
  isEcho(chatId: string, text: string): boolean
  botUserId(): string | null
  botName(): string | null
  emit(message: BotMessage): Promise<void>
  /** A message was deleted in a registered room (feedType 14); serverId is its chat_logs.id. */
  onDeleted?(room: RoomRef, serverId: string): Promise<void>
  log(message: string): void
}

/** Feed messages (joins, leaves, deletions, edits) are JSON with a feedType. */
const isFeed = (message: string) => message.startsWith("{") && message.includes("feedType")

/** feedType 25 is an edit; its logId is the edited message's server log id (64-bit, read as text). */
function editedServerId(message: string): string | null {
  if (Number(message.match(/"feedType"\s*:\s*(\d+)/)?.[1]) !== 25) return null
  return message.match(/"logId"\s*:\s*"?(\d+)"?/)?.[1] ?? null
}

/** feedType 14 is a deletion; its logId is the deleted message's server log id. */
function deletedServerId(message: string): string | null {
  if (Number(message.match(/"feedType"\s*:\s*(\d+)/)?.[1]) !== 14) return null
  return message.match(/"logId"\s*:\s*"?(\d+)"?/)?.[1] ?? null
}

/**
 * Turns raw Iris events into BotMessages for registered rooms. Every room, registered or not,
 * teaches the sender's name, so the room list can name a 1:1 chat before it is registered.
 */
export class EventProcessor {
  private nameLookups = new Map<string, Promise<string | null>>()

  constructor(private readonly deps: EventProcessorDeps) {}

  private roomRef(room: RoomRow): RoomRef {
    return { id: room.id, chatId: room.chatId, name: room.name }
  }

  async handle(payload: IrisEventPayload): Promise<void> {
    const raw = payload.json
    const chatId = String(raw.chat_id ?? "")
    const userId = String(raw.user_id ?? "")
    const feed = isFeed(payload.msg)
    if (!feed && userId && payload.sender) this.deps.repo.learnKakaoName(userId, payload.sender)
    const room = this.deps.repo.roomByChatId(chatId)
    if (!room || !room.enabled) return
    if (feed) {
      const serverId = editedServerId(payload.msg)
      if (serverId) await this.applyEdit(room, serverId)
      const deletedId = deletedServerId(payload.msg)
      if (deletedId) await this.deps.onDeleted?.(this.roomRef(room), deletedId)
      return
    }

    const type = Number(raw.type ?? 0)
    const createdAt = Number(raw.created_at)
    const att = parseAttachment(raw.attachment)
    if (userId) this.deps.repo.seeKakaoUser(userId, payload.sender || null, chatId)
    const sender = await this.senderName(userId, payload.sender)

    await this.deps.emit({
      room: this.roomRef(room),
      logId: String(raw._id ?? ""),
      serverId: raw.id === undefined || raw.id === null ? null : String(raw.id),
      time: Number.isFinite(createdAt) && createdAt > 0 ? new Date(createdAt * 1000) : new Date(),
      text: enrichContent(payload.msg, type, att),
      sender,
      senderId: userId,
      type,
      kind: kindLabel(type),
      imageUrls: extractImageUrls(att),
      fileNames: extractFileNames(att),
      attachment: att,
      attachmentRaw: typeof raw.attachment === "string" && raw.attachment !== "{}" ? raw.attachment : null,
      fromBot: userId !== "" && userId === this.deps.botUserId() && this.deps.isEcho(chatId, payload.msg),
    })
  }

  /** Keeps the stored copy of an edited message current. Edit alerts stay with KakaoBot. */
  private async applyEdit(room: RoomRow, serverId: string) {
    const rows = await this.deps.iris.query("SELECT _id, user_id, v, message FROM chat_logs WHERE chat_id = ? AND id = ? LIMIT 1", [room.chatId, serverId])
    const row = rows[0]
    if (row?._id && row.message != null) this.deps.repo.updateMessageText(Number(row._id), row.message)
  }

  /** Alias → name Iris reported → KakaoTalk DB lookup → "(UID ...)". */
  async senderName(userId: string, reported: string): Promise<string> {
    if (!userId) return reported || "알 수 없음"
    const known = this.deps.repo.kakaoUser(userId)
    if (known?.alias) return known.alias
    if (reported) return reported
    if (known?.kakaoName) return known.kakaoName
    const looked = await this.lookupName(userId)
    return looked ?? `(UID: ${userId})`
  }

  /** The bot account's own name, then the bot's friend list, then open chat member lists. */
  lookupName(userId: string): Promise<string | null> {
    if (userId === this.deps.botUserId() && this.deps.botName()) return Promise.resolve(this.deps.botName())
    let pending = this.nameLookups.get(userId)
    if (!pending) {
      pending = (async () => {
        for (const sql of [
          "SELECT name, enc FROM db2.friends WHERE id = ? LIMIT 1",
          "SELECT nickname AS name, enc FROM db2.open_chat_member WHERE user_id = ? LIMIT 1",
        ]) {
          try {
            const rows = await this.deps.iris.query(sql, [userId])
            const name = rows[0]?.name
            if (name) return name
          } catch {}
        }
        return null
      })()
      this.nameLookups.set(userId, pending)
      setTimeout(() => this.nameLookups.delete(userId), 10 * 60 * 1000)
    }
    return pending
  }
}
