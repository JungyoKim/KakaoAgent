import { describe, expect, test } from "bun:test"
import { openDb } from "../db"
import { IrisClient } from "../iris/client"
import { Repo } from "../repo"
import { Outbox } from "./outbox"

const TEST_ROOM = "284735378053547"
const MAIN_ROOM = "480460285206211"

/** An Iris client that records sends instead of talking to a server. */
class FakeIris extends IrisClient {
  sent: { chatId: string; text: string }[] = []
  constructor() {
    super("127.0.0.1:1")
  }
  override async sendText(chatId: string, text: string) {
    this.sent.push({ chatId, text })
    return "sent" as const
  }
}

function outbox(sendRooms: string[], mode: "live" | "dry" = "live") {
  const iris = new FakeIris()
  const repo = new Repo(openDb(":memory:"))
  return { iris, repo, box: new Outbox(iris, repo, mode, sendRooms, () => {}) }
}

describe("Outbox", () => {
  test("SEND_ROOMS keeps every send inside the allowed rooms", async () => {
    const { iris, box } = outbox([TEST_ROOM])
    await box.sendText(TEST_ROOM, "안녕")
    await expect(box.sendText(MAIN_ROOM, "안녕")).rejects.toThrow("SEND_ROOMS")
    expect(iris.sent).toEqual([{ chatId: TEST_ROOM, text: "안녕" }])
    expect(box.canSend(MAIN_ROOM)).toBe(false)
  })

  test("an empty SEND_ROOMS allows every room", async () => {
    const { iris, box } = outbox([])
    await box.sendText(MAIN_ROOM, "안녕")
    expect(iris.sent).toHaveLength(1)
  })

  test("dry mode and the pause switch send nothing", async () => {
    const dry = outbox([TEST_ROOM], "dry")
    await dry.box.sendText(TEST_ROOM, "연습")
    expect(dry.iris.sent).toHaveLength(0)

    const paused = outbox([TEST_ROOM])
    paused.repo.setSetting("paused", true)
    await expect(paused.box.sendText(TEST_ROOM, "멈춤")).rejects.toThrow("일시 정지")
    expect(paused.iris.sent).toHaveLength(0)
  })

  test("the room limit stops a runaway loop", async () => {
    const { iris, repo, box } = outbox([TEST_ROOM])
    repo.setSetting("limits", { roomPerMinute: 3, globalPerMinute: null })
    for (let i = 0; i < 3; i++) await box.sendText(TEST_ROOM, `${i}`)
    await expect(box.sendText(TEST_ROOM, "넷")).rejects.toThrow("1분에 3개")
    expect(iris.sent).toHaveLength(3)
  })

  test("the bot's own sends are recognised once each", async () => {
    const { box } = outbox([TEST_ROOM])
    await box.sendText(TEST_ROOM, "메아리")
    expect(box.isEcho(TEST_ROOM, "메아리")).toBe(true)
    expect(box.isEcho(TEST_ROOM, "메아리")).toBe(false)
  })
})
