# Agent Loop - Demo B

이 폴더는 공통 `CsCase`, `caseStore`, `agentTools`를 사용해 담당자 A의
Dynamic Agent Loop를 구현한다.

현재 범위는 저가 메뉴 누락 Demo B다. `decisionEngine.ts`는 Demo ID나 고정
Tool 배열을 사용하지 않고 Case에 없는 Observation을 기준으로 다음 행동을
고른다. Customer 화면에서는 `missing_item`만 Agent Loop를 실행하며 다른 문의는
기존처럼 Case 저장까지만 수행한다.

최종 LLM 연결 시 서버 측 판단 API가 구조화된 `AgentAction`을 반환하도록
`decisionEngine.ts`를 교체한다. Controller, Tool 실행, Case와 이력 저장은 그대로
재사용한다. API 키는 브라우저 번들에 넣지 않는다.
