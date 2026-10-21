/**
 * KakaoTalk attachment parsing, ported from the original KakaoBot deletion guard.
 * Attachments arrive as (decrypted) JSON strings with a structure that depends on
 * the message type.
 */

const IMAGE_CDN = /https?:\/\/[^\s"']+(?:kakaocdn\.net|daumcdn\.net|kakaoenterprise\.com)[^\s"']*/
const IS_IMAGE = /\.(jpe?g|png|gif|webp|bmp|heic?|heif)([?#]|$)/i

export function parseAttachment(value: unknown): any {
  if (!value) return null
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const isCdn = (value: unknown): value is string => typeof value === "string" && IMAGE_CDN.test(value)

export function extractImageUrls(att: any): string[] {
  if (!att || typeof att !== "object") return []
  if (isCdn(att.url)) return IS_IMAGE.test(att.url) ? [att.url] : []
  if (Array.isArray(att.imageUrls)) {
    const urls = att.imageUrls.filter(isCdn)
    if (urls.length) return urls
  }
  if (Array.isArray(att.os)) {
    const urls = att.os.filter((o: any) => (o?.t === 5 || o?.t === 6) && isCdn(o.th)).map((o: any) => o.th)
    if (urls.length) return urls
  }
  const found = new Set<string>()
  const walk = (val: unknown) => {
    if (typeof val === "string") {
      const match = val.match(IMAGE_CDN)
      if (match) found.add(match[0])
    } else if (Array.isArray(val)) val.forEach(walk)
    else if (val && typeof val === "object") Object.values(val).forEach(walk)
  }
  walk(att)
  return [...found]
}

export function extractFileUrl(att: any): string | undefined {
  const url = att?.url
  if (typeof url === "string" && IMAGE_CDN.test(url) && !IS_IMAGE.test(url)) return url
  return undefined
}

export function extractFileNames(att: any): string[] {
  const names: string[] = (att?.os ?? []).filter((o: any) => o?.t === 7 && o.tt).map((o: any) => String(o.tt))
  if (typeof att?.name === "string" && att.name) names.push(att.name)
  return names
}

export function extractVoteOptions(att: any): string[] {
  for (const item of att?.os ?? []) {
    if (item?.t === 9 && Array.isArray(item.its)) return item.its.map((it: any) => it.tt).filter(Boolean)
    if (item?.t === 12 && Array.isArray(item.qds)) return (item.qds[0]?.its ?? []).map((it: any) => it.tt).filter(Boolean)
  }
  const first = att?.os?.[0]
  if (Array.isArray(first?.its)) return first.its.map((it: any) => it.tt).filter(Boolean)
  return []
}

export function noticeSubLabel(att: any): string {
  const types: number[] = (att?.os ?? []).map((o: any) => o?.t)
  if (types.includes(9)) return "[투표]"
  if (types.includes(12)) return "[퀴즈]"
  if (types.includes(7)) return "[파일]"
  if (types.includes(6)) return "[동영상]"
  if (types.includes(5)) return "[사진]"
  return ""
}

export function emoticonLabel(att: any): string | undefined {
  const path = att?.emoticonItemPath ?? att?.path
  if (typeof path !== "string" || !path) return undefined
  const match = path.match(/^(\d+)\.emot_(\d+)/)
  return match ? `팩 ${match[1]} #${parseInt(match[2]!, 10)}` : path
}

/** chat_logs.type with the 0x4000 variant flag removed. */
export function baseType(type: number): number {
  return type >= 16384 ? type - 16384 : type
}

export function kindLabel(type: number): string {
  switch (baseType(type)) {
    case 1:
      return "텍스트"
    case 2:
    case 27:
    case 71:
      return "사진"
    case 3:
      return "동영상"
    case 5:
      return "음성"
    case 6:
    case 12:
    case 20:
    case 25:
      return "이모티콘"
    case 14:
      return "투표"
    case 16:
      return "위치"
    case 17:
      return "프로필"
    case 18:
      return "파일"
    case 24:
      return "공지"
    case 26:
      return "답장"
    default:
      return "기타"
  }
}

/**
 * Adds notice sub-labels and vote options to message text, as the old bot did,
 * so deleted votes and notices stay readable.
 */
export function enrichContent(message: string, type: number, att: any): string {
  if (!att) return message
  let content = message
  const base = baseType(type)
  if (base === 24) {
    const sub = noticeSubLabel(att)
    if (sub && content.startsWith("[공지]")) content = `[공지]${sub}${content.slice("[공지]".length)}`
  }
  if (base === 24 || base === 14) {
    const options = extractVoteOptions(att)
    if (options.length) content = `${content}\n선택지: ${options.join(" | ")}`
  }
  return content
}
