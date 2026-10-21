const AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize"
const TOKEN_URL = "https://kauth.kakao.com/oauth/token"
const PROFILE_URL = "https://kapi.kakao.com/v2/user/me"

export interface KakaoProfile {
  /** Kakao Login member number. Stable per Kakao account (and per app). */
  id: string
  nickname: string
  image: string | null
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** Kakao Login (REST API, authorization code flow). Tokens are used once and thrown away. */
export class KakaoLogin {
  constructor(
    private readonly restApiKey: string,
    private readonly clientSecret: string,
    private readonly fetcher: Fetch = (input, init) => fetch(input, init),
  ) {}

  get enabled(): boolean {
    return this.restApiKey !== ""
  }

  authorizeUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({ client_id: this.restApiKey, redirect_uri: redirectUri, response_type: "code", state })
    return `${AUTHORIZE_URL}?${params}`
  }

  async profile(code: string, redirectUri: string): Promise<KakaoProfile> {
    const form = new URLSearchParams({ grant_type: "authorization_code", client_id: this.restApiKey, redirect_uri: redirectUri, code })
    if (this.clientSecret) form.set("client_secret", this.clientSecret)
    const tokenResponse = await this.fetcher(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: form.toString(),
      signal: AbortSignal.timeout(10_000),
    })
    if (!tokenResponse.ok) throw new Error(`Kakao token ${tokenResponse.status}: ${(await tokenResponse.text()).slice(0, 200)}`)
    const token = (await tokenResponse.json()) as { access_token?: string }
    if (!token.access_token) throw new Error("Kakao token response had no access_token")

    const profileResponse = await this.fetcher(PROFILE_URL, {
      headers: { authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!profileResponse.ok) throw new Error(`Kakao profile ${profileResponse.status}`)
    const raw = await profileResponse.text()
    const data = JSON.parse(raw) as {
      id?: number
      properties?: { nickname?: string; thumbnail_image?: string }
      kakao_account?: { profile?: { nickname?: string; thumbnail_image_url?: string; is_default_image?: boolean } }
    }
    // Member numbers are 64-bit; read the digits from the text so large ones stay exact.
    const id = raw.match(/^\s*\{\s*"id"\s*:\s*(\d+)/)?.[1] ?? (data.id === undefined ? "" : String(data.id))
    if (!id) throw new Error("Kakao profile had no id")
    const profile = data.kakao_account?.profile
    const nickname = (profile?.nickname ?? data.properties?.nickname ?? "").trim() || "카카오 사용자"
    const url = profile?.is_default_image ? null : (profile?.thumbnail_image_url ?? data.properties?.thumbnail_image ?? null)
    // Kakao sometimes hands out http:// photo URLs; the CDN serves the same file over https.
    const image = url ? url.replace(/^http:\/\//, "https://") : null
    return { id, nickname: nickname.slice(0, 20), image }
  }
}
