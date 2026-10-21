import type { MessageHit } from "@kakao-agent/shared"
import { periodStart, type RoomData } from "../data/room-data"
import type { ToolSpec } from "./llm"

const MAX_RESULT = 6000
const DAYS = { type: "integer", minimum: 0, maximum: 3650, description: "최근 며칠 (1=오늘, 7=최근 7일, 0=전체)" }

/** "10/21 13:05 이름: 내용" in Korea time, one line per message. */
function line(hit: MessageHit): string {
  const at = new Date(hit.at + 9 * 60 * 60 * 1000)
  const stamp = `${at.getUTCMonth() + 1}/${at.getUTCDate()} ${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`
  const text = hit.text.replace(/\s+/g, " ").slice(0, 300) || `(${hit.kind})`
  return `${stamp} ${hit.name}: ${hit.kind === "텍스트" || hit.kind === "답장" ? "" : `[${hit.kind}] `}${text}`
}

function clip(text: string): string {
  return text.length > MAX_RESULT ? `${text.slice(0, MAX_RESULT)}\n…(잘림)` : text
}

export interface AgentTool {
  spec: ToolSpec
  run(args: Record<string, unknown>): string
}

/**
 * The agent's tools for ONE room. Every tool reads through the RoomData of the room the question
 * came from; there is no argument that could point at another room.
 */
export function roomTools(data: RoomData): AgentTool[] {
  const days = (value: unknown, fallback: number) => {
    const n = Number(value ?? fallback)
    return Number.isFinite(n) ? Math.max(0, Math.min(3650, Math.round(n))) : fallback
  }
  const limit = (value: unknown, fallback: number, max: number) => Math.max(1, Math.min(max, Math.round(Number(value ?? fallback)) || fallback))

  /** A name in the question to the person in this room; several matches or none come back as a message. */
  const findPerson = (name: unknown): { userId: string; name: string } | string => {
    const wanted = String(name ?? "").trim().replace(/(님|이|가|은|는)$/, "")
    if (!wanted) return "사람 이름이 필요해요."
    const people = data.speakers()
    const exact = people.filter((p) => p.name === wanted)
    if (exact.length === 1) return exact[0]!
    const partial = people.filter((p) => p.name.includes(wanted) || (wanted.length >= 2 && wanted.includes(p.name)))
    if (partial.length === 1) return partial[0]!
    if (partial.length > 1) return `"${wanted}"에 해당하는 사람이 여럿이에요: ${partial.map((p) => p.name).join(", ")}`
    return `이 방에서 "${wanted}"을(를) 찾지 못했어요. room_people로 이름을 확인하세요.`
  }

  return [
    {
      spec: {
        type: "function",
        function: {
          name: "room_people",
          description: "이 방에서 말한 적 있는 사람들과 전체 메시지 수",
          parameters: { type: "object", properties: {} },
        },
      },
      run: () => clip(data.speakers().map((p) => `${p.name}: ${p.count}개`).join("\n") || "아직 저장된 메시지가 없어요."),
    },
    {
      spec: {
        type: "function",
        function: {
          name: "room_stats",
          description: "이 방의 기간별 통계: 전체 메시지 수, 많이 말한 사람, 바쁜 시간대, 날짜별 수, 메시지 종류",
          parameters: { type: "object", properties: { days: DAYS }, required: ["days"] },
        },
      },
      run: (args) => {
        const d = days(args.days, 7)
        const s = data.stats({ from: periodStart(d) })
        const busiest = s.hours
          .map((count, hour) => ({ hour, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .filter((h) => h.count)
          .map((h) => `${h.hour}시(${h.count})`)
        return clip(
          [
            `기간: ${d === 0 ? "전체" : d === 1 ? "오늘" : `최근 ${d}일`}`,
            `메시지: ${s.total}개, 말한 사람: ${s.people.length}명`,
            `많이 말한 사람: ${s.people.slice(0, 10).map((p) => `${p.name} ${p.count}`).join(", ")}`,
            `바쁜 시간대: ${busiest.join(", ") || "없음"}`,
            `날짜별: ${s.days.slice(-31).map((x) => `${x.date.slice(5)} ${x.count}`).join(", ")}`,
            `종류: ${s.kinds.map((k) => `${k.kind} ${k.count}`).join(", ")}`,
          ].join("\n"),
        )
      },
    },
    {
      spec: {
        type: "function",
        function: {
          name: "search_messages",
          description: "이 방의 메시지를 단어로 찾기 (최신순). 단어를 비우고 person만 주면 그 사람의 최근 메시지.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "찾을 단어들 (모두 포함하는 메시지)" },
              person: { type: "string", description: "이 사람이 보낸 메시지만" },
              days: DAYS,
              limit: { type: "integer", minimum: 1, maximum: 50 },
            },
          },
        },
      },
      run: (args) => {
        let userId: string | undefined
        if (args.person) {
          const found = findPerson(args.person)
          if (typeof found === "string") return found
          userId = found.userId
        }
        const d = days(args.days, 0)
        const hits = data.search({ query: String(args.query ?? ""), userId, from: periodStart(d), limit: limit(args.limit, 30, 50) })
        return clip(hits.length ? hits.reverse().map(line).join("\n") : "찾은 메시지가 없어요.")
      },
    },
    {
      spec: {
        type: "function",
        function: {
          name: "person_messages",
          description: "한 사람이 이 방에서 한 말을 기간 전체에 고르게 뽑아오기. 성격, 말투, 관심사를 물을 때 쓰세요.",
          parameters: {
            type: "object",
            properties: { person: { type: "string" }, days: DAYS, limit: { type: "integer", minimum: 10, maximum: 150 } },
            required: ["person"],
          },
        },
      },
      run: (args) => {
        const found = findPerson(args.person)
        if (typeof found === "string") return found
        const hits = data.person(found.userId, { from: periodStart(days(args.days, 0)), limit: limit(args.limit, 80, 150) })
        return clip(hits.length ? `${found.name}의 메시지 ${hits.length}개:\n${hits.map(line).join("\n")}` : `${found.name}의 메시지가 없어요.`)
      },
    },
    {
      spec: {
        type: "function",
        function: {
          name: "recent_messages",
          description: "이 방의 최근 대화 (오래된 것부터)",
          parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } },
        },
      },
      run: (args) => clip(data.recent(limit(args.limit, 40, 100)).map(line).join("\n") || "최근 메시지가 없어요."),
    },
  ]
}
