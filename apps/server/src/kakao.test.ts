import { describe, expect, test } from "bun:test"
import { createApi } from "./api"
import { sha256 } from "./auth"
import { Bot } from "./bot/bot"
import { config } from "./config"
import { openDb } from "./db"
import { KakaoLogin } from "./kakao"
import { Repo } from "./repo"
import { createSetupToken } from "./setup"

const OWNER = { id: "1001", nickname: "준교", image: "https://k.kakaocdn.net/owner.jpg" }

/** What Kakao's /v2/user/me returns for each authorization code. */
const PROFILES: Record<string, string> = {
  owner: JSON.stringify({ id: 1001, kakao_account: { profile: { nickname: "준교", thumbnail_image_url: OWNER.image, is_default_image: false } } }),
  friend: JSON.stringify({ id: 2002, kakao_account: { profile: { nickname: "철수", thumbnail_image_url: "https://k.kakaocdn.net/default.jpg", is_default_image: true } } }),
  big: '{"id":9007199254740993123,"kakao_account":{"profile":{"nickname":"큰번호"}}}',
}

function setup() {
  const repo = new Repo(openDb(":memory:"))
  const bot = new Bot(repo, { ...config, irisUrl: "" }, () => {})
  const tokenRequests: URLSearchParams[] = []
  const kakao = new KakaoLogin("test-key", "test-secret", async (url, init) => {
    if (url === "https://kauth.kakao.com/oauth/token") {
      const form = new URLSearchParams(String(init?.body))
      tokenRequests.push(form)
      const code = form.get("code") ?? ""
      return code in PROFILES ? Response.json({ access_token: `tok:${code}` }) : new Response('{"error":"invalid_grant"}', { status: 400 })
    }
    const code = ((init?.headers as Record<string, string>).authorization ?? "").replace("Bearer tok:", "")
    return new Response(PROFILES[code])
  })
  const api = createApi(repo, bot, { kakao })
  const jar = new Map<string, string>()

  const request = async (method: string, path: string, body?: unknown) => {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ")
    const response = await api.request(path, {
      method,
      headers: { "content-type": "application/json", "x-kakao-agent": "1", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(";")[0]!
      const name = pair.slice(0, pair.indexOf("="))
      const value = pair.slice(pair.indexOf("=") + 1)
      if (!value || /max-age=0/i.test(line)) jar.delete(name)
      else jar.set(name, value)
    }
    return response
  }
  const json = async (method: string, path: string, body?: unknown) => {
    const response = await request(method, path, body)
    return { status: response.status, data: (await response.json()) as any }
  }
  /** Starts a Kakao round trip in this browser and returns the Kakao authorize URL. */
  const start = async (query = "") => new URL((await request("GET", `/auth/kakao/start${query}`)).headers.get("location") ?? "", "http://localhost")
  /** Full round trip: Kakao approves with the given code. Returns where the browser lands. */
  const signIn = async (code: string, query = "") => {
    const authorize = await start(query)
    if (authorize.hostname !== "kauth.kakao.com") return authorize.pathname + authorize.search
    const done = await request("GET", `/auth/kakao/callback?code=${code}&state=${authorize.searchParams.get("state")}`)
    return done.headers.get("location") ?? ""
  }
  const sessionFor = (userId: string) => {
    repo.createSession(sha256(`session-${userId}`), userId, Date.now() + 60_000, null)
    jar.set("ka_session", `session-${userId}`)
  }
  return { repo, request, json, start, signIn, sessionFor, jar, tokenRequests }
}

describe("Kakao Login", () => {
  test("the first owner comes through the one-time setup link", async () => {
    const { repo, request, json, start, signIn, tokenRequests } = setup()
    expect((await json("GET", "/auth/options")).data).toEqual({ setupNeeded: true, kakao: true })
    expect((await json("GET", "/audit")).status).toBe(401)
    // Without the link nobody becomes owner.
    expect(await signIn("owner")).toBe("/login?error=no-owner")
    expect(repo.listUsers()).toHaveLength(0)

    const token = createSetupToken(repo)
    expect(await signIn("owner", "?mode=setup&token=wrong")).toBe("/login?error=setup-used")
    const authorize = await start(`?mode=setup&token=${token}`)
    expect(authorize.origin + authorize.pathname).toBe("https://kauth.kakao.com/oauth/authorize")
    expect(authorize.searchParams.get("client_id")).toBe("test-key")
    expect(authorize.searchParams.get("redirect_uri")).toBe(`${config.publicUrl || "http://localhost"}/api/auth/kakao/callback`)
    const landed = await request("GET", `/auth/kakao/callback?code=owner&state=${authorize.searchParams.get("state")}`)
    expect(landed.headers.get("location")).toBe("/")
    expect(tokenRequests.at(-1)?.get("client_secret")).toBe("test-secret")
    expect((await json("GET", "/auth/me")).data).toMatchObject({ displayName: "준교", role: "owner", kakao: { nickname: "준교", image: OWNER.image } })

    expect((await json("GET", `/setup/${token}`)).status).toBe(404)
    expect((await json("GET", "/auth/options")).data.setupNeeded).toBe(false)
  })

  test("the round trip must finish in the same browser, once", async () => {
    const { repo, request, jar, start, signIn } = setup()
    repo.createUser({ displayName: "준교", role: "owner", kakao: OWNER })

    const authorize = await start()
    const state = authorize.searchParams.get("state")
    jar.clear()
    expect((await request("GET", `/auth/kakao/callback?code=owner&state=${state}`)).headers.get("location")).toBe("/login?error=expired")

    const cancelled = await start()
    const back = await request("GET", `/auth/kakao/callback?error=access_denied&state=${cancelled.searchParams.get("state")}`)
    expect(back.headers.get("location")).toBe("/login?error=cancelled")

    expect(await signIn("not-a-real-code")).toBe("/login?error=kakao")
    expect(await signIn("owner", "?next=/settings")).toBe("/settings")
    expect(await signIn("owner", "?next=//evil.example")).toBe("/")
  })

  test("the first Kakao sign-in is the sign-up, one account per Kakao account", async () => {
    const { repo, json, jar, signIn } = setup()
    repo.createUser({ displayName: "준교", role: "owner", kakao: OWNER })
    const room = repo.createRoom({ chatId: "5001", name: "친구방", kind: "group" })

    expect(await signIn("friend")).toBe("/")
    const friend = (await json("GET", "/auth/me")).data
    expect(friend).toMatchObject({ displayName: "철수", role: "member", kakao: { nickname: "철수", image: null } })
    // Ready right away with every registered room, but none of the owner's settings.
    expect((await json("GET", "/system/status")).status).toBe(200)
    expect((await json("GET", "/rooms")).data).toEqual([{ id: room.id, name: "친구방", enabled: true, kind: "group" }])
    expect((await json("POST", "/rooms", { chatId: "5002", name: "새 방", kind: "group" })).status).toBe(403)
    expect((await json("PATCH", `/rooms/${room.id}`, { chatId: "5003" })).status).toBe(403)
    expect((await json("GET", "/users")).status).toBe(403)
    expect((await json("PATCH", "/account", { displayName: "준교" })).status).toBe(403)

    // Signing in again, from another browser, finds the same account.
    jar.clear()
    expect(await signIn("friend")).toBe("/")
    expect((await json("GET", "/auth/me")).data.id).toBe(friend.id)
    expect(repo.listUsers()).toHaveLength(2)

    // The owner can turn someone off; they cannot sign in again.
    repo.updateUser(friend.id, { disabled: true })
    jar.clear()
    expect(await signIn("friend")).toBe("/login?error=disabled")
  })

  test("accounts from before Kakao Login link a Kakao account, one owner per Kakao account", async () => {
    const { repo, json, jar, signIn, sessionFor } = setup()
    const legacy = repo.createUser({ displayName: "jungyo", role: "owner" })
    sessionFor(legacy.id)
    expect((await json("GET", "/auth/me")).data.kakao).toBeNull()
    expect(await signIn("owner", "?mode=link")).toBe("/settings/account")
    expect((await json("GET", "/auth/me")).data.kakao.nickname).toBe("준교")

    jar.clear()
    expect(await signIn("owner")).toBe("/")
    expect((await json("GET", "/auth/me")).data.id).toBe(legacy.id)

    const other = repo.createUser({ displayName: "다른 사람", role: "member" })
    jar.clear()
    sessionFor(other.id)
    expect(await signIn("owner", "?mode=link")).toBe("/settings/account?error=kakao-taken")
  })

  test("64-bit member numbers stay exact", async () => {
    const { repo, signIn } = setup()
    repo.createUser({ displayName: "준교", role: "owner", kakao: OWNER })
    await signIn("big")
    expect(repo.listUsers().some((u) => u.displayName === "큰번호")).toBe(true)
    expect(repo.userByKakaoId("9007199254740993123")?.displayName).toBe("큰번호")
  })

  test("an owner from before Kakao Login gets back in through the setup link", async () => {
    const { repo, json, jar, signIn } = setup()
    const legacy = repo.createUser({ displayName: "jungyo", role: "owner" })
    expect((await json("GET", "/auth/options")).data.setupNeeded).toBe(true)
    // Until then nobody can sign up, so the owner's own Kakao account cannot end up as a member.
    expect(await signIn("owner")).toBe("/login?error=no-owner")
    expect(repo.listUsers()).toHaveLength(1)

    const token = createSetupToken(repo)
    expect((await json("GET", `/setup/${token}`)).data).toEqual({ ok: true, kakao: true, existing: true })
    expect(await signIn("owner", `?mode=setup&token=${token}`)).toBe("/")
    expect((await json("GET", "/auth/me")).data).toMatchObject({ id: legacy.id, role: "owner", kakao: { nickname: "준교" } })
    expect((await json("GET", "/auth/options")).data.setupNeeded).toBe(false)
    expect((await json("GET", `/setup/${token}`)).status).toBe(404)

    jar.clear()
    expect(await signIn("friend")).toBe("/")
    expect(repo.listUsers()).toHaveLength(2)
  })
})
