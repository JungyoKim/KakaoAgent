import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

export interface SafeFetchOptions {
  allowPrivate: boolean
  maxBytes: number
  timeoutMs: number
}

export interface SafeResponse {
  status: number
  contentType: string
  body: Uint8Array
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

function inRange(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split("/") as [string, string]
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask)
}

const PRIVATE_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
]

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return PRIVATE_V4.some((cidr) => inRange(ip, cidr))
  const lower = ip.toLowerCase()
  if (lower === "::" || lower === "::1") return true
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateAddress(mapped[1]!)
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower)
}

async function assertPublic(url: URL, allowPrivate: boolean) {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("http(s) 주소만 쓸 수 있어요")
  if (allowPrivate) return
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address)
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("내부망 주소에는 요청할 수 없어요")
}

/**
 * fetch() that refuses private/LAN targets (checked on every redirect hop),
 * caps response size and enforces a timeout.
 */
export async function safeFetch(rawUrl: string, init: RequestInit, options: SafeFetchOptions): Promise<SafeResponse> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error("URL 형식이 올바르지 않아요")
  }
  const signal = AbortSignal.timeout(options.timeoutMs)
  let method = init.method ?? "GET"
  let body = init.body
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url, options.allowPrivate)
    const response = await fetch(url, { ...init, method, body, redirect: "manual", signal })
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = new URL(response.headers.get("location")!, url)
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
        method = "GET"
        body = undefined
      }
      continue
    }
    const length = Number(response.headers.get("content-length") ?? 0)
    if (length > options.maxBytes) throw new Error("응답이 너무 커요")
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > options.maxBytes) {
          await reader.cancel()
          throw new Error("응답이 너무 커요")
        }
        chunks.push(value)
      }
    }
    const bodyBytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bodyBytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { status: response.status, contentType: response.headers.get("content-type") ?? "", body: bodyBytes }
  }
  throw new Error("리다이렉트가 너무 많아요")
}
