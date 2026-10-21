import type { Context, MiddlewareHandler } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { config } from "./config"
import type { Repo, UserRow } from "./repo"

export const SESSION_COOKIE = "ka_session"
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SESSION_RENEW_BELOW_MS = 15 * 24 * 60 * 60 * 1000

export type AppEnv = { Variables: { user: UserRow | null; tokenHash: string | null } }

export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return Buffer.from(buffer).toString("base64url")
}

export function sha256(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

export function startSession(c: Context, repo: Repo, userId: string) {
  const token = randomToken()
  repo.createSession(sha256(token), userId, Date.now() + SESSION_TTL_MS, c.req.header("user-agent")?.slice(0, 200) ?? null)
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export function endSession(c: Context<AppEnv>, repo: Repo) {
  const tokenHash = c.get("tokenHash")
  if (tokenHash) repo.deleteSession(tokenHash)
  deleteCookie(c, SESSION_COOKIE, { path: "/" })
}

/** Loads the session user (if any) into the context and slides the expiry. */
export function sessionMiddleware(repo: Repo): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("user", null)
    c.set("tokenHash", null)
    const token = getCookie(c, SESSION_COOKIE)
    if (token) {
      const tokenHash = sha256(token)
      const session = repo.sessionUser(tokenHash)
      if (session) {
        c.set("user", session.user)
        c.set("tokenHash", tokenHash)
        if (session.expiresAt - Date.now() < SESSION_RENEW_BELOW_MS) {
          repo.extendSession(tokenHash, Date.now() + SESSION_TTL_MS)
        }
      }
    }
    await next()
  }
}

/**
 * CSRF guard: state-changing API calls must carry a custom header. Browsers only send
 * custom headers cross-origin after a CORS preflight, which this server never grants.
 */
export const csrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && c.req.header("x-kakao-agent") !== "1") {
    return c.json({ error: "잘못된 요청이에요" }, 403)
  }
  await next()
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")) return c.json({ error: "로그인이 필요해요" }, 401)
  await next()
}

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user")
  if (!user) return c.json({ error: "로그인이 필요해요" }, 401)
  if (user.role !== "owner") return c.json({ error: "방장만 할 수 있어요" }, 403)
  await next()
}

/** Simple in-memory throttle: at most `limit` hits per key within `windowMs`. */
export class Throttle {
  private hits = new Map<string, number[]>()
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  hit(key: string): boolean {
    const now = Date.now()
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 5000) this.hits.clear()
    return true
  }
}

export function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local"
}
