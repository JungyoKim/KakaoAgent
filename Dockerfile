# kakao-agent: one container serves the web UI, the API and the bot.
FROM oven/bun:1 AS app
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

COPY . .
RUN cd apps/web && bun run build && test -f dist/index.html

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/app/data \
    WEB_DIST=/app/apps/web/dist
VOLUME ["/app/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD bun -e "fetch('http://localhost:8080/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bun", "apps/server/src/index.ts"]
