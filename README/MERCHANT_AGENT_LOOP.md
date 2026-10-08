# Merchant-Agent Loop 연결

> 적용 브랜치: `codex/customer-merchant-loop-fix`
>
> 최종 수정일: `2026-10-06 KST`

이 문서는 점주 화면에서 저장한 답변을 같은 `CsCase`의 Agent Loop로 다시
전달하는 연결 흐름을 설명한다. 데이터 형식, 상태값, Tool, Policy, Risk와
Guardrail은 [`COMMON_AGENT_CONTRACT.md`](./COMMON_AGENT_CONTRACT.md) `ver4.3`을
우선한다. 이 기능은 공통 계약을 변경하지 않는다.

## 구현 목적

기존 점주 화면은 구조화된 선택과 추가 설명을 `MerchantConfirmationData`에
저장했지만, 저장된 답변을 Agent가 검토하고 본 Loop를 다시 실행하는 연결은 없었다.

이 브랜치는 다음 접점을 추가한다.

```text
점주가 선택 또는 직접 답변 저장
→ 필요하면 추가 설명이나 선택 정정 입력
→ 에이전트에게 답변 제출
→ Agent가 구조화 응답과 대화를 검토
→ 부족하거나 충돌하면 점주에게 후속 질문
→ 충분하면 Merchant Confirmation 완료
→ Policy·Risk 재조회
→ 같은 caseId의 Agent Loop 재실행
→ 자동 처리 또는 Human CS 이관
```

## 화면과 Agent의 책임

### 점주 화면

- 구조화된 `MerchantResponse` 선택 저장
- 선택 없이 입력한 직접 답변과 추가 설명 저장
- `에이전트에게 답변 제출` 버튼 제공
- Agent 후속 질문을 기존 점주 대화창에 표시
- Agent 판단 로직을 직접 소유하지 않고 `caseId`만 연결 모듈에 전달

### Merchant-Agent 연결 모듈

- 선택 없이 입력한 자연어를 `MerchantResponse`로 구조화
- 선택값과 추가 설명이 충돌하면 변경 의사 재확인
- `DENIED`, `UNKNOWN`에 필요한 추가 근거 질문
- 충분한 답변에만 `completeMerchantConfirmation()` 호출
- Merchant 답변 이후 `get_policy`, `check_risk` 결과 갱신
- `agentController.runNextStep(caseId)`로 본 Loop 재개

## 주요 파일

| 파일 | 역할 |
| --- | --- |
| `src/features/agent/merchantFlow.ts` | 점주 응답 검토, 후속 질문, 확인 완료와 Loop 재개 |
| `src/features/agent/index.ts` | Merchant 연결 모듈 공개 |
| `src/pages/MerchantPage.tsx` | 점주 화면과 연결 모듈 연결 |
| `src/components/merchant/RequestDetail.tsx` | 답변 저장·추가 설명·Agent 제출 UI |
| `src/locales/ko/merchant.json` | 한국어 제출·처리 문구 |
| `src/locales/en/merchant.json` | 영어 제출·처리 문구 |
| `src/styles/merchant.css` | Agent 제출 영역 스타일 |

## 응답 처리 기준

- `CONFIRMED`, `POSSIBLE`은 추가 충돌이 없으면 확인을 완료할 수 있다.
- `DENIED`는 포장 기록이나 담당자 확인 등 판단 근거를 한 번 더 요청한다.
- `UNKNOWN`은 확인 가능한 기록이나 담당 직원의 확인 결과가 있는지 한 번 더 요청한다.
- 선택과 설명의 의미가 다르면 기존 선택을 자동으로 덮어쓰지 않는다.
- 점주가 변경 의사를 확인한 경우에만 구조화 응답을 수정한다.
- 후속 질문 중에는 Case를 `WAITING_MERCHANT`, Merchant Confirmation을 `waiting`으로 유지한다.
- 확인 완료 전의 점주 답변만으로 환불·재배달·Human CS 이관을 확정하지 않는다.

## 로컬 확인 방법

```bash
npm ci
npm run dev
```

같은 브라우저에서 아래 화면을 각각 연다.

- Customer: `http://127.0.0.1:5174/customer`
- Merchant: `http://127.0.0.1:5174/merchant`
- Human CS: `http://127.0.0.1:5174/cs`

확인 순서:

1. Customer에서 메뉴 누락 Case를 만든다.
2. `매장에 확인 요청`을 선택한다.
3. Merchant의 치킨하우스 Queue에서 같은 주문을 연다.
4. 빠른 답변을 선택하고 필요하면 추가 설명을 입력한다.
5. `에이전트에게 답변 제출`을 누른다.
6. 후속 질문 또는 Agent Loop의 다음 상태를 확인한다.
7. `ESCALATED`가 되면 Human CS Queue에서 같은 `caseId`를 확인한다.

## 현재 제한사항

- 저장소가 브라우저 `localStorage` 기반이므로 같은 브라우저와 같은 Origin에서 확인해야 한다.
- Customer 화면은 이동 후 활성 `caseId`와 대화를 자동 복원하지 않는다.
- Customer 화면의 Case 구독과 점주·Human CS 결과 실시간 반영은 별도 작업이다.
- 점주 자연어 구조화와 충돌 확인은 현재 한국어 규칙 기반 PoC다.
- OpenAI API가 없어도 기존 규칙 기반 Agent Loop로 동작한다.
- 주문·배달·환불·재배달은 실제 외부 시스템이 아닌 Mock 데이터와 Mock Action이다.
