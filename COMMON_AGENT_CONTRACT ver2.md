# 배달 플랫폼 CS AI Agent 공통 계약

## 문서 목적

이 문서는 Customer, Merchant, Human CS 화면을 나누어 개발하기 전에 두 담당자가 공통으로 지켜야 할 데이터와 동작 계약을 정의한다.

공통 영역은 Agent가 사용할 수 있는 Case, Mock Data, Tool, Policy, Risk, 저장 기능을 제공한다. Agent가 현재 Case를 보고 다음 행동을 선택하는 Dynamic Agent Loop는 공통 영역에 포함하지 않는다.

기능 기획의 기준은 `배달 플랫폼 CS AI Agent PoC 기획서 틀`이다. 현재 구현된 Customer UI의 짧은 이름은 화면 내부에서 유지할 수 있지만, 화면 사이에서 교환하는 공통 데이터는 이 문서의 이름을 사용한다.

---

## 1 공통 범위

### 공통으로 구현할 것

- 공통 `CsCase` 데이터 계약
- Case 상태와 Agent 결정값
- Mock Customer, Order, Delivery, CS History, Merchant 데이터
- Tool 이름과 입출력 계약
- 엄격한 `ToolResult<T>`
- Case 조회, 변경, 구독, Demo 초기화
- Case 업무 처리 이력 `history`
- Agent Tool 호출 이력 `toolHistory`
- Merchant Confirmation 요청과 응답 저장
- 가상 Policy와 Risk 규칙
- 고객 대화와 증빙 분석의 최소 저장 형식
- 발표용 Demo Case

### 공통으로 구현하지 않을 것

- 문의 유형별 고정 Tool 실행 순서
- 다음 Tool을 선택하는 로직
- Agent 반복 실행문
- 추가 질문이 필요한지 판단하는 로직
- 자동 처리와 상담원 이관을 최종 선택하는 로직
- Customer, Merchant, Human CS 화면의 배치와 디자인
- 컴포넌트와 파일 구조

다음과 같은 고정 Workflow는 공통 영역에 만들지 않는다.

```ts
if (issueType === 'missing_item') {
  await getOrder()
  await getCsHistory()
  await getPolicy()
  await refund()
}
```

공통 영역은 Tool과 Observation을 제공하고, 담당자 A의 Dynamic Agent Loop가 현재 Case를 보고 다음 행동을 선택한다.

---

## 2 현재 UI 값과 공통 값의 연결

현재 Customer 화면에서 사용하는 문의 유형은 유지할 수 있다.

| 현재 Customer UI | 공통 Case 값 |
| --- | --- |
| `delay` | `delivery_delay` |
| `missing` | `missing_item` |
| `wrong` | `wrong_delivery` |

현재 `ready`, `working`, `waiting`, `resolved`는 Customer 화면 표시 상태다. 공통 Case 업무 상태와 섞지 않는다.

```ts
export type AgentUiState = 'ready' | 'working' | 'waiting' | 'resolved'

export type IssueType =
  | 'delivery_delay'
  | 'missing_item'
  | 'wrong_delivery'
  | 'other'
```

---

## 3 공통 상태와 결정값

```ts
export type CaseStatus =
  | 'NEW'
  | 'COLLECTING_INFO'
  | 'WAITING_EVIDENCE'
  | 'CHECKING_DATA'
  | 'WAITING_MERCHANT'
  | 'POLICY_CHECK'
  | 'RISK_CHECK'
  | 'AUTO_RESOLVED'
  | 'ESCALATED'
  | 'CLOSED'

export type AgentDecision =
  | 'AUTO_RESOLVE'
  | 'NEED_MORE_INFO'
  | 'WAITING_MERCHANT'
  | 'ESCALATE'

export type MerchantResponse =
  | 'PACKED'
  | 'POSSIBLE_MISSING'
  | 'UNKNOWN'

export type RiskFlag =
  | 'duplicate_refund'
  | 'frequent_refund'
  | 'order_claim_mismatch'
  | 'evidence_mismatch'

export type FinalAction =
  | 'guide_customer'
  | 'mock_coupon'
  | 'mock_refund'
  | 'mock_redelivery'
  | 'human_review'
  | 'no_action'

export interface ConversationMessage {
  role: 'customer' | 'agent'
  content: string
  createdAt: string
}

export interface EvidenceAnalysis {
  evidenceUrl: string
  observation: string
  limitations: string[]
}
```

---

## 4 Tool 결과 계약

성공했는데 `data`가 없거나 실패했는데 `error`가 없는 결과는 허용하지 않는다.

```ts
export type ToolResult<T> =
  | {
      status: 'success'
      data: T
    }
  | {
      status: 'error'
      error: string
    }
```

