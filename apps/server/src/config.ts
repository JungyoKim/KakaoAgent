import path from "node:path"

const env = process.env

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback
  return ["1", "true", "yes", "on"].includes(value.toLowerCase())
}

function list(value: string | undefined): string[] {
  return (value ?? "").split(/[\s,]+/).filter(Boolean)
}

const production = env.NODE_ENV === "production"

export const config = {
  production,
  port: Number(env.PORT ?? 8080),
  dataDir: path.resolve(env.DATA_DIR ?? "./data"),
  /** Iris HTTP address, e.g. 10.10.20.50:3000 */
  irisUrl: env.IRIS_URL ?? "",
  /** Bearer token for the Iris API. */
  irisToken: env.IRIS_TOKEN ?? "",
  /** Ack-cursor identity on the Iris event stream. Iris keeps one cursor per id, so KakaoBot is unaffected. */
  irisClientId: env.IRIS_CLIENT_ID ?? (production ? "kakao-agent" : "kakao-agent-dev"),
  /**
   * live really sends KakaoTalk messages. Anything else only logs what would have been sent.
   * Defaults to dry outside production so a local dev server never talks in rooms.
   */
  sendMode: (env.SEND_MODE ?? (production ? "live" : "dry")) === "live" ? ("live" as const) : ("dry" as const),
  /**
   * Chat ids the bot may send to, comma separated. Empty allows every registered room. While the
   * agent is being built this is the test room only, so nothing can reach the main room by mistake.
   */
  sendRooms: list(env.SEND_ROOMS),
  /** Kakao Developers app: REST API key and its client secret (Kakao Login). */
  kakaoRestApiKey: env.KAKAO_REST_API_KEY ?? "",
  kakaoClientSecret: env.KAKAO_CLIENT_SECRET ?? "",
  /**
   * Public base URL, e.g. https://bot.xenv.cc. Used for the setup link and the Kakao redirect URI
   * (${PUBLIC_URL}/api/auth/kakao/callback). Without it the request origin is used.
   */
  publicUrl: (env.PUBLIC_URL ?? "").replace(/\/$/, ""),
  cookieSecure: bool(env.COOKIE_SECURE, production),
  /** Lets web requests reach private/LAN addresses. Off by default to protect the homelab. */
  allowPrivateFetch: bool(env.ALLOW_PRIVATE_FETCH, false),
  /** OpenAI-compatible endpoint for the agent (freellmapi on Dokploy), its key and model. */
  llmBaseUrl: (env.LLM_BASE_URL ?? "").replace(/\/$/, ""),
  llmApiKey: env.LLM_API_KEY ?? "",
  llmModel: env.LLM_MODEL ?? "auto",
  /** A message starting with this calls the agent, e.g. "/bot 이번 주 통계". */
  agentCommand: (env.AGENT_COMMAND ?? "/bot").toLowerCase(),
  timezone: "Asia/Seoul",
  webDist: path.resolve(env.WEB_DIST ?? path.join(import.meta.dir, "..", "..", "web", "dist")),
}

export type Config = typeof config
