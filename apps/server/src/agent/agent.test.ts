import { describe, expect, test } from "bun:test"
import type { BotMessage } from "../bot/events"
import { openDb } from "../db"
import { Repo } from "../repo"
import { Agent, isForgetAll, isShowMemory, parseCommand, plainText } from "./agent"
import type { ChatFn, ChatMessage } from "./llm"

const TEST_ROOM = "284735378053547"
const MAIN_ROOM = "480460285206211"

function message(chatId: string, text: string, extra: Partial<BotMessage> = {}): BotMessage {
  return {
    room: { id: "1", chatId, name: chatId === TEST_ROOM ? "김민교" : "겅슥아 미안해" },
    logId: "9999",
    serverId: null,
    time: new Date(),
    text,
    sender: "준교",
    senderId: "1",
    type: 1,
    kind: "텍스트",
    imageUrls: [],
    fileNames: [],
    attachment: null,
    attachmentRaw: null,
    fromBot: false,
    ...extra,
  }
}

function setup(chat: ChatFn) {
  const repo = new Repo(openDb(":memory:"))
  let id = 1
  const save = (chatId: string, userId: string, text: string) =>
    repo.saveMessages([{ logId: id++, serverId: null, chatId, userId, type: 1, kind: "텍스트", text, attachment: null, createdAt: Date.now() - 60_000 }])
  save(TEST_ROOM, "2", "오늘 점심은 햄버거 먹자")
  save(MAIN_ROOM, "3", "비밀인데 햄버거 싫어")
  repo.setAlias("2", "김민교")
  repo.setAlias("3", "다른방사람")
  const sent: { chatId: string; text: string }[] = []
  const agent = new Agent({
    repo,
    send: async (chatId, text) => void sent.push({ chatId, text }),
    canSend: (chatId) => chatId === TEST_ROOM,
    chat,
    command: "/bot",
    log: () => {},
  })
  return { repo, agent, sent }
}

describe("parseCommand and plainText", () => {
  test("only /bot followed by a space or nothing", () => {
    expect(parseCommand("/bot 통계 알려줘", "/bot")).toBe("통계 알려줘")
    expect(parseCommand("  /BOT   안녕 ", "/bot")).toBe("안녕")
    expect(parseCommand("/bot", "/bot")).toBe("")
    expect(parseCommand("/bothello", "/bot")).toBeNull()
    expect(parseCommand("봇아 안녕", "/bot")).toBeNull()
  })

  test("markdown marks are taken out for KakaoTalk", () => {
    expect(plainText("## 결과\n**민교**가 1등\n\n\n\n`끝`")).toBe("결과\n민교가 1등\n\n끝")
  })

  test("plain memory requests are recognised, remember requests are not", () => {
    for (const q of ["내 기억 보여줘", "나에 대해 뭐 기억해?", "내 메모 알려줘", "나에 대한 기억 목록"]) expect(isShowMemory(q)).toBe(true)
    for (const q of ["나 시험이라고 기억해 줘", "내 기억 지워줘", "민교 성격 어때?", "이번 주 통계"]) expect(isShowMemory(q)).toBe(false)
    for (const q of ["기억 다 지워줘", "나에 대한 거 전부 잊어줘", "내 메모 싹 지워"]) expect(isForgetAll(q)).toBe(true)
    for (const q of ["시험 기억만 지워줘", "내 기억 보여줘", "다 같이 밥 먹자"]) expect(isForgetAll(q)).toBe(false)
  })
})