사용하는 쪽은 `status`를 확인한 뒤 결과에 접근한다.

```ts
const result = await tools.getOrder({ orderId })

if (result.status === 'error') {
  return result.error
}

return result.data
```

---

## 5 공통 Mock Data

```ts
export interface CustomerData {
  customerId: string
  name: string
  recentOrderCount: number
  refundCount30d: number
}

export interface OrderItem {
  itemId: string
  name: string
  price: number
}

export interface OrderData {
  orderId: string
  customerId: string
  storeId: string
  orderedAt: string
  items: OrderItem[]
  totalAmount: number
  orderStatus: string
}

export interface DeliveryData {
  orderId: string
  riderAssignedAt?: string
  pickedUpAt?: string
  expectedAt: string
  deliveredAt?: string
  deliveryStatus: string
}

export interface CsHistoryData {
  customerId: string
  orderId: string
  issueType: IssueType
  itemName?: string
  action: FinalAction
  amount?: number
  status: 'completed' | 'rejected'
}

export interface MerchantData {
  storeId: string
  storeName: string
  merchantUserId: string
}

export interface MerchantConfirmationData {
  requestId: string
  caseId: string
  orderId: string
  itemName?: string
  customerClaim: string
  evidenceUrl?: string
  response?: MerchantResponse
  comment?: string
  status: 'waiting' | 'completed'
  requestedAt: string
  respondedAt?: string
}
```

---

## 6 Case 이력과 Tool 이력

`history`는 Case의 업무 처리와 상태 변경을 기록한다. `toolHistory`는 Agent가 선택한 Tool과 Observation을 기록한다.

```ts
export type CaseActor = 'customer' | 'agent' | 'merchant' | 'cs'

export type CaseEvent =
  | 'CASE_CREATED'
  | 'STATUS_CHANGED'
  | 'EVIDENCE_ADDED'
  | 'MERCHANT_REQUESTED'
  | 'MERCHANT_RESPONDED'
  | 'ESCALATED'
  | 'FINAL_ACTION_COMPLETED'

export interface CaseHistory {
  id: string
  actor: CaseActor
  event: CaseEvent
  fromStatus?: CaseStatus
  toStatus?: CaseStatus
  detail?: string
  createdAt: string
}

export type ToolName =
  | 'get_order'
  | 'get_delivery'
  | 'get_cs_history'
  | 'get_policy'
  | 'check_risk'
  | 'analyze_evidence'
  | 'request_merchant_confirmation'
  | 'refund'
  | 'redelivery'
  | 'escalate_to_human'

export interface ToolCallLog {
  id: string
  step: number
  toolName: ToolName
  input: unknown
  result: ToolResult<unknown>
  startedAt: string
  completedAt: string
}
```

발표 화면에서는 `toolHistory`를 사용해 Agent가 어떤 Tool을 선택했고 어떤 결과를 관찰했는지 보여준다. 내부 추론 원문은 저장하거나 고객에게 노출하지 않는다.

---

## 7 공통 CsCase 계약

```ts
export interface CsCase {
  caseId: string

  customerId: string
  orderId: string
  storeId: string

  issueType: IssueType
  status: CaseStatus
  decision?: AgentDecision

  customerClaim: string
  conversation: ConversationMessage[]
  evidenceUrls: string[]
  evidenceAnalysis?: EvidenceAnalysis[]

  order?: OrderData
  delivery?: DeliveryData
  csHistory: CsHistoryData[]

  merchantConfirmation?: MerchantConfirmationData

  appliedPolicy?: string
  riskFlags: RiskFlag[]

  agentSummary?: string
  finalAction?: FinalAction
  finalActionResult?: MockActionResult

  history: CaseHistory[]
  toolHistory: ToolCallLog[]

  createdAt: string
  updatedAt: string
}
```

Customer, Merchant, Human CS는 반드시 같은 `caseId`와 `CsCase`를 사용한다.

---

## 8 Tool 계약

