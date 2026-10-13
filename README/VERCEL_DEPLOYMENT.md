# Vercel 배포 설정

이 프로젝트는 Vite SPA와 `/api/agent/*` Vercel Function을 함께 배포합니다.

## Git 연결

- Repository: `oljuyeon/baemin-cs-ai-agent`
- Production Branch: `main`
- Framework Preset: `Vite`
- Root Directory: `./`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `dist`

Vercel의 `Settings → Environments → Production → Branch Tracking`에서 Production
Branch가 `main`인지 확인합니다. 다른 브랜치는 Preview Deployment로 사용합니다.

## 환경변수

Vercel `Settings → Environment Variables`에 다음 값을 등록합니다.

- `OPENAI_API_KEY`: 프로젝트용 OpenAI API 키
- `OPENAI_MODEL`: 선택 사항. 생략하면 `gpt-5.4-mini`를 사용합니다.

API 키에 `VITE_` 접두사를 붙이지 않습니다. 이 값은 Vercel Function에서만 읽으며
브라우저 번들에 포함하지 않습니다. 환경변수는 Production과 Preview 중 필요한 환경을
선택해서 등록합니다.

## 배포 확인

배포가 끝나면 다음을 확인합니다.

1. `/api/agent/health`가 JSON을 반환하고 `configured`가 `true`인지 확인합니다.
2. `/customer`, `/merchant`, `/cs`, `/agent-logs`를 주소창에서 직접 열고 새로고침합니다.
3. 고객 화면에서 일반 문장을 보내 AI 응답 또는 규칙 기반 대체 흐름이 동작하는지 확인합니다.
4. 3MB 이하 사진을 첨부해 증빙 분석 요청이 정상 처리되는지 확인합니다.

`vercel.json`의 SPA rewrite가 직접 경로 접근을 `index.html`로 연결합니다. `/api` 아래의
파일 시스템 함수는 Vercel 라우팅에서 정적 SPA rewrite보다 먼저 처리됩니다.
