import { IrisHttpError, type IrisClient, type SendOutcome } from "../iris/client"
import type { Repo } from "../repo"

const ECHO_WINDOW_MS = 2 * 60 * 1000

/**
 * Every KakaoTalk send goes through here. It enforces the room allowlist (SEND_ROOMS), the pause
 * switch and the send rate limits, and remembers recent sends so the bot's own messages are not
 * mistaken for new user messages (which would allow reply loops).
 */
export class Outbox {
  private roomHits = new Map<string, number[]>()
  private globalHits: number[] = []
  /** Expiry times of recent sends per room and text; one entry per send, so repeats all count. */
  private echoes = new Map<string, number[]>()

  constructor(
    private readonly iris: IrisClient,
    private readonly repo: Repo,
    readonly mode: "live" | "dry",
    /** Chat ids the bot may send to; empty allows every room. */
    readonly sendRooms: readonly string[],
    private readonly log: (message: string) => void,
  ) {}

  get paused(): boolean {
    return this.repo.setting("paused", false)
  }

  canSend(chatId: string): boolean {
    return this.sendRooms.length === 0 || this.sendRooms.includes(chatId)
  }

  private guard(chatId: string) {
    if (!this.canSend(chatId)) throw new Error("이 방으로는 보낼 수 없게 설정돼 있어요 (SEND_ROOMS)")
    if (this.paused) throw new Error("봇이 일시 정지되어 있어요")
    const limits = this.repo.limits()
    const now = Date.now()
    const room = (this.roomHits.get(chatId) ?? []).filter((t) => now - t < 60_000)
    this.globalHits = this.globalHits.filter((t) => now - t < 60_000)
    if (limits.roomPerMinute !== null && room.length >= limits.roomPerMinute) {
      throw new Error(`이 방에는 1분에 ${limits.roomPerMinute}개까지만 보낼 수 있어요`)
    }
    if (limits.globalPerMinute !== null && this.globalHits.length >= limits.globalPerMinute) {
      throw new Error(`봇 전체가 1분에 ${limits.globalPerMinute}개까지만 보낼 수 있어요`)
    }
    room.push(now)
    this.roomHits.set(chatId, room)
    this.globalHits.push(now)
  }

  private remember(chatId: string, text: string) {
    const now = Date.now()
    for (const [key, times] of this.echoes) {
      const live = times.filter((expires) => expires > now)
      if (live.length) this.echoes.set(key, live)
      else this.echoes.delete(key)
    }
    const key = `${chatId}\n${text}`
    this.echoes.set(key, [...(this.echoes.get(key) ?? []), now + ECHO_WINDOW_MS])
  }

  /** True once per send when a message in chatId matches something the bot sent recently. */
  isEcho(chatId: string, text: string): boolean {
    const key = `${chatId}\n${text}`
    const now = Date.now()
    const times = (this.echoes.get(key) ?? []).filter((expires) => expires > now)
    const matched = times.length > 0
    times.shift()
    if (times.length) this.echoes.set(key, times)
    else this.echoes.delete(key)
    return matched
  }

  async sendText(chatId: string, text: string): Promise<SendOutcome> {
    this.guard(chatId)
    this.remember(chatId, text)
    if (this.mode === "dry") {
      this.log(`[outbox:dry] ${chatId} ← ${text.slice(0, 80).replace(/\n/g, " ⏎ ")}`)
      return "sent"
    }
    const outcome = await this.withRetry(() => this.iris.sendText(chatId, text))
    if (outcome === "unconfirmed") this.log(`[outbox] ${chatId}: handed to KakaoTalk, not in the chat yet (may arrive late)`)
    return outcome
  }

  async sendImage(chatId: string, base64: string) {
    this.guard(chatId)
    if (this.mode === "dry") {
      this.log(`[outbox:dry] ${chatId} ← (image ${Math.round(base64.length / 1024)}KB)`)
      return
    }
    await this.withRetry(() => this.iris.sendImage(chatId, base64))
  }

  /**
   * One more try only when the request never reached Iris (a restarting Iris refuses connections).
   * Once Iris has it, sending again can post the message twice.
   */
  private async withRetry<T>(send: () => Promise<T>): Promise<T> {
    try {
      return await send()
    } catch (error) {
      const reachedIris = error instanceof IrisHttpError || (error instanceof Error && error.name === "TimeoutError")
      if (reachedIris) throw error
      this.log(`[outbox] Iris unreachable, retrying once: ${error instanceof Error ? error.message : String(error)}`)
      await Bun.sleep(1500)
      return await send()
    }
  }
}