```ts
export interface AgentTools {
  getOrder(input: {
    orderId: string
  }): Promise<ToolResult<OrderData>>

  getDelivery(input: {
    orderId: string
  }): Promise<ToolResult<DeliveryData>>

  getCsHistory(input: {
    customerId: string
    orderId: string
  }): Promise<ToolResult<CsHistoryData[]>>

  getPolicy(input: {
    caseData: CsCase
  }): Promise<ToolResult<PolicyResult>>

  checkRisk(input: {
    caseData: CsCase
  }): Promise<ToolResult<RiskResult>>

  analyzeEvidence(input: {
    evidenceUrl: string
  }): Promise<ToolResult<EvidenceAnalysis>>

  requestMerchantConfirmation(input: {
    caseId: string
    orderId: string
    issueType: IssueType
    itemName?: string
    customerClaim: string
    evidenceUrl?: string
  }): Promise<ToolResult<MerchantConfirmationData>>

  refund(input: {
    caseId: string
    orderId: string
    itemName?: string
    amount: number
  }): Promise<ToolResult<MockActionResult>>

  redelivery(input: {
    caseId: string
    orderId: string
  }): Promise<ToolResult<MockActionResult>>

  escalateToHuman(input: {
    caseId: string
    reason: string
    summary?: string
  }): Promise<ToolResult<HumanEscalationResult>>
}

export interface PolicyResult {
  policyId: string
  requiresMerchantConfirmation: boolean
  allowedActions: FinalAction[]
  reason: string
}

export interface RiskResult {
  flags: RiskFlag[]
  autoActionAllowed: boolean
}

export interface MockActionResult {
  actionId: string
  action: 'mock_refund' | 'mock_redelivery'
  completedAt: string
}

export interface HumanEscalationResult {
  queueId: string
  status: 'queued'
  createdAt: string
}
```

`refund`와 `redelivery`는 실제 결제 또는 배달 시스템을 호출하지 않는다. Case와 이력에 Mock 처리 결과만 기록한다.

---

## 9 Case Store 계약

```ts
export interface CaseStore {
  getCase(caseId: string): CsCase | undefined

  updateCase(
    caseId: string,
    changes: Partial<CsCase>,
  ): CsCase

  getCasesByStatus(status: CaseStatus): CsCase[]

  subscribe(
    caseId: string,
    listener: (caseData: CsCase) => void,
  ): () => void

  resetCase(caseId: string): CsCase
  resetAllDemoCases(): CsCase[]
}
```

- Customer는 자신이 만든 Case를 조회한다.
- Merchant는 `WAITING_MERCHANT` Case를 조회한다.
- Human CS는 `ESCALATED` Case를 조회한다.
- Demo 초기화는 항상 같은 시작 상태를 복원해야 한다.

---

## 10 Policy와 Risk 최소 기준

### Policy

- 저가 메뉴 누락이고 같은 메뉴의 기존 환불과 Risk가 없으면 Mock 부분 환불을 허용한다.
- 고가 메뉴 누락이면 Merchant Confirmation이 필요하다.
- 고객은 누락을 주장하고 Merchant가 `PACKED`로 응답하면 자동 처리를 허용하지 않는다.

정확한 저가와 고가 기준 금액은 임시값으로 시작할 수 있다. 금액이 바뀌더라도 Demo Case의 예상 결과는 두 담당자가 함께 갱신한다.

### Risk

- 동일 주문과 동일 메뉴의 기존 환불은 `duplicate_refund`다.
- 최근 반복 환불은 `frequent_refund`다.
- 주문에 없는 메뉴를 주장하면 `order_claim_mismatch`다.
- 주문과 증빙이 명확히 다르면 `evidence_mismatch`다.
- Risk가 하나라도 있으면 자동 처리를 금지하고 `ESCALATE` 후보로 전달한다.

Policy와 Risk는 Agent가 사용할 수 있는 공통 정보다. Risk 기준은 사람이 미리 정의하고 `checkRisk`가 같은 입력에 같은 규칙을 적용한다. Agent가 임의로 새로운 Risk 기준을 만들지 않는다. Agent가 언제 Policy 또는 Risk를 확인할지는 담당자 A의 Dynamic Agent Loop가 결정한다.

---

## 11 Dynamic Agent Loop 경계

다음 흐름은 담당자 A가 구현한다.

```text
현재 Case와 이전 Observation 확인
→ 다음 행동 선택
→ 선택한 Tool 호출
→ ToolResult를 Observation으로 저장
→ Case와 toolHistory 갱신
→ 종료 조건 확인
→ 종료하지 않았으면 다시 판단
```

개념 인터페이스는 다음과 같다.

```ts
export type AgentAction =
  | {
      type: 'ASK_CUSTOMER'
      question: string
    }
  | {
      type: 'CALL_TOOL'
      toolName: ToolName
      input: unknown
    }
  | {
      type: 'FINISH'
      decision: AgentDecision
      finalAction: FinalAction
      customerMessage: string
    }

export interface AgentController {
  decideNextAction(caseData: CsCase): Promise<AgentAction>
  runNextStep(caseId: string): Promise<CsCase>
}
```

