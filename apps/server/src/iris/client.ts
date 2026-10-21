export type IrisRow = Record<string, string | null>

export interface IrisConfig {
  bot_name: string
  bot_http_port: number
  bot_id: number
}

/** Iris answered with an error status: it received the request (so sending it again may repeat it). */
export class IrisHttpError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Iris ${path} HTTP ${status}: ${detail}`)
  }
}

/**
 * How a text send ended. "unconfirmed": Iris handed the message to KakaoTalk but KakaoTalk did not
 * put it in the chat in time. KakaoTalk keeps such messages and often sends them late (when the
 * phone wakes or reconnects), so this is not a failure and must not be sent again.
 */
export type SendOutcome = "sent" | "unconfirmed"

export function irisHttpUrl(irisUrl: string): string {
  return (/^https?:\/\//.test(irisUrl) ? irisUrl : `http://${irisUrl}`).replace(/\/$/, "")
}

/** Thin HTTP client for the Iris API (/query, /reply, /config). */
export class IrisClient {
  readonly baseUrl: string

  constructor(
    irisUrl: string,
    private readonly token = "",
  ) {
    this.baseUrl = irisHttpUrl(irisUrl)
  }

  get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    }
  }

  private async post<T>(path: string, body: unknown, timeoutMs = 15_000): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const textBody = await response.text()
    if (!response.ok) {
      let message = textBody.slice(0, 300)
      try {
        message = (JSON.parse(textBody) as { message?: string }).message ?? message
      } catch {}
      throw new IrisHttpError(path, response.status, message)
    }
    return (textBody ? JSON.parse(textBody) : {}) as T
  }

  /** Runs a read query against the KakaoTalk DB. Iris decrypts message/attachment/name columns. */
  async query(sql: string, bind: (string | number)[] = []): Promise<IrisRow[]> {
    const result = await this.post<{ data: IrisRow[] }>("/query", { query: sql, bind: bind.map(String) })
    return result.data ?? []
  }

  async sendText(chatId: string, text: string): Promise<SendOutcome> {
    try {
      await this.post("/reply", { type: "text", room: chatId, data: text }, 20_000)
      return "sent"
    } catch (error) {
      if (error instanceof IrisHttpError && error.status === 503 && error.detail === "delivery verification failed") return "unconfirmed"
      throw error
    }
  }

  async sendImage(chatId: string, base64: string): Promise<void> {
    await this.post("/reply", { type: "image", room: chatId, data: base64 }, 30_000)
  }

  async config(): Promise<IrisConfig> {
    const response = await fetch(`${this.baseUrl}/config`, { headers: this.headers, signal: AbortSignal.timeout(5_000) })
    if (!response.ok) throw new Error(`Iris /config HTTP ${response.status}`)
    return (await response.json()) as IrisConfig
  }
}
