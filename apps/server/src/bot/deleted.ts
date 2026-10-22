import type { RoomRef } from "./events"
import { emoticonPath, type EmoticonImage } from "./emoticon"
import { parseAttachment } from "./attachments"

/** What a deleted message was, as far as the alert needs to know. */
export interface DeletedMessage {
  userId: string
  text: string
  attachment: unknown
}

export interface DeletedEmoticonDeps {
  /** Whether the owner turned these alerts on (KakaoBot sends the same ones while it runs). */
  enabled(): boolean
  canSend(chatId: string): boolean
  /** The deleted message: the stored copy, else the KakaoTalk DB. */
  find(room: RoomRef, serverId: string): Promise<DeletedMessage | null>
  senderName(userId: string): Promise<string>
  fetchImage(itemPath: string): Promise<EmoticonImage | null>
  sendText(chatId: string, text: string): Promise<unknown>
  sendImage(chatId: string, base64: string): Promise<unknown>
  log(message: string): void
}

/**
 * A deleted emoticon gets KakaoBot's alert, word for word, and then the emoticon itself as a photo
 * (a GIF when it moves). Other deletions are left to KakaoBot.
 */
export class DeletedEmoticons {
  private seen = new Set<string>()

  constructor(private readonly deps: DeletedEmoticonDeps) {}

  async handle(room: RoomRef, serverId: string): Promise<void> {
    if (!this.deps.enabled() || !this.deps.canSend(room.chatId)) return
    const key = `${room.chatId}:${serverId}`
    if (this.seen.has(key)) return
    const message = await this.deps.find(room, serverId)
    const path = message ? emoticonPath(parseAttachment(message.attachment)) : null
    if (!message || !path) return
    this.seen.add(key)
    if (this.seen.size > 5000) this.seen.clear()

    const match = path.match(/^(\d+)\.emot_(\d+)/)!
    const info = `팩 ${match[1]} #${parseInt(match[2]!, 10)}`
    const sender = message.userId ? await this.deps.senderName(message.userId) : "알 수 없음"
    const textPart = message.text.trim() ? ` (${message.text.trim()})` : ""
    // The image (usually ready since the emoticon was posted) is prepared while the alert goes out.
    const image = this.deps.fetchImage(path).catch((error) => {
      this.deps.log(`[emoticon] ${path}: ${error instanceof Error ? error.message : String(error)}`)
      return null
    })
    await this.deps.sendText(room.chatId, `🗑️ 삭제된 메시지\n👤 ${sender}: [이모티콘] ${info}${textPart}`)
    const ready = await image
    if (ready) await this.deps.sendImage(room.chatId, ready.data.toString("base64"))
  }
}
