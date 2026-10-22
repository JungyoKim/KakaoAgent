import { describe, expect, test } from "bun:test"
import { DeletedEmoticons, type DeletedMessage } from "./deleted"

const ROOM = { id: "1", chatId: "284735378053547", name: "김민교" }
const EMOTICON = '{"path":"4442496.emot_001.webp","emoticonItemPath":"4442496.emot_001.webp","type":"animated-sticker/digital-item"}'

function setup(options: { enabled?: boolean; canSend?: boolean; message?: DeletedMessage | null } = {}) {
  const sent: string[] = []
  const deleted = new DeletedEmoticons({
    enabled: () => options.enabled ?? true,
    canSend: () => options.canSend ?? true,
    find: async () => (options.message === undefined ? { userId: "2", text: "", attachment: EMOTICON } : options.message),
    senderName: async () => "김민교",
    fetchImage: async () => ({ data: Buffer.from("GIF89a"), mime: "image/gif" }),
    sendText: async (_chatId, text) => void sent.push(text),
    sendImage: async (_chatId, base64) => void sent.push("image:" + Buffer.from(base64, "base64").toString()),
    log: () => {},
  })
  return { deleted, sent }
}

describe("deleted emoticons", () => {
  test("KakaoBot's alert word for word, then the emoticon as a GIF, once", async () => {
    const { deleted, sent } = setup()
    await deleted.handle(ROOM, "3956")
    await deleted.handle(ROOM, "3956")
    expect(sent).toEqual(["🗑️ 삭제된 메시지\n👤 김민교: [이모티콘] 팩 4442496 #1", "image:GIF89a"])
  })

  test("a caption is kept in brackets, as KakaoBot does", async () => {
    const { deleted, sent } = setup({ message: { userId: "2", text: "ㅋㅋ", attachment: EMOTICON } })
    await deleted.handle(ROOM, "1")
    expect(sent[0]).toBe("🗑️ 삭제된 메시지\n👤 김민교: [이모티콘] 팩 4442496 #1 (ㅋㅋ)")
  })

  test("off by default switch, rooms it may not send to and other deletions send nothing", async () => {
    for (const options of [{ enabled: false }, { canSend: false }, { message: { userId: "2", text: "안녕", attachment: null } }, { message: null }]) {
      const { deleted, sent } = setup(options)
      await deleted.handle(ROOM, "1")
      expect(sent).toEqual([])
    }
  })
})
