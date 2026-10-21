import type { MessageHit } from "@kakao-agent/shared"
import { periodStart, type RoomData } from "../data/room-data"
import type { Repo } from "../repo"
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

/** A name in the question to the person in this room; several matches or none come back as a message. */
export function findPerson(data: RoomData, name: unknown): { userId: string; name: string } | string {
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

  const person = (name: unknown) => findPerson(data, name)

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
          const found = person(args.person)
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
        const found = person(args.person)
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

const MAX_TOLD = 50
const MAX_FACT = 200

function memoryLines(items: { id: number; kind: string; text: string; updatedAt: number }[]): string {
  const day = (at: number) => new Date(at + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const told = items.filter((m) => m.kind === "told").map((m) => `#${m.id} ${m.text} (${day(m.updatedAt)})`)
  const note = items.find((m) => m.kind === "observed")
  return [
    told.length ? `본인이 기억해 달라고 한 것:\n${told.join("\n")}` : "본인이 기억해 달라고 한 것: 없음",
    note ? `대화에서 정리한 메모 (${day(note.updatedAt)}):\n${note.text}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * Memory tools for the person asking, in this room only. Anyone can save, see and delete what the
 * bot remembers about THEMSELVES; about others they can only read (person_memory), never write.
 */
export function memoryTools(repo: Repo, data: RoomData, asker: { userId: string; name: string }): AgentTool[] {
  return [
    {
      spec: {
        type: "function",
        function: {
          name: "remember",
          description: "질문한 사람이 자기 자신에 대해 기억해 달라고 한 사실을 저장 (예: 다음 주에 시험, 고양이 키움). 다른 사람에 대한 내용은 저장하지 않음.",
          parameters: { type: "object", properties: { fact: { type: "string", description: "짧은 한 문장" } }, required: ["fact"] },
        },
      },
      run: (args) => {
        const fact = String(args.fact ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_FACT)
        if (!fact) return "저장할 내용이 비어 있어요."
        const told = repo.memories(data.chatId, asker.userId).filter((m) => m.kind === "told")
        if (told.length >= MAX_TOLD) return `이미 ${MAX_TOLD}개를 기억하고 있어요. 몇 개를 지운 뒤에 다시 해 주세요.`
        if (told.some((m) => m.text === fact)) return "이미 기억하고 있어요."
        const id = repo.addMemory(data.chatId, asker.userId, fact)
        return `${asker.name}에 대해 기억했어요 (#${id}): ${fact}`
      },
    },
    {
      spec: {
        type: "function",
        function: {
          name: "my_memory",
          description: "질문한 사람에 대해 봇이 이 방에서 기억하는 것 전부 (번호 포함). '내 기억 보여줘', '나에 대해 뭐 알아?' 같은 질문에.",
          parameters: { type: "object", properties: {} },
        },
      },
      run: () => memoryLines(repo.memories(data.chatId, asker.userId)),
    },
    {
      spec: {
        type: "function",
        function: {
          name: "forget",
          description: "질문한 사람의 기억을 지움. ids에 my_memory의 번호를 주거나, 전부 지우려면 all=true. 어떤 걸 지울지 애매하면 먼저 my_memory로 확인.",
          parameters: {
            type: "object",
            properties: { ids: { type: "array", items: { type: "integer" } }, all: { type: "boolean" } },
          },
        },
      },
      run: (args) => {
        const all = args.all === true
        const ids = Array.isArray(args.ids) ? args.ids.map(Number).filter(Number.isInteger) : []
        if (!all && !ids.length) return "지울 번호(ids)나 all=true가 필요해요."
        const removed = repo.forgetMemories(data.chatId, asker.userId, all ? null : ids)
        return removed ? `${removed}개를 잊었어요.` : "지울 기억이 없었어요. 번호가 이 사람 것인지 my_memory로 확인하세요."
      },
    },
    {
      spec: {
        type: "function",
        function: {
          name: "person_memory",
          description: "이 방의 다른 사람에 대해 봇이 기억하는 것 (그 사람이 기억해 달라고 한 것과 대화에서 정리한 메모)",
          parameters: { type: "object", properties: { person: { type: "string" } }, required: ["person"] },
        },
      },
      run: (args) => {
        const found = findPerson(data, args.person)
        if (typeof found === "string") return found
        return `${found.name}:\n${memoryLines(repo.memories(data.chatId, found.userId))}`
      },
    },
  ]
}
