import { describe, expect, test } from "bun:test"
import { openDb } from "../db"
import { Repo, type StoredMessage } from "../repo"
import { periodStart, RoomData, startOfDayKst } from "./room-data"

const ROOM_A = "1000"
const ROOM_B = "2000"
const T0 = Date.UTC(2026, 9, 20, 3, 0) // 2026-10-20 12:00 KST

let nextId = 1
function msg(chatId: string, userId: string, text: string, at = T0): StoredMessage {
  return { logId: nextId++, serverId: null, chatId, userId, type: 1, kind: "텍스트", text, attachment: null, createdAt: at }
}

function setup() {
  const repo = new Repo(openDb(":memory:"))
  repo.saveMessages([
    msg(ROOM_A, "1", "오늘 점심 햄버거 어때"),
    msg(ROOM_A, "2", "햄버거 좋지"),
    msg(ROOM_A, "1", "그럼 12시에 보자", T0 + 60_000),
    msg(ROOM_B, "1", "비밀: 햄버거 말고 점심은 초밥"),
    msg(ROOM_B, "3", "동생방 이야기"),
  ])
  repo.setAlias("1", "준교")
  const data = (chatId: string) => new RoomData(repo.db, chatId, (ids) => repo.kakaoNames(ids))
  return { repo, a: data(ROOM_A), b: data(ROOM_B) }
}

describe("RoomData stays inside its room", () => {
  test("search never returns another room's messages", () => {
    const { a, b } = setup()
    expect(a.search({ query: "햄버거" }).map((h) => h.text)).toEqual(["햄버거 좋지", "오늘 점심 햄버거 어때"])
    // Two-letter words use the substring fallback, still inside the room.
    expect(a.search({ query: "점심" }).map((h) => h.text)).toEqual(["오늘 점심 햄버거 어때"])
    expect(b.search({ query: "햄버거 점심" }).map((h) => h.text)).toEqual(["비밀: 햄버거 말고 점심은 초밥"])
    expect(a.search({ query: "초밥" })).toEqual([])
    expect(a.search({ query: "햄버거", userId: "2" }).map((h) => h.name)).toEqual(["(UID: 2)"])
  })

  test("stats and a person's messages count one room only", () => {
    const { a } = setup()
    const stats = a.stats()
    expect(stats.total).toBe(3)
    expect(stats.people).toEqual([
      { userId: "1", name: "준교", count: 2 },
      { userId: "2", name: "(UID: 2)", count: 1 },
    ])
    expect(stats.hours[12]).toBe(3)
    expect(stats.days).toEqual([{ date: "2026-10-20", count: 3 }])
    expect(a.person("1").map((h) => h.text)).toEqual(["오늘 점심 햄버거 어때", "그럼 12시에 보자"])
  })

  test("an edited message is found by its new words", () => {
    const { repo, a } = setup()
    const [hit] = a.search({ query: "좋지" })
    repo.updateMessageText(Number(hit!.logId), "햄버거 별로야 피자 먹자")
    expect(a.search({ query: "피자" }).map((h) => h.text)).toEqual(["햄버거 별로야 피자 먹자"])
    expect(a.search({ query: "좋지" })).toEqual([])
  })

  test("periods are whole days in Korea time", () => {
    const at = Date.UTC(2026, 9, 20, 16, 30) // 2026-10-21 01:30 KST
    expect(new Date(startOfDayKst(at)).toISOString()).toBe("2026-10-20T15:00:00.000Z")
    expect(new Date(periodStart(7, at)!).toISOString()).toBe("2026-10-14T15:00:00.000Z")
    expect(periodStart(0, at)).toBeNull()
  })
})

describe("room visibility", () => {
  test("a 1:1 chat is hidden from members until the owner shows it", () => {
    const repo = new Repo(openDb(":memory:"))
    repo.createUser({ displayName: "준교", role: "owner" })
    const member = repo.createUser({ displayName: "친구", role: "member" })
    const group = repo.createRoom({ chatId: ROOM_A, name: "단톡", kind: "group" })
    const direct = repo.createRoom({ chatId: ROOM_B, name: "동생", kind: "direct" })
    expect([...repo.usableRoomIds(member.id)]).toEqual([group.id])
    repo.updateRoom(direct.id, { memberVisible: true })
    expect(repo.usableRoomIds(member.id).has(direct.id)).toBe(true)
  })
})
