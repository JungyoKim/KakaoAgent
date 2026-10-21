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

export type ChatFn = (input: { messages: ChatMessage[]; tools?: ToolSpec[] }) => Promise<ChatResult>

export class LlmError extends Error {}

export function openAiChat(options: { baseUrl: string; apiKey: string; model: string; timeoutMs?: number }): ChatFn {
  const timeoutMs = options.timeoutMs ?? 60_000
  const call = async (body: unknown): Promise<ChatResult> => {
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
      model: String(data.model ?? options.model),
      usage: { prompt: Number(data.usage?.prompt_tokens ?? 0), completion: Number(data.usage?.completion_tokens ?? 0) },
    }
  }
  return async ({ messages, tools }) => {
    const body = { model: options.model, messages, ...(tools?.length ? { tools } : {}), max_tokens: 1200 }
    try {
      return await call(body)
    } catch (error) {
      // One retry: the router often has another provider ready when one is rate-limited or down.
      if (error instanceof Error && error.name === "TimeoutError") throw new LlmError("LLM이 응답하지 않았어요")
      return await call(body)
    }
  }
}
