import type { AgentTurnDto, AuthOptions, DiscoveredRoom, Me, MemoryDto, MessageHit, RoomKind, RoomStats, SystemStatus } from "@kakao-agent/shared"
import { Hono, type Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { z } from "zod"
import { clientIp, csrfGuard, endSession, randomToken, requireOwner, sessionMiddleware, startSession, Throttle, type AppEnv } from "./auth"
import type { ChatFn } from "./agent/llm"
import { refreshNotes } from "./agent/notes"
import type { Bot } from "./bot/bot"
import { config } from "./config"
import { periodStart, RoomData } from "./data/room-data"
import { KakaoLogin, type KakaoProfile } from "./kakao"
import type { Repo, RoomRow, UserRow } from "./repo"
import { clearSetupToken, ownerSetupNeeded, setupTokenValid } from "./setup"

const loginThrottle = new Throttle(30, 15 * 60 * 1000)
const setupThrottle = new Throttle(20, 15 * 60 * 1000)

const OAUTH_COOKIE = "ka_oauth"
const OAUTH_TTL_MS = 10 * 60 * 1000

type OAuthMode = "login" | "setup" | "link"
interface OAuthState {
  mode: OAuthMode
  next: string
  setupToken?: string
  userId?: string
  expires: number
}

/** Kakao round trips in flight, keyed by the OAuth state (the browser also holds it in a cookie). */
class OAuthStates {
  private items = new Map<string, OAuthState>()

  put(state: Omit<OAuthState, "expires">): string {
    const now = Date.now()
    for (const [key, item] of this.items) if (item.expires < now) this.items.delete(key)
    const key = randomToken(24)
    this.items.set(key, { ...state, expires: now + OAUTH_TTL_MS })
    return key
  }

  take(key: string): OAuthState | null {
    const item = this.items.get(key)
    this.items.delete(key)
    return item && item.expires >= Date.now() ? item : null
  }
}

/** Routes that work without a session. */
const PUBLIC_PATH = /^(?:\/api)?\/(?:auth|setup)\//

async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | Response> {
  const raw = await c.req.json().catch(() => null)
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return c.json({ error: `입력값을 확인해 주세요 (${issue?.path.join(".") || "본문"})` }, 400)
  }
  return parsed.data
}

const isResponse = (value: unknown): value is Response => value instanceof Response

function me(user: UserRow): Me {
  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    kakao: user.kakaoId ? { nickname: user.kakaoNickname ?? "", image: user.kakaoImage } : null,
  }
}

/** Only paths on this site are allowed as the page to return to. */
const safeNext = (value: string | undefined) => (value?.startsWith("/") && !value.startsWith("//") ? value : "/")

function roomKind(type: string | null): RoomKind {
  switch (type) {
    case "MultiChat":
      return "group"
    case "DirectChat":
      return "direct"
    case "OM":
    case "OD":
      return "open"
    case "MemoChat":
      return "memo"
    default:
      return "other"
  }
}

export interface ApiOptions {
  /** Tests pass a Kakao client with a fake network. */
  kakao?: KakaoLogin
  /** The agent's model, when one is configured (for refreshing notes on demand). */
  chat?: ChatFn
}

