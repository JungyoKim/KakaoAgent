import WebSocket from "ws"

/** One event from the Iris /ws stream: decrypted message plus the raw chat_logs row. */
export interface IrisEventPayload {
  msg: string
  room: string
  sender: string
  json: Record<string, unknown>
}

export interface IrisSocketOptions {
  irisUrl: string
  token?: string
  clientId: string
  onEvent: (event: IrisEventPayload) => Promise<void>
  log: (message: string) => void
}

function parseCursor(value: unknown): bigint | null {
  if (typeof value === "bigint") return value >= 0n ? value : null
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value)
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value)
  return null
}

function decode(data: WebSocket.RawData): string {
  if (typeof data === "string") return data
  if (Buffer.isBuffer(data)) return data.toString("utf8")
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8")
  return Buffer.from(data as ArrayBuffer).toString("utf8")
}

function parseEvent(data: WebSocket.RawData): { id: bigint; payload: IrisEventPayload } {
  const value = JSON.parse(decode(data)) as Record<string, unknown>
  const row = value?.json
  if (typeof row !== "object" || row === null || Array.isArray(row)) throw new Error("Iris event payload is missing json")
  const id = parseCursor((row as Record<string, unknown>)._id)
  if (id === null) throw new Error("Iris event payload has an invalid _id")
  return {
    id,
    payload: {
      msg: typeof value.msg === "string" ? value.msg : "",
      room: typeof value.room === "string" ? value.room : "",
      sender: typeof value.sender === "string" ? value.sender : "",
      json: row as Record<string, unknown>,
    },
  }
}

function socketUrl(irisUrl: string, clientId: string): string {
  const url = new URL(/^https?:\/\//.test(irisUrl) ? irisUrl : `http://${irisUrl}`)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = `${url.pathname.replace(/\/$/, "")}/ws`
  url.searchParams.set("client", clientId)
  return url.toString()
}

/**
 * Resumable Iris event stream (ported from KakaoBot's ReliableIrisSocket).
 *
 * Events are processed strictly in order. Each one is acknowledged to Iris only after
 * `onEvent` resolves, so a crash or disconnect replays unacknowledged events from the
 * server-side cursor stored for `clientId`.
 */
export class IrisSocket {
  private cursor = 0n
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private reconnectDelayMs = 1_000
  private processing: Promise<void> = Promise.resolve()
  private stopped = false
  connected = false
  lastEventAt: number | null = null

  constructor(private readonly options: IrisSocketOptions) {}

  start() {
    this.stopped = false
    this.connect()
  }

  stop() {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.socket?.close()
    this.socket = null
    this.connected = false
  }

  private connect() {
    if (this.stopped || this.socket) return
    const socket = new WebSocket(socketUrl(this.options.irisUrl, this.options.clientId), {
      headers: this.options.token ? { Authorization: `Bearer ${this.options.token}` } : undefined,
    })
    this.socket = socket
    let awaitingPong = false
    let reconnectScheduled = false
    const connectTimeout = setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) {
        this.options.log("[iris] connection timed out")
        socket.terminate()
      }
    }, 10_000)

    const scheduleReconnect = () => {
      clearTimeout(connectTimeout)
      if (this.heartbeat) clearInterval(this.heartbeat)
      this.heartbeat = null
      this.connected = false
      if (this.stopped || reconnectScheduled) return
      reconnectScheduled = true
      this.socket = null
      const delay = this.reconnectDelayMs
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 30_000)
      this.options.log(`[iris] reconnecting in ${delay}ms (cursor=${this.cursor})`)
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        this.connect()
      }, delay)
    }

    socket.on("open", () => {
      clearTimeout(connectTimeout)
      this.reconnectDelayMs = 1_000
      this.connected = true
      this.options.log("[iris] event stream connected")
      this.heartbeat = setInterval(() => {
        if (awaitingPong || socket.readyState !== WebSocket.OPEN) {
          this.options.log("[iris] heartbeat timed out")
          socket.terminate()
          return
        }
        awaitingPong = true
        try {
          socket.ping()
        } catch {
          socket.terminate()
        }
      }, 10_000)
    })

    socket.on("pong", () => {
      awaitingPong = false
    })

    socket.on("message", (data) => {
      awaitingPong = false
      this.processing = this.processing
        .then(async () => {
          if (this.socket !== socket) return
          const event = parseEvent(data)
          if (event.id <= this.cursor) return
          this.lastEventAt = Date.now()
          await this.options.onEvent(event.payload)
          await new Promise<void>((resolve, reject) => {
            if (socket.readyState !== WebSocket.OPEN) return reject(new Error("socket closed before ack"))
            socket.send(JSON.stringify({ type: "ack", cursor: event.id.toString() }), (error) => (error ? reject(error) : resolve()))
          })
          this.cursor = event.id
        })
        .catch((error: unknown) => {
          this.options.log(`[iris] event failed, will replay: ${error instanceof Error ? error.message : String(error)}`)
          socket.close()
        })
    })

    socket.on("error", (error: Error) => {
      this.options.log(`[iris] socket error: ${error.message}`)
      socket.close()
    })

    socket.on("close", scheduleReconnect)
  }
}
