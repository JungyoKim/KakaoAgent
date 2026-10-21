import { describe, expect, test } from "bun:test"
import { RoomData } from "../data/room-data"
import { openDb } from "../db"
import { Repo } from "../repo"
import { msUntilKstHour } from "./notes"
import { memoryTools } from "./tools"

const ROOM_A = "1000"
const ROOM_B = "2000"

function setup() {
  const repo = new Repo(openDb(":memory:"))
  let id = 1
  for (const [chatId, userId] of [[ROOM_A, "1"], [ROOM_A, "2"], [ROOM_B, "1"]] as const) {
    repo.saveMessages([{ logId: id++, serverId: null, chatId, userId, type: 1, kind: "텍스트", text: "안녕", attachment: null, createdAt: Date.now() }])
  }
  repo.setAlias("1", "준교")
  repo.setAlias("2", "민교")
  const tools = (chatId: string, userId: string, name: string) => {
    const data = new RoomData(repo.db, chatId, (ids) => repo.kakaoNames(ids))
    return Object.fromEntries(memoryTools(repo, data, { userId, name }).map((t) => [t.spec.function.name, t.run]))
  }
  return { repo, tools }
}

describe("memory tools", () => {
  test("a person saves, sees and forgets only their own memories, in one room", () => {
    const { repo, tools } = setup()
    const junA = tools(ROOM_A, "1", "준교")
    expect(junA.remember!({ fact: "다음 주 금요일에 시험" })).toContain("기억했어요")
    expect(junA.remember!({ fact: "다음 주 금요일에 시험" })).toBe("이미 기억하고 있어요.")
    expect(junA.my_memory!({})).toContain("다음 주 금요일에 시험")

    // Another room knows nothing of it.
    expect(tools(ROOM_B, "1", "준교").my_memory!({})).toContain("없음")

    // Someone else can read it (person_memory) but not delete it.
    const minA = tools(ROOM_A, "2", "민교")
    expect(minA.person_memory!({ person: "준교" })).toContain("다음 주 금요일에 시험")
    const [mine] = repo.memories(ROOM_A, "1")
    expect(minA.forget!({ ids: [mine!.id] })).toContain("지울 기억이 없었어요")
    expect(repo.memories(ROOM_A, "1")).toHaveLength(1)

    expect(junA.forget!({ ids: [mine!.id] })).toBe("1개를 잊었어요.")
    expect(repo.memories(ROOM_A, "1")).toEqual([])
  })

  test("forgetting everything takes the nightly note too", () => {
    const { repo, tools } = setup()
    repo.setObservedNote(ROOM_A, "1", "• 게임 이야기를 자주 함")
    const junA = tools(ROOM_A, "1", "준교")
    junA.remember!({ fact: "고양이 키움" })
    expect(junA.my_memory!({})).toContain("게임 이야기를 자주 함")
    expect(junA.forget!({ all: true })).toBe("2개를 잊었어요.")
    expect(repo.memories(ROOM_A, "1")).toEqual([])
  })

  test("the nightly job aims at 4:00 Korea time", () => {
    const at = Date.UTC(2026, 9, 21, 14, 0) // 23:00 KST
    expect(msUntilKstHour(4, at)).toBe(5 * 60 * 60 * 1000)
    const early = Date.UTC(2026, 9, 21, 18, 30) // 03:30 KST
    expect(msUntilKstHour(4, early)).toBe(30 * 60 * 1000)
  })
})
