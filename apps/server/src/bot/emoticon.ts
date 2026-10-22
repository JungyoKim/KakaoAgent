import sharp from "sharp"

/**
 * KakaoTalk emoticons as images, for sending a deleted emoticon back as the emoticon itself.
 *
 * An emoticon message's attachment names its file ("4442496.emot_001.webp"), which the emoticon CDN
 * serves. Animated files (.webp, .gif) have their first 128 bytes scrambled with an LFSR XOR (the
 * scheme in blluv/KakaoTalkEmoticonDownloader); still ones (.png) are plain. Animated WebP becomes a
 * GIF, which KakaoTalk shows as a moving photo (image/gif).
 */

const CDN = "https://item.kakaocdn.net/dw/"
const KEY = Buffer.from("a271730728cbe141e47fd9d677e9006d")
const ITEM_PATH = /^(\d+)\.emot_(\d+)\.(png|webp|gif)$/i
/** The last images made, by file. Deletions mostly follow the sending closely. */
const CACHE_SIZE = 60
const cache = new Map<string, Promise<EmoticonImage | null>>()

/** Unscrambles the first 128 bytes of an animated emoticon file. The input is left as it is. */
export function decryptEmoticon(data: Uint8Array): Buffer {
  const out = Buffer.from(data)
  const key = Buffer.concat([KEY, KEY])
  const state = [0, 0, 0]
  for (let i = 0; i < 4; i++) {
    state[0] = ((state[0]! << 8) | key[i]!) >>> 0
    state[1] = ((state[1]! << 8) | key[4 + i]!) >>> 0
    state[2] = ((state[2]! << 8) | key[8 + i]!) >>> 0
  }
  for (let n = 0; n < Math.min(128, out.length); n++) {
    let flag1 = 1
    let flag2 = 0
    let bits = 0
    for (let b = 0; b < 8; b++) {
      const shifted = state[0]! >>> 1
      if (state[0]! & 1) {
        state[0] = (shifted ^ 0xc0000031) >>> 0
        const next = state[1]! >>> 1
        flag1 = state[1]! & 1
        state[1] = flag1 ? ((next | 0xc0000000) ^ 0x20000010) >>> 0 : (next & 0x3fffffff) >>> 0
      } else {
        state[0] = shifted
        const next = state[2]! >>> 1
        flag2 = state[2]! & 1
        state[2] = flag2 ? ((next | 0xf0000000) ^ 0x8000001) >>> 0 : (next & 0xfffffff) >>> 0
      }
      bits = (flag1 ^ flag2) | (bits << 1)
    }
    out[n] = (bits ^ out[n]!) & 0xff
  }
  return out
}

/** The emoticon file named by an attachment (emoticonItemPath, else path), or null. */
export function emoticonPath(attachment: any): string | null {
  const value = attachment?.emoticonItemPath ?? attachment?.path
  return typeof value === "string" && ITEM_PATH.test(value) ? value : null
}

export interface EmoticonImage {
  data: Buffer
  mime: "image/gif" | "image/png"
}

/**
 * The image to send for an emoticon: a GIF when it moves, else a PNG. Null for something that is
 * not an emoticon file; throws when the CDN or the conversion fails.
 */
export async function fetchEmoticonImage(itemPath: string, fetcher: typeof fetch = fetch): Promise<EmoticonImage | null> {
  const match = itemPath.match(ITEM_PATH)
  if (!match) return null
  const ext = match[3]!.toLowerCase()
  const response = await fetcher(CDN + itemPath, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`emoticon CDN HTTP ${response.status}`)
  const raw = Buffer.from(await response.arrayBuffer())
  if (ext === "png") return { data: raw, mime: "image/png" }
  const data = decryptEmoticon(raw)
  if (ext === "gif") return { data, mime: "image/gif" }
  const meta = await sharp(data, { animated: true }).metadata()
  if ((meta.pages ?? 1) > 1) {
    // Emoticons that play a few times and stop keep moving when looked at again. Effort 1 is about
    // three times faster than 7 for nearly the same size.
    return { data: await sharp(data, { animated: true }).gif({ effort: 1, loop: 0 }).toBuffer(), mime: "image/gif" }
  }
  return { data: await sharp(data).png().toBuffer(), mime: "image/png" }
}

/** One download and conversion per emoticon file; a failure is forgotten so the next call retries. */
export function getEmoticonImage(itemPath: string): Promise<EmoticonImage | null> {
  const hit = cache.get(itemPath)
  if (hit) {
    cache.delete(itemPath)
    cache.set(itemPath, hit)
    return hit
  }
  const pending = fetchEmoticonImage(itemPath)
  cache.set(itemPath, pending)
  pending.catch(() => cache.delete(itemPath))
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string)
  return pending
}

/** Converts an emoticon as soon as it is posted, so a deletion can send it right after the alert. */
export function prefetchEmoticonImage(itemPath: string): void {
  if (ITEM_PATH.test(itemPath)) getEmoticonImage(itemPath).catch(() => undefined)
}
