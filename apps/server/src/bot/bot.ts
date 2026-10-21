import type { Config } from "../config"
import { startOfDayKst } from "../data/room-data"
import { IrisClient } from "../iris/client"
import { IrisSocket } from "../iris/socket"
import type { Repo, RoomRow } from "../repo"
import { Backfill } from "./backfill"
import { EventProcessor, type BotMessage } from "./events"
import { Outbox } from "./outbox"

export type MessageListener = (message: BotMessage) => Promise<void> | void

/**
 * Wires Iris, the event processor and the outbox together. KakaoBot keeps its own Iris stream
 * (a separate client id), its deletion and edit alerts and everything else it does.
 */
export class Bot {
  readonly iris: IrisClient
  readonly outbox: Outbox
  readonly processor: EventProcessor
  readonly backfill: Backfill
  private socket: IrisSocket | null = null
  private maintenance: ReturnType<typeof setInterval> | null = null
  private listeners: MessageListener[] = []
  botUserId: string | null = null
  botName: string | null = null

  constructor(
    readonly repo: Repo,
    private readonly config: Config,
    private readonly log: (message: string) => void = console.log,
  ) {
    this.iris = new IrisClient(config.irisUrl || "127.0.0.1:3000", config.irisToken)
    this.outbox = new Outbox(this.iris, repo, config.sendMode, config.sendRooms, log)
    this.processor = new EventProcessor({
      repo,
      iris: this.iris,
      isEcho: (chatId, text) => this.outbox.isEcho(chatId, text),
      botUserId: () => this.botUserId,
      botName: () => this.botName,
      emit: (message) => this.dispatch(message),
      log,
    })
    this.backfill = new Backfill(repo, this.iris, (userId) => this.processor.lookupName(userId), log)
  }

  get connected(): boolean {
    return this.socket?.connected ?? false
  }

  get lastEventAt(): number | null {
    return this.socket?.lastEventAt ?? null
  }

  /** Messages stored today (Korea time) in registered rooms that are on. */
  get messagesToday(): number {
    return this.repo.countMessagesSince(startOfDayKst(Date.now()))
  }

  onMessage(listener: MessageListener) {
    this.listeners.push(listener)
  }

  async start() {
    if (!this.config.irisUrl) {
      this.log("[bot] IRIS_URL is not set, KakaoTalk events are disabled")
      return
    }
    await this.refreshBotIdentity()
    this.socket = new IrisSocket({
      irisUrl: this.config.irisUrl,
      token: this.config.irisToken,
      clientId: this.config.irisClientId,
      onEvent: (payload) => this.processor.handle(payload),
      log: this.log,
    })
    this.socket.start()
    const allowed = this.config.sendRooms.length ? this.config.sendRooms.join(", ") : "every room"
    this.log(`[bot] started (send mode: ${this.config.sendMode}, may send to: ${allowed}, client: ${this.config.irisClientId})`)
    void this.syncRooms()
    // A backfill cut short (Iris restarting, say) picks up where it stopped.
    this.maintenance = setInterval(() => void this.syncRooms(), 60 * 60 * 1000)
  }

  stop() {
    this.socket?.stop()
    if (this.maintenance) clearInterval(this.maintenance)
  }

  /** Copies the past messages of every registered room that is on, one room at a time. */
  async syncRooms() {
    for (const room of this.repo.listRooms().filter((r) => r.enabled)) await this.backfill.syncRoom(room)
  }

  /** Starts copying a newly registered (or re-pointed) room's past messages in the background. */
  syncRoom(room: RoomRow) {
    if (this.config.irisUrl) void this.backfill.syncRoom(room)
  }

  /**
   * The message is stored first; a failure there makes Iris replay the event. Listener failures
   * are logged and swallowed: a broken feature must not make Iris replay the event forever.
   */
  private async dispatch(message: BotMessage) {
    const logId = Number(message.logId)
    if (Number.isSafeInteger(logId)) {
      this.repo.saveMessages([
        {
          logId,
          serverId: message.serverId,
          chatId: message.room.chatId,
          userId: message.senderId,
          type: message.type,
          // The bot's own sends (agent answers) are kept apart from the room's conversation.
          kind: message.fromBot ? "봇" : message.kind,
          text: message.text,
          attachment: message.attachmentRaw,
          createdAt: message.time.getTime(),
        },
      ])
    }
    this.log(`[msg] ${message.room.name} · ${message.sender} · ${message.kind}${message.fromBot ? " (bot)" : ""}`)
    for (const listener of this.listeners) {
      try {
        await listener(message)
      } catch (error) {
        this.log(`[bot] listener failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  private async refreshBotIdentity() {
    try {
      const irisConfig = await this.iris.config()
      this.botUserId = String(irisConfig.bot_id)
      this.botName = irisConfig.bot_name
    } catch (error) {
      this.log(`[bot] could not read Iris config: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
