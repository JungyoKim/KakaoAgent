/** OpenAI-compatible chat completions with tool calling (freellmapi, or any compatible endpoint). */

export interface ToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string }

export interface ToolSpec {
  type: "function"
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface ChatResult {
  message: { content: string | null; tool_calls?: ToolCall[] }
  /** The model that actually answered (the router may pick one). */
  model: string
  usage: { prompt: number; completion: number }
}

/** timeoutMs bounds the whole call, retry included. */
export type ChatFn = (input: { messages: ChatMessage[]; tools?: ToolSpec[]; timeoutMs?: number }) => Promise<ChatResult>

export class LlmError extends Error {}

/**
 * models: the first is tried first; the retry goes to the next one (e.g. a fast model, then "auto"
 * so freellmapi can route around a provider that is slow or out of quota).
 */
export function openAiChat(options: { baseUrl: string; apiKey: string; models: string[]; timeoutMs?: number }): ChatFn {
  const models = options.models.filter(Boolean).length ? options.models.filter(Boolean) : ["auto"]
  const call = async (body: unknown, timeoutMs: number): Promise<ChatResult> => {
    const response = await fetch(`${options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    let data: any = null
    try {
      data = JSON.parse(text)
    } catch {}
    if (!response.ok || !data?.choices?.[0]?.message) {
      const detail = data?.error?.message ?? text.slice(0, 200)
      throw new LlmError(`LLM ${response.status}: ${detail}`)
    }
    const message = data.choices[0].message
    return {
      message: { content: message.content ?? null, tool_calls: message.tool_calls?.length ? message.tool_calls : undefined },
      model: String(data.model ?? (body as { model: string }).model),
      usage: { prompt: Number(data.usage?.prompt_tokens ?? 0), completion: Number(data.usage?.completion_tokens ?? 0) },
    }
  }
  return async ({ messages, tools, timeoutMs }) => {
    const bodyFor = (model: string) => ({ model, messages, ...(tools?.length ? { tools } : {}), max_tokens: 1200 })
    const deadline = Date.now() + (timeoutMs ?? options.timeoutMs ?? 60_000)
    // A single attempt gets at most 20 seconds, so a stuck provider leaves time to try another.
    const attempt = (n: number) => {
      const left = deadline - Date.now()
      if (left < 3_000) throw new LlmError("LLM이 제때 답하지 않았어요")
      return call(bodyFor(models[Math.min(n, models.length - 1)]!), Math.min(20_000, left))
    }
    try {
      return await attempt(0)
    } catch (error) {
      // One retry: the router often has another provider ready when one is slow, rate-limited or down.
      if (error instanceof LlmError && /제때/.test(error.message)) throw error
      return await attempt(1)
    }
  }
}
