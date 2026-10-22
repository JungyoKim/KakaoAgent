import { describe, expect, test } from "bun:test"
import { decryptEmoticon, emoticonPath } from "./emoticon"

// The first 32 bytes of 4442496.emot_001.webp as the emoticon CDN serves it.
const SCRAMBLED = Buffer.from("b5e4041d9aba851931077e1431dd7ce044581ce9d1da1c50204def374b8b8185", "hex")

describe("emoticons", () => {
  test("an animated emoticon unscrambles into a WebP file", () => {
    const plain = decryptEmoticon(SCRAMBLED)
    expect(plain.subarray(0, 4).toString("latin1")).toBe("RIFF")
    expect(plain.subarray(8, 16).toString("latin1")).toBe("WEBPVP8X")
    // The same XOR scrambles it back.
    expect(decryptEmoticon(plain).equals(SCRAMBLED)).toBe(true)
  })

  test("only emoticon file names are taken from attachments", () => {
    expect(emoticonPath({ emoticonItemPath: "4442496.emot_001.webp", path: "x" })).toBe("4442496.emot_001.webp")
    expect(emoticonPath({ path: "2225739.emot_023.png" })).toBe("2225739.emot_023.png")
    expect(emoticonPath({ path: "../../etc/passwd" })).toBeNull()
    expect(emoticonPath(null)).toBeNull()
  })
})
