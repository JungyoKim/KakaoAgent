# kakao-agent

카카오톡 봇에 LLM 에이전트를 붙이는 프로젝트입니다. 기존 KakaoBot(삭제·수정 알림 등)은 그대로 두고, 이 서비스가 Iris 이벤트 스트림에 별도 클라이언트로 붙어 동작합니다. 웹 화면은 jungyobot의 디자인과 카카오 로그인을 가져왔고 폰트는 Pretendard입니다.

```
Iris (LXC 120)  ──/ws (client=kakao-agent)──▶  kakao-agent (Dokploy Compose)
   ▲                                             ├─ 봇: 이벤트 정리 → 기능 실행 → 보내기(SEND_ROOMS 안에서만)
   └────────────── /reply, /query ───────────────├─ API (Hono) + 카카오 로그인/권한
                                                 ├─ 웹 (SvelteKit SPA + shadcn-svelte, PWA)
                                                 └─ SQLite (/app/data)
```

## 구조

| 경로 | 내용 |
|---|---|
| `packages/shared` | 서버와 웹이 함께 쓰는 API 타입 |
| `apps/server` | Bun 서버: Iris 연결, 이벤트 정리, 보내기 통로(Outbox), API |
| `apps/web` | SvelteKit 웹 앱: 홈, 방·멤버·이름·시스템 설정 |

## 개발

```powershell
bun install
# 루트의 .env.local에 IRIS_URL, IRIS_TOKEN, KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET (git에 안 올라감)
$env:PORT="8787"; $env:DATA_DIR="./data/dev"; $env:SEND_MODE="dry"
bun run dev:server
bun run dev:web   # 다른 터미널, /api는 8787로 프록시
```

- 테스트: `bun test` / 타입 검사: `bun run typecheck`
- 아이콘: `apps/web/static/logo.svg`를 바꾼 뒤 `bun run --cwd apps/web pwa:icons`
- 아이콘 글꼴은 [Framework7 Icons](https://framework7.io/icons/) 이름을 그대로 씁니다.

## 배포 (Dokploy)

Bot 프로젝트의 Compose 앱으로 배포합니다. `main`에 푸시하면 자동으로 다시 배포됩니다. 환경 변수는 `.env.example`을 참고하고, 도메인은 `bot.xenv.cc` → 서비스 `app` 8080입니다.

## 안전장치

- 보내기는 전부 Outbox를 거칩니다. `SEND_ROOMS`에 없는 방, 일시 정지, 분당 한도에 걸리면 보내지 않습니다.
- 봇이 보낸 메시지는 다시 처리되지 않습니다 (답장 무한 루프 방지).
- 삭제·수정 알림은 KakaoBot이 맡고, 이 서비스는 그 이벤트를 다루지 않습니다.
