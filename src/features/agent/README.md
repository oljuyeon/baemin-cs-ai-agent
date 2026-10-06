# Agent Loop - Demo B

이 폴더는 공통 `CsCase`, `caseStore`, `agentTools`를 사용해 담당자 A의
Dynamic Agent Loop를 구현한다.

`remoteAgent.ts`는 OpenAI Responses API 중계 경로를 통해 고객 문장과 다음 Agent
행동을 구조화해 받는다. API 오류, 시간 초과, Policy·Risk 위반 행동이면 `nlu.ts`와
`decisionEngine.ts`의 규칙 기반 판단으로 자동 전환한다. 빠른 선택은 자연어 결과가
없거나 동률일 때만 보조 힌트로 사용한다.

OpenAI에는 고객 입력 문장, Mock 메뉴명·가격, 배달 상태·지연 시간, Policy 허용
Action, Risk 차단 Action, Tool 성공 여부만 전달한다. 고객·주문·매장 ID, 전체 CS
이력, 증빙 URL과 이미지는 보내지 않으며 Responses 저장은 끈다. Tool 입력은 모델이
만들지 않고 로컬 Controller가 검증된 Case에서 구성한다.

API 키는 `.env`의 `OPENAI_API_KEY`로만 읽고 브라우저 번들에 넣지 않는다. 현재 API
중계는 `server/agentApiPlugin.ts`에서 Vite 개발 서버 middleware로 제공한다. 규칙
기반 PoC는 API 키 없이도 실행되며, 실제 배포 전에는 같은 계약의 별도 서버
endpoint로 옮겨야 한다.
