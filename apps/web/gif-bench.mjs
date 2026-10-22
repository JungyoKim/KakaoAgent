import sharp from "sharp"
import { decryptEmoticon } from "D:/Users/G433m/Documents/kakao-agent/apps/server/src/bot/emoticon"
const env = await Bun.file("D:/Users/G433m/Documents/kakao-agent/.env.local").text()
const get = (k) => env.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim()
const iris = (path, body) => fetch(get("IRIS_URL") + path, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + get("IRIS_TOKEN") }, body: JSON.stringify(body) })
for (const path of ["4442496.emot_001.webp", "4448613.emot_007.webp"]) {
  let t = performance.now()
  const raw = Buffer.from(await (await fetch("https://item.kakaocdn.net/dw/" + path)).arrayBuffer())
  const tFetch = performance.now() - t
  const data = decryptEmoticon(raw)
  const variants = { "effort7": { effort: 7, loop: 0 }, "effort1": { effort: 1, loop: 0 }, "effort1-c128-nodither": { effort: 1, loop: 0, colours: 128, dither: 0 } }
  const row = [path, "fetch " + Math.round(tFetch) + "ms", "webp " + raw.length]
  for (const [name, opts] of Object.entries(variants)) {
    t = performance.now()
    const gif = await sharp(data, { animated: true }).gif(opts).toBuffer()
    row.push(name + " " + Math.round(performance.now() - t) + "ms " + gif.length)
  }
  console.log(row.join(" | "))
}
if (process.argv[2] === "send") {
  const raw = Buffer.from(await (await fetch("https://item.kakaocdn.net/dw/4442496.emot_001.webp")).arrayBuffer())
  const gif = await sharp(decryptEmoticon(raw), { animated: true }).gif({ effort: 1, loop: 0 }).toBuffer()
  const last = async () => (await (await iris("/query", { query: "SELECT MAX(_id) AS id FROM chat_logs WHERE chat_id = 284735378053547" })).json()).data[0].id
  const before = await last()
  const t0 = performance.now()
  const r = await iris("/reply", { type: "image", room: "284735378053547", data: gif.toString("base64") })
  const tHttp = performance.now() - t0
  await r.text()
  let tSeen = null
  for (let i = 0; i < 40; i++) { if ((await last()) !== before) { tSeen = performance.now() - t0; break } await Bun.sleep(250) }
  console.log("image send: http", Math.round(tHttp) + "ms", "visible in chat", tSeen === null ? "not yet" : Math.round(tSeen) + "ms", "status", r.status)
}
