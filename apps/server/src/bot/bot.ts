import type { Config } from "../config"
import { IrisClient } from "../iris/client"
import { IrisSocket } from "../iris/socket"
import type { Repo } from "../repo"
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
  private socket: IrisSocket | null = null
  private listeners: MessageListener[] = []
  private counted = { day: "", messages: 0 }
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
      emit: (message) => this.dispatch(message),
      log,
    })
  }

  get connected(): boolean {
    return this.socket?.connected ?? false
  }

  get lastEventAt(): number | null {
    return this.socket?.lastEventAt ?? null
  }

  /** Messages seen today (Korea time) in registered rooms since the server started. */
  get messagesToday(): number {
    return this.counted.day === this.today() ? this.counted.messages : 0
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
  }

  stop() {
    this.socket?.stop()
  }

  private today(): string {
    return new Date().toLocaleDateString("en-CA", { timeZone: this.config.timezone })
  }

  /**
   * Listener failures are logged and swallowed: a broken feature must not make Iris replay the
   * event forever, and the message itself was handled.
   */
  private async dispatch(message: BotMessage) {
    const day = this.today()
    if (this.counted.day !== day) this.counted = { day, messages: 0 }
    this.counted.messages++
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