공통 영역은 `decideNextAction`의 내부 로직을 구현하지 않는다. Agent Loop는 구현 시 간단한 최대 step 제한을 두고, Tool 오류는 Observation으로 전달해 재판단한다. 반복 오류나 더 진행할 수 없는 경우 Human CS로 이관한다. 별도의 복잡한 재시도 시스템이나 `ERROR` CaseStatus는 MVP에서 만들지 않는다.

---

## 12 Merchant Confirmation 재개 조건

```text
Agent가 Merchant 확인 필요성을 판단
→ request_merchant_confirmation 호출
→ Case 상태 WAITING_MERCHANT
→ Merchant Queue 표시
→ Merchant가 PACKED, POSSIBLE_MISSING, UNKNOWN 중 하나로 응답
→ 같은 Case에 응답 저장
→ 담당자 A의 Agent Loop 재실행
→ Policy와 Risk를 포함한 현재 Case를 보고 다음 행동 재판단
```

Merchant 응답 저장과 Case 갱신은 공통 영역이다. 응답 이후 어떤 Tool을 호출할지는 Agent Loop의 책임이다.

---

## 13 공통 Demo Case

| Case | 시작 상황 | 예상 결과 |
| --- | --- | --- |
| A | 배달 지연 문의지만 아직 ETA 전 | 배달 정보 확인 후 정상 진행 안내 |
| B | 저가 메뉴 누락이고 기존 동일 환불과 Risk 없음 | Mock 부분 환불 |
| C | 고가 메뉴 누락 | Merchant Queue 생성 후 응답을 받아 같은 Case 재개 |
| D | 고객은 누락을 주장하고 Merchant는 `PACKED`로 응답 | 주장 충돌로 Human CS 이관 |
| E | 오배달이며 증빙이 있고 Risk 없음 | Mock 재배달 또는 Policy에 따른 Human CS 이관 |

각 Demo Case는 초기화 후 같은 입력으로 같은 시작 상태를 복원해야 한다. Agent의 Tool 실행 순서까지 고정하지 않는다.

---

## 14 역할 분담

### 공동 결정

- 이 문서의 타입과 상태값
- Tool 입력과 결과 형식
- Policy와 Risk의 최소 기준
- Demo Case의 시작 상태와 예상 결과
- 공통 계약 변경

### 담당자 A

- 현재 Case와 Observation을 보고 다음 행동 선택
- Dynamic Agent Loop
- Customer 화면과 Agent 연결
- 추가 질문, Tool 호출, 자동 처리, Merchant 확인, Human CS 이관 판단
- 고객 결과와 개발용 Agent Trace 분리

### 담당자 B

- Mock Data와 Demo Case
- Case Store와 상태 변경 이력
- Tool 실제 동작
- Merchant 화면과 응답 저장
- Human CS 화면과 최종 처리

---

## 15 공통 계약 변경 규칙

다음 항목을 바꾸려면 구현 전에 두 담당자가 합의한다.

- `IssueType`
- `CaseStatus`
- `AgentDecision`
- `MerchantResponse`
- `CsCase`에서 화면 사이에 전달하는 정보
- Tool 이름, 입력, 결과 형식
- Policy와 Risk 분기 결과
- `conversation`, 증빙 분석, 최종 Action 결과의 공통 형식
- Demo Case의 예상 결과

다음 항목은 각 담당자가 자율적으로 바꿀 수 있다.

- 화면 배치와 디자인
- 컴포넌트와 파일 구조
- 내부 상태 관리 방식
- 문구와 애니메이션
- 세부 Mock 데이터의 이름과 시간
- 공통 계약에 영향을 주지 않는 리팩터링

---

## 16 공통 준비 완료 기준

- 같은 `caseId`를 Customer, Merchant, Human CS가 조회할 수 있다.
- Case 변경이 구독 중인 화면에 반영된다.
- `history`와 `toolHistory`가 서로 다른 목적으로 기록된다.
- Tool 성공 결과에는 `data`, 실패 결과에는 `error`가 반드시 존재한다.
- Demo Case를 초기화할 수 있다.
- Merchant 요청이 `WAITING_MERCHANT` 상태로 저장된다.
- Merchant 응답이 같은 Case에 저장된다.
- Risk와 주장 충돌 Case가 `ESCALATED` 상태로 저장될 수 있다.
- 고객과 Agent의 추가 대화가 `conversation`에 누적된다.
- 증빙이 필요한 경우 `analyze_evidence` 결과를 Case에 저장할 수 있다.
- Mock Action 결과를 `finalActionResult`에 저장할 수 있다.
- Mock 환불과 재배달이 실제 처리처럼 표시되지 않는다.
- 공통 영역에 문의 유형별 고정 Tool 실행 순서가 존재하지 않는다.

이 조건을 통과한 뒤 담당자 A와 B가 각자 화면을 독립적으로 완성한다.