export function createApi(repo: Repo, bot: Bot, options: ApiOptions = {}) {
  const api = new Hono<AppEnv>()
  api.use("*", sessionMiddleware(repo))
  api.use("*", csrfGuard)

  const kakao = options.kakao ?? new KakaoLogin(config.kakaoRestApiKey, config.kakaoClientSecret)
  const oauth = new OAuthStates()
  const user = (c: Context<AppEnv>) => c.get("user")!
  const tooMany = (c: Context) => c.json({ error: "요청이 너무 많아요. 잠시 뒤에 다시 해 주세요" }, 429)
  const redirectUri = (c: Context) => `${config.publicUrl || new URL(c.req.url).origin}/api/auth/kakao/callback`
  /** Back to a page of the web app, with a short error code it knows how to explain. */
  const back = (c: Context, path: string, error?: string) =>
    c.redirect(error ? `${path}${path.includes("?") ? "&" : "?"}error=${error}` : path)
  const roomDto = (current: UserRow, room: Parameters<Repo["roomDto"]>[0]) => repo.roomDto(room, current.role === "owner" ? bot.outbox : null)
  /** A room the signed-in account may see, or null (unknown rooms and hidden ones look the same). */
  const visibleRoom = (c: Context<AppEnv>): RoomRow | null => {
    const room = repo.roomById(c.req.param("id") ?? "")
    return room && repo.usableRoomIds(user(c).id).has(room.id) ? room : null
  }
  const roomData = (room: RoomRow) => new RoomData(repo.db, room.chatId, (ids) => repo.kakaoNames(ids))

  // ─── sign in with Kakao ──────────────────────────────────────────────

  api.post("/auth/logout", (c) => {
    endSession(c, repo)
    return c.json({ ok: true })
  })

  api.get("/auth/me", (c) => {
    const current = c.get("user")
    return current ? c.json(me(current)) : c.json({ error: "로그인이 필요해요" }, 401)
  })

  api.get("/auth/options", (c) => {
    const options: AuthOptions = { setupNeeded: ownerSetupNeeded(repo), kakao: kakao.enabled }
    return c.json(options)
  })

  /** mode=login (default), mode=setup&token=… (first owner), mode=link (add Kakao to this account). */
  api.get("/auth/kakao/start", (c) => {
    const mode = c.req.query("mode") ?? "login"
    const failPage = mode === "link" ? "/settings/account" : "/login"
    if (!kakao.enabled) return back(c, failPage, "kakao-off")
    if (!loginThrottle.hit(clientIp(c))) return back(c, failPage, "busy")
    let state: Omit<OAuthState, "expires">
    if (mode === "setup") {
      const token = c.req.query("token") ?? ""
      if (!setupTokenValid(repo, token)) return back(c, "/login", "setup-used")
      state = { mode, next: "/", setupToken: token }
    } else if (mode === "link") {
      const current = c.get("user")
      if (!current) return back(c, "/login")
      state = { mode, next: "/settings/account", userId: current.id }
    } else {
      state = { mode: "login", next: safeNext(c.req.query("next")) }
    }
    const key = oauth.put(state)
    setCookie(c, OAUTH_COOKIE, key, { httpOnly: true, secure: config.cookieSecure, sameSite: "Lax", path: "/", maxAge: OAUTH_TTL_MS / 1000 })
    // Logged so a KOE006 (redirect URI not registered) can be compared with the Kakao console.
    console.log(`[kakao] ${state.mode} started, redirect_uri=${redirectUri(c)}`)
    return c.redirect(kakao.authorizeUrl(redirectUri(c), key))
  })

  api.get("/auth/kakao/callback", async (c) => {
    const key = c.req.query("state") ?? ""
    const cookie = getCookie(c, OAUTH_COOKIE)
    deleteCookie(c, OAUTH_COOKIE, { path: "/" })
    // The state must come back to the same browser that started the round trip.
    const state = key && cookie === key ? oauth.take(key) : null
    if (!state) return back(c, "/login", "expired")
    const failPage = state.mode === "link" ? "/settings/account" : state.mode === "setup" ? `/setup/${state.setupToken}` : "/login"
    if (c.req.query("error")) return back(c, failPage, "cancelled")
    const code = c.req.query("code")
    if (!code) return back(c, failPage, "kakao")

    let profile: KakaoProfile
    try {
      profile = await kakao.profile(code, redirectUri(c))
    } catch (error) {
      console.warn(`[kakao] sign-in failed: ${error instanceof Error ? error.message : String(error)}`)
      return back(c, failPage, "kakao")
    }
    const linked = repo.userByKakaoId(profile.id)

    if (state.mode === "link") {
      const target = state.userId ? repo.userById(state.userId) : null
      if (!target) return back(c, "/login", "expired")
      if (linked && linked.id !== target.id) return back(c, failPage, "kakao-taken")
      repo.setKakao(target.id, profile)
      repo.audit(target.id, "account.kakao-link", profile.nickname)
      return c.redirect(state.next)
    }

    if (state.mode === "setup") {
      // Checked again: the link may have been used in another tab meanwhile.
      if (!setupTokenValid(repo, state.setupToken ?? "")) return back(c, "/login", "setup-used")
      const owner = repo.owner()
      if (linked && linked.id !== owner?.id) return back(c, failPage, "kakao-taken")
      if (owner) repo.setKakao(owner.id, profile)
      const account = owner ?? repo.createUser({ displayName: profile.nickname, role: "owner", kakao: profile })
      clearSetupToken(repo)
      repo.audit(account.id, owner ? "account.kakao-link" : "setup.owner", owner ? profile.nickname : account.displayName, { ip: clientIp(c) })
      startSession(c, repo, account.id)
      return c.redirect("/")
    }

    if (linked) {
      if (linked.disabled) return back(c, "/login", "disabled")
      repo.setKakao(linked.id, profile)
      startSession(c, repo, linked.id)
      repo.audit(linked.id, "login", null, { ip: clientIp(c) })
      return c.redirect(state.next)
    }
    // Nobody else signs up before the owner can sign in with Kakao.
    if (ownerSetupNeeded(repo)) return back(c, "/login", "no-owner")
    // The first sign-in is the sign-up: one account per Kakao account, ready to use.
    const created = repo.createUser({ displayName: profile.nickname, role: "member", kakao: profile })
    repo.audit(created.id, "join", created.displayName, { ip: clientIp(c) })
    startSession(c, repo, created.id)
    return c.redirect("/")
  })

  // ─── first owner (one-time link from the server log) ─────────────────

  api.get("/setup/:token", (c) => {
    if (!setupThrottle.hit(clientIp(c))) return tooMany(c)
    return setupTokenValid(repo, c.req.param("token"))
      ? c.json({ ok: true, kakao: kakao.enabled, existing: repo.hasOwner() })
      : c.json({ error: "이미 쓴 링크이거나 지난 설정 링크예요" }, 404)
  })

  // Everything below needs a signed-in account.
  api.use("*", async (c, next) => {
    if (PUBLIC_PATH.test(c.req.path) || c.get("user")) return next()
    return c.json({ error: "로그인이 필요해요" }, 401)
  })

  // ─── account ─────────────────────────────────────────────────────────

  // Members keep the name they signed up with (the owner can rename them), so identities stay clear.
  api.patch("/account", requireOwner, async (c) => {
    const input = await body(c, z.object({ displayName: z.string().trim().min(1).max(20) }))
    if (isResponse(input)) return input
    repo.updateUser(user(c).id, { displayName: input.displayName })
    return c.json(me(repo.userById(user(c).id)!))
  })

  // ─── rooms ───────────────────────────────────────────────────────────

  api.get("/rooms", (c) => {
    const current = user(c)
    const usable = repo.usableRoomIds(current.id)
    return c.json(
      repo
        .listRooms()
        .filter((room) => usable.has(room.id))
        .map((room) => roomDto(current, room)),
    )
  })

  api.get("/rooms/discover", requireOwner, async (c) => {
    const rows = await bot.iris.query(
      `SELECT r.id, r.type, r.private_meta, r.meta, r.members, r.active_members_count, r.last_updated_at, o.name AS open_name
       FROM chat_rooms r LEFT JOIN db2.open_link o ON o.id = r.link_id
       ORDER BY r.last_updated_at DESC LIMIT 80`,
    )
    const pickName = (row: Record<string, string | null>): string | null => {
      try {
        const name = row.private_meta ? JSON.parse(row.private_meta)?.name : null
        if (name) return String(name)
      } catch {}
      try {
        const meta = row.meta ? (JSON.parse(row.meta) as { type?: number; content?: string }[]) : []
        const title = Array.isArray(meta) ? meta.find((m) => m?.type === 3)?.content : null
        if (title) return title
      } catch {}
      if (row.open_name) return row.open_name
      if (row.type === "MemoChat") return "나와의 채팅"
      return null
    }
    const memberIds = (row: Record<string, string | null>) => (row.members?.match(/\d+/g) ?? []).slice(0, 4)
    const needNames = new Set<string>()
    for (const row of rows) if (!pickName(row)) for (const id of memberIds(row)) needNames.add(id)
    // Names seen in chat first (most 1:1 partners are not KakaoTalk friends of the bot account),
    // then the bot account's friend list.
    const names = repo.kakaoNames([...needNames])
    const unknown = [...needNames].filter((id) => !names.has(id))
    if (unknown.length) {
      const found = await bot.iris
        .query(`SELECT id, name, enc FROM db2.friends WHERE id IN (${unknown.map(() => "?").join(",")})`, unknown)
        .catch(() => [])
      for (const friend of found) if (friend.id && friend.name) names.set(friend.id, friend.name)
    }
    const memberNames = (row: Record<string, string | null>) =>
      memberIds(row)
        .map((id) => names.get(id))
        .filter(Boolean)
        .join(", ")
    // Rooms still without a name show their last text message, so they can be told apart.
    const nameless = rows.filter((row) => row.id && !pickName(row) && !memberNames(row)).map((row) => row.id as string)
    const previews = new Map<string, string>()
    if (nameless.length) {
      // Iris decrypts message only when the row's user_id and v come with it.
      const last = await bot.iris
        .query(
          `SELECT chat_id, user_id, v, message FROM chat_logs WHERE _id IN (
             SELECT MAX(_id) FROM chat_logs WHERE chat_id IN (${nameless.map(() => "?").join(",")}) AND type = 1 GROUP BY chat_id)`,
          nameless,
        )
        .catch(() => [])
      for (const row of last) {
        const text = row.message?.replace(/\s+/g, " ").trim()
        if (row.chat_id && text) previews.set(row.chat_id, text.length > 60 ? `${text.slice(0, 60)}…` : text)
      }
    }
    const registered = new Map(repo.listRooms().map((room) => [room.chatId, room.id]))
    const result: DiscoveredRoom[] = rows.map((row) => {
      const chatId = row.id ?? ""
      const kind = roomKind(row.type)
      return {
        chatId,
        name: pickName(row) ?? (memberNames(row) || (kind === "direct" ? "1:1 채팅" : "(이름 없는 방)")),
        kind,
        members: Number(row.active_members_count ?? 0),
        lastActiveAt: row.last_updated_at ? Number(row.last_updated_at) * 1000 : null,
        preview: previews.get(chatId),
        registeredId: registered.get(chatId),
      }
    })
    return c.json(result)
  })

  api.post("/rooms", requireOwner, async (c) => {
    const input = await body(
      c,
      z.object({
        chatId: z.string().regex(/^\d{1,20}$/),
        name: z.string().trim().min(1).max(60),
        kind: z.enum(["group", "direct", "open", "memo", "other"]).default("other"),
      }),
    )
    if (isResponse(input)) return input
    if (repo.roomByChatId(input.chatId)) return c.json({ error: "이미 등록된 방이에요" }, 409)
    const room = repo.createRoom(input)
    repo.audit(user(c).id, "room.create", room.name, { chatId: room.chatId })
    bot.syncRoom(room)
    return c.json(roomDto(user(c), room))
  })

  api.patch("/rooms/:id", requireOwner, async (c) => {
    const room = repo.roomById(c.req.param("id"))
    if (!room) return c.json({ error: "방을 찾을 수 없어요" }, 404)
    const input = await body(
      c,
      z.object({
        name: z.string().trim().min(1).max(60).optional(),
        enabled: z.boolean().optional(),
        chatId: z.string().regex(/^\d{1,20}$/).optional(),
        memberVisible: z.boolean().optional(),
      }),
    )
    if (isResponse(input)) return input
    if (input.chatId && input.chatId !== room.chatId && repo.roomByChatId(input.chatId)) {
      return c.json({ error: "그 채팅방 ID는 이미 다른 방에 쓰이고 있어요" }, 409)
    }
    repo.updateRoom(room.id, input)
    repo.audit(user(c).id, "room.update", room.name, input)
    const updated = repo.roomById(room.id)!
    if (updated.enabled) bot.syncRoom(updated)
    return c.json(roomDto(user(c), updated))
  })

  api.delete("/rooms/:id", requireOwner, (c) => {
    const room = repo.roomById(c.req.param("id"))
    if (!room) return c.json({ error: "방을 찾을 수 없어요" }, 404)
    repo.deleteRoom(room.id)
    repo.audit(user(c).id, "room.delete", room.name, { chatId: room.chatId })
    return c.json({ ok: true })
  })

  // ─── room data (stats and search, one room at a time) ────────────────

  api.get("/rooms/:id/stats", (c) => {
    const room = visibleRoom(c)
    if (!room) return c.json({ error: "방을 찾을 수 없어요" }, 404)
    const days = Math.max(0, Math.min(3650, Number(c.req.query("days") ?? 7) || 0))
    const from = periodStart(days)
    const stats: RoomStats = {
      room: { id: room.id, name: room.name },
      from,
      ...roomData(room).stats({ from }),
      sync: { done: repo.roomSync(room.chatId).done && !bot.backfill.isRunning(room.chatId), stored: repo.messageCount(room.chatId) },
    }
    return c.json(stats)
  })

  api.get("/rooms/:id/messages", (c) => {
    const room = visibleRoom(c)
    if (!room) return c.json({ error: "방을 찾을 수 없어요" }, 404)
    const userId = c.req.query("userId")
    const hits: MessageHit[] = roomData(room).search({
      query: (c.req.query("q") ?? "").slice(0, 100),
      userId: userId && /^\d{1,20}$/.test(userId) ? userId : undefined,
      limit: Number(c.req.query("limit") ?? 50) || 50,
    })
    return c.json(hits)
  })

  // ─── members (owner) ─────────────────────────────────────────────────

  api.get("/users", requireOwner, (c) => c.json(repo.listUsers()))

  api.patch("/users/:id", requireOwner, async (c) => {
    const target = repo.userById(c.req.param("id"))
    if (!target) return c.json({ error: "사용자를 찾을 수 없어요" }, 404)
    const input = await body(
      c,
      z.object({
        displayName: z.string().trim().min(1).max(20).optional(),
        disabled: z.boolean().optional(),
        /** The rooms the member may see, or null for every room visible to members. */
        roomIds: z.array(z.string().regex(/^\d{1,12}$/)).max(200).nullable().optional(),
      }),
    )
    if (isResponse(input)) return input
    if (target.role === "owner" && input.disabled) return c.json({ error: "방장 계정은 끌 수 없어요" }, 400)
    if (target.role === "owner" && input.roomIds !== undefined) return c.json({ error: "방장은 모든 방을 봐요" }, 400)
    repo.updateUser(target.id, { displayName: input.displayName, disabled: input.disabled })
    if (input.roomIds !== undefined) repo.setRoomAccess(target.id, input.roomIds)
    repo.audit(user(c).id, "user.update", target.displayName, input)
    return c.json(repo.listUsers().find((u) => u.id === target.id))
  })

  api.delete("/users/:id", requireOwner, (c) => {
    const target = repo.userById(c.req.param("id"))
    if (!target || target.role === "owner") return c.json({ error: "사용자를 찾을 수 없어요" }, 404)
    repo.deleteUser(target.id)
    repo.audit(user(c).id, "user.delete", target.displayName, { kakao: target.kakaoNickname })
    return c.json({ ok: true })
  })

  // ─── KakaoTalk names (owner) ─────────────────────────────────────────

  api.get("/names", requireOwner, (c) => c.json(repo.listKakaoUsers()))

  api.put("/names/:userId", requireOwner, async (c) => {
    const input = await body(c, z.object({ alias: z.string().trim().max(30).nullable() }))
    if (isResponse(input)) return input
    const userId = c.req.param("userId")
    if (!/^\d{1,20}$/.test(userId)) return c.json({ error: "잘못된 사용자 ID예요" }, 400)
    repo.setAlias(userId, input.alias || null)
    repo.audit(user(c).id, "name.alias", userId, { alias: input.alias })
    return c.json({ ok: true })
  })

  // ─── system ──────────────────────────────────────────────────────────

  api.get("/system/status", (c) => {
    const rooms = repo.listRooms()
    const sendRooms = bot.outbox.sendRooms.length
      ? bot.outbox.sendRooms.map((chatId) => rooms.find((room) => room.chatId === chatId)?.name ?? `ID ${chatId}`)
      : null
    const status: SystemStatus = {
      iris: { connected: bot.connected, lastEventAt: bot.lastEventAt, botName: bot.botName ?? undefined },
      paused: bot.outbox.paused,
      sendMode: bot.outbox.mode,
      sendRooms: user(c).role === "owner" ? sendRooms : null,
      counts: { rooms: rooms.length, messagesToday: bot.messagesToday },
      limits: repo.limits(),
    }
    return c.json(status)
  })

  api.post("/system/pause", requireOwner, async (c) => {
    const input = await body(c, z.object({ paused: z.boolean() }))
    if (isResponse(input)) return input
    repo.setSetting("paused", input.paused)
    repo.audit(user(c).id, input.paused ? "system.pause" : "system.resume")
    return c.json({ paused: input.paused })
  })

  api.put("/system/limits", requireOwner, async (c) => {
    const input = await body(
      c,
      z.object({
        roomPerMinute: z.number().int().min(1).max(60).nullable(),
        globalPerMinute: z.number().int().min(1).max(300).nullable(),
      }),
    )
    if (isResponse(input)) return input
    repo.setSetting("limits", input)
    repo.audit(user(c).id, "system.limits", null, input)
    return c.json(repo.limits())
  })

  api.get("/audit", requireOwner, (c) => c.json(repo.listAudit(Math.min(500, Number(c.req.query("limit") ?? 200)))))

  // ─── agent (owner) ───────────────────────────────────────────────────

  api.get("/agent/turns", requireOwner, (c) => {
    const rooms = new Map(repo.listRooms().map((room) => [room.chatId, room.name]))
    const turns: AgentTurnDto[] = repo.agentTurns(Math.min(100, Number(c.req.query("limit") ?? 20) || 20)).map((turn) => ({
      id: turn.id,
      room: rooms.get(turn.chatId) ?? turn.chatId,
      sender: turn.sender,
      question: turn.question,
      answer: turn.answer,
      tools: turn.tools.map((tool) => tool.name),
      model: turn.model,
      tokens: turn.promptTokens + turn.completionTokens,
      ms: turn.ms,
      error: turn.error,
      createdAt: turn.createdAt,
    }))
    return c.json(turns)
  })

  // ─── memories (owner) ────────────────────────────────────────────────

  api.get("/memories", requireOwner, (c) => {
    const rooms = new Map(repo.listRooms().map((room) => [room.chatId, room]))
    const items = repo.allMemories()
    const names = repo.kakaoNames([...new Set(items.map((m) => m.userId))])
    const result: MemoryDto[] = items.map((m) => ({
      id: m.id,
      roomId: rooms.get(m.chatId)?.id ?? null,
      room: rooms.get(m.chatId)?.name ?? m.chatId,
      userId: m.userId,
      person: names.get(m.userId) ?? `(UID: ${m.userId})`,
      kind: m.kind,
      text: m.text,
      updatedAt: m.updatedAt,
    }))
    return c.json(result)
  })

  api.delete("/memories/:id", requireOwner, (c) => {
    const id = Number(c.req.param("id"))
    if (!Number.isInteger(id) || !repo.deleteMemory(id)) return c.json({ error: "기억을 찾을 수 없어요" }, 404)
    repo.audit(user(c).id, "memory.delete", String(id))
    return c.json({ ok: true })
  })

  /** Refreshes the people notes of a room now, from the last few days (the nightly job uses one day). */
  api.post("/rooms/:id/notes", requireOwner, async (c) => {
    const room = repo.roomById(c.req.param("id"))
    if (!room) return c.json({ error: "방을 찾을 수 없어요" }, 404)
    if (!options.chat) return c.json({ error: "LLM이 설정되지 않았어요" }, 400)
    if (!bot.outbox.canSend(room.chatId)) return c.json({ error: "에이전트가 켜진 방에서만 정리할 수 있어요" }, 400)
    const input = await body(c, z.object({ days: z.number().int().min(1).max(90).default(7) }))
    if (isResponse(input)) return input
    // A room with many people takes minutes, longer than a request may stay open: it runs on its own.
    const ownerId = user(c).id
    void refreshNotes({ repo, chat: options.chat, room, since: periodStart(input.days) ?? 0, log: console.log }).then((updated) =>
      repo.audit(ownerId, "memory.refresh", room.name, { days: input.days, updated }),
    )
    return c.json({ started: true }, 202)
  })

  api.notFound((c) => c.json({ error: "없는 API예요" }, 404))
  api.onError((error, c) => {
    console.error("[api]", error)
    return c.json({ error: error instanceof Error ? error.message : "서버 오류" }, 500)
  })

  return api
}