describe("Agent", () => {
  test("answers in the room it was asked in, with tools that only see that room", async () => {
    const seen: string[] = []
    const chat: ChatFn = async ({ messages }) => {
      const last = messages.at(-1) as ChatMessage
      if (last.role === "tool") {
        seen.push(last.content)
        return { message: { content: "**민교**가 햄버거 먹자고 했어요" }, model: "fake", usage: { prompt: 10, completion: 5 } }
      }
      return {
        message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "search_messages", arguments: '{"query":"햄버거"}' } }] },
        model: "fake",
        usage: { prompt: 20, completion: 5 },
      }
    }
    const { repo, agent, sent } = setup(chat)
    agent.handle(message(TEST_ROOM, "/bot 누가 햄버거 얘기했어?"))
    await agent.idle()
    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain("김민교: 오늘 점심은 햄버거 먹자")
    expect(seen[0]).not.toContain("비밀")
    expect(sent).toEqual([{ chatId: TEST_ROOM, text: "🤖 민교가 햄버거 먹자고 했어요" }])
    const [turn] = repo.agentTurns(1)
    expect(turn).toMatchObject({ question: "누가 햄버거 얘기했어?", answer: "민교가 햄버거 먹자고 했어요", model: "fake", promptTokens: 30, error: null })
    expect(turn!.tools.map((t) => t.name)).toEqual(["search_messages"])
  })

  test("rooms outside SEND_ROOMS, the bot's own messages and plain chat are ignored", async () => {
    let calls = 0
    const { agent, sent } = setup(async () => {
      calls++
      return { message: { content: "답" }, model: "fake", usage: { prompt: 1, completion: 1 } }
    })
    agent.handle(message(MAIN_ROOM, "/bot 안녕"))
    agent.handle(message(TEST_ROOM, "/bot 안녕", { fromBot: true }))
    agent.handle(message(TEST_ROOM, "그냥 대화"))
    await agent.idle()
    expect(calls).toBe(0)
    expect(sent).toEqual([])
  })

  test("a failing model still gets a short reply and is recorded", async () => {
    const { repo, agent, sent } = setup(async () => {
      throw new Error("LLM 503: busy")
    })
    agent.handle(message(TEST_ROOM, "/bot 안녕"))
    await agent.idle()
    expect(sent[0]!.text).toStartWith("🤖 지금은 답을 만들지 못했어요")
    expect(repo.agentTurns(1)[0]!.error).toBe("LLM 503: busy")
  })

  test("when the model gives out after saving a memory, the save itself is the reply", async () => {
    let step = 0
    const { repo, agent, sent } = setup(async () => {
      if (step++ === 0) {
        return {
          message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "remember", arguments: '{"fact":"봇 테스트 중"}' } }] },
          model: "fake",
          usage: { prompt: 1, completion: 1 },
        }
      }
      throw new Error("The operation timed out.")
    })
    agent.handle(message(TEST_ROOM, "/bot 나 봇 테스트 중이라고 기억해 줘"))
    await agent.idle()
    expect(sent[0]!.text).toMatch(/^🤖 준교에 대해 기억했어요 \(#\d+\): 봇 테스트 중$/)
    expect(repo.memories(TEST_ROOM, "1").map((m) => m.text)).toEqual(["봇 테스트 중"])
  })

  test("an answer that drifts into Japanese is rewritten in Korean", async () => {
    let call = 0
    const { agent, sent } = setup(async () => {
      call++
      return { message: { content: call === 1 ? "テストの記憶を削除했어" : "테스트 기억을 지웠어" }, model: "fake", usage: { prompt: 1, completion: 1 } }
    })
    agent.handle(message(TEST_ROOM, "/bot 안녕"))
    await agent.idle()
    expect(call).toBe(2)
    expect(sent).toEqual([{ chatId: TEST_ROOM, text: "🤖 테스트 기억을 지웠어" }])
  })

  test("showing and wiping your memories needs no model", async () => {
    let calls = 0
    const { repo, agent, sent } = setup(async () => {
      calls++
      throw new Error("not used")
    })
    repo.addMemory(TEST_ROOM, "1", "봇 테스트 중")
    agent.handle(message(TEST_ROOM, "/bot 내 기억 보여줘"))
    agent.handle(message(TEST_ROOM, "/bot 기억 다 지워줘"))
    agent.handle(message(TEST_ROOM, "/bot 내 기억 보여줘"))
    await agent.idle()
    expect(calls).toBe(0)
    expect(sent.map((s) => s.text)).toEqual([
      expect.stringMatching(/^🤖 준교에 대해 기억하는 것\n• 봇 테스트 중 \(#\d+\)$/),
      "🤖 준교에 대해 기억하던 1개를 모두 잊었어요.",
      expect.stringContaining("아직 준교에 대해 기억하는 게 없어요"),
    ])
  })
})
