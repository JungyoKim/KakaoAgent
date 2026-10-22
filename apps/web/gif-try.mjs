import sharp from "sharp"
const KEY = Buffer.from("a271730728cbe141e47fd9d677e9006d")
function decrypt(data) {
  const out = Buffer.from(data)
  const k = Buffer.concat([KEY, KEY])
  const s = [0, 0, 0]
  for (let i = 0; i < 4; i++) { s[0] = ((s[0] << 8) | k[i]) >>> 0; s[1] = ((s[1] << 8) | k[4 + i]) >>> 0; s[2] = ((s[2] << 8) | k[8 + i]) >>> 0 }
  for (let n = 0; n < Math.min(128, out.length); n++) {
    let flag1 = 1, flag2 = 0, res = 0
    for (let b = 0; b < 8; b++) {
      const aa = s[0] >>> 1
      if (s[0] & 1) {
        s[0] = (aa ^ 0xc0000031) >>> 0
        const bb = s[1] >>> 1
        flag1 = s[1] & 1
        s[1] = flag1 ? ((bb | 0xc0000000) ^ 0x20000010) >>> 0 : (bb & 0x3fffffff) >>> 0
      } else {
        s[0] = aa
        const c = s[2] >>> 1
        flag2 = s[2] & 1
        s[2] = flag2 ? ((c | 0xf0000000) ^ 0x8000001) >>> 0 : (c & 0xfffffff) >>> 0
      }
      res = (flag1 ^ flag2) | (res << 1)
    }
    out[n] = (res ^ out[n]) & 0xff
  }
  return out
}
const env = await Bun.file("D:/Users/G433m/Documents/kakao-agent/.env.local").text()
const get = (k) => env.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim()
const raw = Buffer.from(await (await fetch("https://item.kakaocdn.net/dw/4442496.emot_001.webp")).arrayBuffer())
const webp = decrypt(raw)
console.log("head", JSON.stringify(webp.subarray(0, 16).toString("latin1")))
const meta = await sharp(webp, { animated: true }).metadata()
console.log("frames", meta.pages, meta.width, meta.pageHeight, "delay", JSON.stringify(meta.delay?.slice(0, 4)), "loop", meta.loop)
const gif = await sharp(webp, { animated: true }).gif({ effort: 7 }).toBuffer()
console.log("gif", gif.length)
await Bun.write("C:/Users/G433m/AppData/Local/Temp/emot-test.gif", gif)
if (process.argv[2] === "send") {
  const r = await fetch(get("IRIS_URL") + "/reply", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + get("IRIS_TOKEN") }, body: JSON.stringify({ type: "image", room: "284735378053547", data: gif.toString("base64") }) })
  console.log("send", r.status, (await r.text()).slice(0, 150))
}
