import { existsSync } from "node:fs"
import path from "node:path"
import { Hono, type Context } from "hono"
import { serveStatic } from "hono/bun"
import { createApi } from "./api"
import { Bot } from "./bot/bot"
import { config } from "./config"
import { openDb } from "./db"
import { Repo } from "./repo"
import { createSetupToken, ownerSetupNeeded } from "./setup"

const repo = new Repo(openDb(path.join(config.dataDir, "kakao-agent.db")))

const linkBase = config.publicUrl || `http://localhost:${config.port}`
if (ownerSetupNeeded(repo)) {
  console.log(`[boot] no owner account yet. Open this one-time link and sign in with Kakao as the owner:\n[boot]   ${linkBase}/setup/${createSetupToken(repo)}`)
}
if (!config.kakaoRestApiKey) console.warn("[boot] KAKAO_REST_API_KEY is not set: nobody can sign in")

const bot = new Bot(repo, config)
await bot.start()

const app = new Hono()
app.get("/healthz", (c) => c.json({ ok: true, iris: bot.connected }))
app.route("/api", createApi(repo, bot))

if (existsSync(config.webDist)) {
  const root = path.relative(process.cwd(), config.webDist) || "."
  // Hashed build files never change; the service worker, manifest, version file and page must be
  // revalidated every time or installed apps would not notice a new version.
  const cacheControl = (file: string) => {
    const name = path.basename(file)
    if (file.replaceAll("\\", "/").includes("/_app/immutable/") || /^workbox-[\w-]+\.js$/.test(name)) return "public, max-age=31536000, immutable"
    if (name === "sw.js" || name === "index.html" || name === "version.json" || name.endsWith(".webmanifest")) return "no-cache"
    return "public, max-age=86400"
  }
  const onFound = (file: string, c: Context) => c.header("Cache-Control", cacheControl(file))
  app.use("*", serveStatic({ root, onFound }))
  app.get("*", serveStatic({ root, path: "index.html", onFound }))
} else {
  console.warn(`[boot] web build not found at ${config.webDist} (run: bun run build)`)
}

const server = Bun.serve({ port: config.port, fetch: app.fetch, idleTimeout: 60 })
console.log(`[boot] kakao-agent listening on http://localhost:${server.port}`)

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    bot.stop()
    server.stop()
    repo.db.close()
    process.exit(0)
  })
}
