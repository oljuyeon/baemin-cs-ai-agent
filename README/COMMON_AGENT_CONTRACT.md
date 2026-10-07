# 배달 플랫폼 CS AI Agent 공통 계약

> 문서 버전: `ver5.0`
>
> 최종 수정일시: `2026-10-07 KST`

## 문서 목적

이 문서는 Customer, Merchant, Human CS 화면을 나누어 개발하기 전에 두
담당자가 공통으로 지켜야 할 데이터와 동작 계약을 정의한다.

공통 영역의 구현은 `src/features/cs`다. 이 문서의 타입과 동작은 그
코드와 같다. 공통 영역은 Agent가 사용할 Case, Mock Data, Tool, Policy,
Risk, 저장 기능을 제공한다. Agent가 현재 Case를 보고 다음 행동을
선택하는 Dynamic Agent Loop는 공통 영역에 포함하지 않는다.

공통규약은 Agent에게 Case별 정답이나 고정 Workflow를 제공하지 않는다.
사람이 정한 업무 규칙, 판단에 사용할 정보, 허용 Action과 금지
Guardrail을 제공하고, 개별 Case의 처리 순서와 최종 행동은 Agent가 현재
Case와 Tool Observation을 바탕으로 동적으로 판단한다.

기능 기획의 기준은 `배달 플랫폼 CS AI Agent PoC 기획서 틀`이다. 현재
구현된 Customer UI의 짧은 이름은 화면 내부에서 유지할 수 있지만, 화면
사이에서 교환하는 공통 데이터는 이 문서의 이름을 사용한다.

------------------------------------------------------------------------

## 1 공통 범위

### 공통으로 구현되어 있는 것

-   공통 `CsCase` 데이터 계약
-   Case 상태와 Agent 결정값
-   Mock Customer, Order, Delivery, CS History, Merchant 데이터
-   URL별 Mock 증빙 분석 결과
-   Tool 이름과 입출력 계약
-   엄격한 `ToolResult<T>`
-   Case 생성, 조회, 변경, 구독과 `localStorage` 복원
-   Case 업무 처리 이력 `history`
-   Agent Tool 호출 이력 `toolHistory`
-   Merchant Confirmation 응답 저장
-   Human CS 처리 결과 저장
-   가상 Policy와 Risk 규칙
-   고객 대화와 증빙 분석의 저장 형식

고객 문장은 채팅 입력으로 `customerClaim`에 저장한다. 문의 문장을 미리
넣은 실행용 Case는 만들지 않는다. Demo A\~E의 예상 결과는 검증 기준이며,
Tool 실행 순서는 아니다.

### 공통으로 구현하지 않을 것

-   문의 유형별 고정 Tool 실행 순서
-   다음 Tool을 선택하는 로직
-   Agent 반복 실행문
-   추가 질문이 필요한지 판단하는 로직
-   자동 처리와 상담원 이관을 최종 선택하는 로직
-   Customer, Merchant, Human CS 화면의 배치와 디자인
-   컴포넌트와 파일 구조

다음과 같은 고정 Workflow는 공통 영역에 만들지 않는다.

``` ts
if (issueType === 'missing_item') {
  await getOrder()
  await getCsHistory()
  await getPolicy()
  await refund()
}
```

공통 영역은 Tool과 Observation을 제공하고, 담당자 A의 Dynamic Agent
Loop가 현재 Case를 보고 다음 행동을 선택한다.

------------------------------------------------------------------------

## 2 현재 UI 값과 공통 값의 연결

현재 Customer 화면에서 사용하는 문의 유형은 유지할 수 있다.

  현재 Customer UI   공통 Case 값
  ------------------ ------------------
  `delay`            `delivery_delay`
  `missing`          `missing_item`
  `wrong`            `wrong_delivery`

현재 `ready`, `working`, `waiting`, `resolved`는 Customer 화면 표시
상태다. 공통 Case 업무 상태와 섞지 않는다.

``` ts
export type AgentUiState = 'ready' | 'working' | 'waiting' | 'resolved'

export type IssueType =
  | 'delivery_delay'
  | 'missing_item'
  | 'wrong_delivery'
  | 'other'
```

------------------------------------------------------------------------

## 3 공통 상태와 결정값

``` ts
export type CaseStatus =
  | 'NEW'
  | 'COLLECTING_INFO'
  | 'WAITING_EVIDENCE'
  | 'CHECKING_DATA'
  | 'WAITING_MERCHANT'
  | 'POLICY_CHECK'
  | 'RISK_CHECK'
  | 'ACTION_READY'
  | 'ACTION_EXECUTING'
  | 'AUTO_RESOLVED'
  | 'ESCALATED'
  | 'CLOSED'

export type AgentDecision =
  | 'AUTO_RESOLVE'
  | 'NEED_MORE_INFO'
  | 'WAITING_MERCHANT'
  | 'ESCALATE'

export type MerchantResponse =
  | 'CONFIRMED'
  | 'POSSIBLE'
  | 'DENIED'
  | 'UNKNOWN'

export type Liability =
  | 'CUSTOMER'
  | 'MERCHANT'
  | 'DELIVERY'
  | 'PLATFORM'
  | 'UNKNOWN'

export type RiskFlag =
  | 'duplicate_refund'
  | 'frequent_refund'
  | 'order_claim_mismatch'
  | 'evidence_mismatch'
  | 'high_value_claim'

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

export interface MerchantConversationMessage {
  role: 'merchant' | 'agent'
  content: string
  createdAt: string
}

export interface EvidenceAnalysis {
  evidenceUrl: string
  assessment: 'supports_claim' | 'inconclusive' | 'contradicts_claim'
  observation: string
  limitations: string[]
}
```

------------------------------------------------------------------------

## 4 Tool 결과 계약

성공했는데 `data`가 없거나 실패했는데 `error`가 없는 결과는 허용하지
않는다.

``` ts
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

``` ts
const result = await tools.getOrder({ orderId })

if (result.status === 'error') {
  return result.error
}

return result.data
```

------------------------------------------------------------------------

## 5 공통 Mock Data

``` ts
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
  delayMinutes: number
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
  conversation: MerchantConversationMessage[]
  response?: MerchantResponse
  comment?: string
  status: 'waiting' | 'completed'
  requestedAt: string
  respondedAt?: string
}

export type HumanCsAction =
  | 'approve_refund'
  | 'reject_refund'
  | 'approve_redelivery'
  | 'request_more_info'
  | 'request_additional_confirmation'

export interface HumanCsResolution {
  action: HumanCsAction
  comment?: string
  handledBy: string
  handledAt: string
}
```

------------------------------------------------------------------------

## 6 Case 이력과 Tool 이력

`history`는 Case의 업무 처리와 상태 변경을 기록한다. `toolHistory`는
Agent가 선택한 Tool과 Observation을 기록한다.

``` ts
export type CaseActor = 'customer' | 'agent' | 'merchant' | 'cs'

export type CaseEvent =
  | 'CASE_CREATED'
  | 'STATUS_CHANGED'
  | 'EVIDENCE_ADDED'
  | 'MERCHANT_REQUESTED'
  | 'MERCHANT_RESPONDED'
  | 'ESCALATED'
  | 'HUMAN_CS_ACTION_COMPLETED'
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

발표 화면에서는 `toolHistory`를 사용해 Agent가 어떤 Tool을 선택했고 어떤
결과를 관찰했는지 보여준다. 내부 추론 원문은 저장하거나 고객에게
노출하지 않는다.

------------------------------------------------------------------------

## 7 공통 CsCase 계약

``` ts
export type DemoCaseId = 'A' | 'B' | 'C' | 'D' | 'E'

export interface CsCase {
  caseId: string
  demoCaseId?: DemoCaseId

  customerId: string
  orderId: string
  storeId: string

  issueType: IssueType
  status: CaseStatus
  decision?: AgentDecision

  customerClaim: string
  claimedItemName?: string
  receivedItemDescription?: string
  conversation: ConversationMessage[]
  evidenceUrls: string[]
  evidenceAnalysis?: EvidenceAnalysis[]

  order?: OrderData
  delivery?: DeliveryData
  csHistory: CsHistoryData[]

  merchantConfirmation?: MerchantConfirmationData
  humanCsResolution?: HumanCsResolution

  appliedPolicy?: string
  riskFlags: RiskFlag[]

  agentSummary?: string
  escalationReason?: string
  finalAction?: FinalAction
  finalActionResult?: MockActionResult

  history: CaseHistory[]
  toolHistory: ToolCallLog[]

  createdAt: string
  updatedAt: string
}
```

Customer, Merchant, Human CS는 반드시 같은 `caseId`와 `CsCase`를
사용한다.

------------------------------------------------------------------------

## 8 Tool 계약

``` ts
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
  allowedActions: FinalAction[]
  constraints: string[]
  reason: string
}

export interface RiskResult {
  flags: RiskFlag[]
  blockedActions: FinalAction[]
  reason: string
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

Tool은 Mock 또는 외부 시스템의 결과만 반환한다. Tool 내부에서 Case와
`toolHistory`를 직접 변경하지 않고, 다음 행동을 결정하지 않는다. Agent
Loop가 Tool 결과를 Observation으로 저장한다.

`refund`와 `redelivery`는 실제 결제 또는 배달 시스템을 호출하지 않는다.
요청 검증 후 Mock 결과만 반환한다. Policy와 Risk로 실행 여부를 결정하지
않는다.

------------------------------------------------------------------------

## 9 Case Store 계약

``` ts
export interface CaseStore {
  createCase(input: CreateCaseInput): CsCase
  getCase(caseId: string): CsCase | undefined
  getAllCases(): CsCase[]
  findCaseByOrderId(orderId: string): CsCase | undefined
  commitCase(caseId: string, commit: CaseCommit): CsCase
  updateCase(caseId: string, changes: CaseChanges): CsCase
  getCasesByStatus(status: CaseStatus): CsCase[]
  getCasesForRole(role: UserRole, subjectId?: string): CsCase[]
  appendConversation(
    caseId: string,
    role: ConversationMessage['role'],
    content: string,
  ): CsCase
  recordEvidenceAnalysis(caseId: string, analysis: EvidenceAnalysis): CsCase
  appendMerchantConversation(
    caseId: string,
    role: MerchantConversationMessage['role'],
    content: string,
  ): CsCase
  recordMerchantResponse(
    caseId: string,
    response: MerchantResponse,
    comment?: string,
  ): CsCase
  completeMerchantConfirmation(caseId: string): CsCase
  recordHumanCsResolution(
    caseId: string,
    action: HumanCsAction,
    handledBy: string,
    comment?: string,
  ): CsCase
  subscribe(caseId: string, listener: (caseData: CsCase) => void): () => void
  resetCase(caseId: string): CsCase
  resetAllDemoCases(): CsCase[]
}
```

-   Customer는 자신이 만든 Case를 조회한다.
-   Merchant는 본인 매장이면서 `WAITING_MERCHANT`인 Case만 Queue에서
    조회한다.
-   Human CS는 `ESCALATED` Case와 Human CS가 처리한 `CLOSED` Case를
    조회한다.
-   `createCase`는 채팅으로 들어온 `customerClaim`으로 Case를 만든다.
-   `recordMerchantResponse`는 같은 Case의 `response`를 저장하거나
    수정하지만, 그 자체로 Merchant 확인을 종료하지 않는다. 후속 질문이
    남아 있으면 `MerchantConfirmationData.status = 'waiting'`과 Case의
    `WAITING_MERCHANT`를 유지한다.
-   `completeMerchantConfirmation`은 필요한 후속 질문이 모두 끝난 뒤에만
    `MerchantConfirmationData.status`를 `completed`로 바꾼다. 이후 Agent
    Loop가 같은 Case를 다시 읽어 다음 행동을 판단한다.
-   `recordHumanCsResolution`은 Human CS 처리 결과를 저장하고 상태를
    `CLOSED`로 바꾼다.
-   `resetAllDemoCases`는 `demoCaseId`가 있는 기존 Case만 지운다. 고객
    문장이 들어 있는 시작 Case를 다시 만들지 않는다.

------------------------------------------------------------------------

## 10 Policy, Risk와 Agent Guardrail

### 기본 원칙

공통 Policy와 Risk는 개별 Case의 정답이나 고정 처리 순서를 결정하지
않는다.

-   `PolicyResult`는 현재 Case에서 허용되는 Action과 제약조건을
    제공한다.
-   `RiskResult`는 Risk Flag와 그 Risk 때문에 금지되는 Action을
    제공한다.
-   고객에게 추가 질문할지, Merchant에게 확인할지, 다른 Tool을 호출할지,
    허용된 Action 중 무엇을 선택할지는 Dynamic Agent Loop가 현재 Case와
    Observation을 보고 판단한다.
-   Risk가 발견되었다는 이유만으로 즉시 Human CS로 이관하지 않는다.
-   Human CS는 Agent가 허용된 방법으로 해결할 수 없는 경우 또는 고객이
    명시적으로 사람 상담원을 요청한 경우에 사용한다.
-   Policy와 Risk는 사람이 미리 정의하며, Agent가 임의로 새로운 정책이나
    Risk 기준을 만들지 않는다.

예시:

``` text
PolicyResult
allowedActions:
- mock_refund
- human_review

constraints:
- 환불액은 누락 상품 금액 이하
- 현재 정보가 불충분하면 추가 확인 필요

→ 고객에게 더 물을지, Merchant에게 확인할지,
  바로 허용 Action을 실행할지는 Agent가 판단
```

``` text
RiskResult
flags:
- duplicate_refund

blockedActions:
- mock_refund

→ 동일 건 추가 환불은 금지
→ 그러나 즉시 Human CS 이관을 의미하지 않음
→ Agent는 다른 문제인지 고객에게 추가 확인 가능
```

### Agent 금지 규칙 / Guardrail

1.  **중복 보상 금지**
    -   동일 주문·동일 문제에 이미 환불 또는 재배달이 완료된 경우 동일
        보상을 다시 실행하지 않는다.
    -   다른 문제인지 확인하기 위한 추가 질문은 가능하다.
2.  **주문 불일치 보상 금지**
    -   고객이 누락 또는 오배달을 주장한 상품이 실제 주문내역에 존재하지
        않는 경우 해당 상품에 대한 자동 환불·재배달을 실행하지 않는다.
    -   Agent는 상품명이나 주문 착오 여부를 추가로 확인할 수 있다.
3.  **허용 범위 초과 보상 금지**
    -   누락 상품 등의 보상은 PoC에서 정의한 허용 범위를 초과할 수 없다.
    -   Agent가 임의로 주문 전체 환불이나 추가 금액 보상을 만들어서는 안
        된다.
4.  **명확한 정보 충돌 상태에서 자동 보상 금지**
    -   고객 주장과 주문정보, Merchant 응답, 증빙 등 핵심 정보가
        명확하게 충돌하는 동안 자동 환불·재배달을 확정하지 않는다.
    -   충돌 자체가 즉시 Human CS 이관을 의미하지는 않는다. Agent는 추가
        질문이나 다른 Tool을 통해 해결을 시도할 수 있다.
5.  **불충분한 증거로 사실 확정 금지**
    -   사진에 특정 상품이 보이지 않는다는 이유만으로 누락을 확정하는
        등, `inconclusive` 증빙을 확정 사실처럼 사용하지 않는다.
    -   추가 정보 또는 다른 근거를 확인할 수 있다.
6.  **Agent의 임의 정책 생성·변경 금지**
    -   Agent는 공통규약에 없는 보상, 금액 기준, Risk 기준 또는 업무
        규칙을 임의로 만들거나 변경하지 않는다.
    -   Policy가 허용한 Action과 제약조건 안에서만 판단한다.
7.  **해결 시도 없이 Human CS로 즉시 이관 금지**
    -   정보 부족, `UNKNOWN`, Risk Flag 발생만으로 즉시 Human CS에
        이관하지 않는다.
    -   허용된 고객 추가 질문, Merchant 확인, Tool 조회 등으로 해결
        가능한지 Agent가 먼저 판단한다.
    -   다만 최대 Step 초과, 반복 Tool 실패, 또는 허용된 해결 방법이
        모두 막힌 경우에는 Human CS로 이관할 수 있다.
8.  **명시적인 사람 상담 요청 무시 금지**
    -   고객이 사람 상담원을 명시적으로 요청하면 Agent가 자동상담을 계속
        강제하지 않는다.
    -   욕설, 화난 표현, 불만 표현 자체는 Human CS 이관 조건으로 보지
        않는다. 사람 상담 요청이 명시된 경우 Human CS로 이관한다.

### Risk Flag 최소 기준

-   동일 주문과 동일 문제의 기존 환불은 `duplicate_refund`다.
-   최근 반복 환불은 `frequent_refund`다. 이는 검토 신호이며 그 자체로
    모든 Action을 금지하거나 즉시 Human CS로 이관하는 규칙은 아니다.
-   주문에 없는 메뉴를 주장하면 `order_claim_mismatch`다.
-   주문정보와 증빙이 명확히 충돌하면 `evidence_mismatch`다.
-   각 Risk Flag는 필요한 Action만 `blockedActions`로 제한한다. Risk가
    존재한다는 이유만으로 모든 자동 처리를 일괄 금지하지 않는다.

Policy와 Risk는 Agent가 사용할 수 있는 서로 독립된 공통 정보다. Agent가
언제 Policy 또는 Risk를 확인할지는 Dynamic Agent Loop가 결정한다.

------------------------------------------------------------------------

## 11 Dynamic Agent Loop 경계

다음 흐름은 담당자 A가 구현한다.

``` text
현재 Case와 이전 Observation 확인
→ 다음 행동 선택
→ 선택한 Tool 호출
→ ToolResult를 Observation으로 저장
→ Case와 toolHistory 갱신
→ 종료 조건 확인
→ 종료하지 않았으면 다시 판단
```

개념 인터페이스는 다음과 같다.

``` ts
export type AgentAction =
  | {
      type: 'ASK_CUSTOMER'
      question: string
    }
  | {
      type: 'ASK_MERCHANT'
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

공통 영역은 `decideNextAction`의 내부 로직을 구현하지 않는다. Agent
Loop는 구현 시 간단한 최대 step 제한을 두고, Tool 오류는 Observation으로
전달해 재판단한다. 반복 오류나 더 진행할 수 없는 경우 Human CS로
이관한다. 별도의 복잡한 재시도 시스템이나 `ERROR` CaseStatus는 MVP에서
만들지 않는다. 고객에게 보여줄 문장은 고객 입력, 조회 데이터, Policy,
Risk, 실행된 Action 결과로 생성한다.

------------------------------------------------------------------------

## 12 Merchant Confirmation 재개 조건

Merchant Confirmation은 **구조화된 선택형 응답을 기본 입력으로 사용하고,
필요한 경우 자연어 추가 설명과 Agent의 후속 질문을 함께 사용하는
Human-in-the-loop 단계**다. Merchant가 선택지를 고르면 그 값이 우선
`MerchantResponse`로 저장된다. 자연어는 선택 없이 직접 답할 때, 선택에
설명을 덧붙일 때, 또는 Agent의 후속 질문에 답할 때 사용한다.

``` text
Agent가 현재 Case를 보고 Merchant 확인 필요성을 판단
→ request_merchant_confirmation 호출
→ Case.status = WAITING_MERCHANT
→ MerchantConfirmationData.status = waiting
→ Merchant Queue 표시
→ Merchant가 구조화된 선택지로 바로 응답하거나, 선택 없이 자연어로 답변
→ 선택지를 고른 경우 해당 값이 우선 MerchantResponse로 저장됨
→ 선택 없이 자연어만 입력한 경우 Agent가 의미를 해석하여 MerchantResponse로 구조화
→ 선택 응답만으로 충분하면 Merchant 확인 단계 종료
→ 정보가 부족하거나 선택값과 추가 설명이 충돌하면 Agent가 필요한 범위에서 후속 질문
→ 후속 질문 동안 Case.status = WAITING_MERCHANT 및 MerchantConfirmationData.status = waiting 유지
→ 후속 답변으로 기존 선택값의 의미가 명확히 바뀐 경우 Agent가 MerchantResponse를 수정할 수 있음
→ 충분한 정보가 모이면 MerchantConfirmationData.status = completed
→ Merchant 확인 단계가 끝난 뒤 담당자 A의 Agent Loop 재실행
→ 현재 Case, Policy, Risk와 모든 Observation을 보고 다음 행동 재판단
```

`MerchantResponse`의 의미는 다음과 같다.

-   `CONFIRMED`: Merchant가 누락 또는 오배달 등 문제 발생을 인정함
-   `DENIED`: Merchant가 해당 상품을 정상 처리했다고 진술함.
    객관적으로 확정된 사실이 아니라 Merchant의 진술로 취급함
-   `POSSIBLE`: Merchant가 문제 발생 가능성은 인정하지만 확정하지
    못함
-   `UNKNOWN`: Merchant가 현재 확인하기 어렵거나 충분한 정보를 제공하지
    못함

### MerchantResponse 저장과 수정 규칙

-   Merchant가 선택지를 직접 고른 경우 그 선택값을 우선 `response`에
    저장한다.
-   선택 뒤에 입력한 자연어 설명은 기본적으로 별도 Observation이며, 그
    자체로 기존 `response`를 자동 변경하지 않는다.
-   선택 없이 자연어만 입력한 경우 Agent가 그 문장을 해석하여
    `response`를 구조화한다.
-   선택값과 추가 설명이 충돌하면 Agent는 기존 값을 즉시 덮어쓰지 않고
    후속 질문으로 의미를 확인한다.
-   후속 질문의 답변을 통해 Merchant의 의도가 명확히 바뀐 경우에는 확인
    단계가 끝나기 전에 Agent가 `response`를 수정할 수 있다.
-   `MerchantConfirmationData.status === 'waiting'`인 동안의
    `response`는 잠정 Observation이다. 이 값만으로 환불, 재배달 또는
    Human CS 이관을 최종 확정하지 않는다.
-   필요한 후속 질문이 모두 끝난 뒤에만
    `MerchantConfirmationData.status`를 `completed`로 바꾸고 Merchant
    확인 단계를 종료한다.

Merchant 응답 저장과 Case 갱신은 공통 영역이다. 응답 이후 어떤 Tool을
호출하고 어떤 Action을 선택할지는 Agent Loop의 책임이다. Merchant 대화는
고객 대화와 분리하여 `MerchantConfirmationData.conversation`에 저장한다.

Merchant 입력의 기본은 `MerchantResponse`에 대응하는 구조화된 선택지다.
텍스트는 선택지를 사용하지 않고 직접 답할 때, 선택에 추가 설명을 붙일
때, 또는 Agent의 후속 질문에 답할 때 사용한다. 향후 STT를 추가하더라도
음성은 이 자연어 보조 입력 경로의 텍스트로 변환하며, `CsCase`와 Agent
계약은 변경하지 않는다.

------------------------------------------------------------------------

## 13 공통 Demo Case

  -----------------------------------------------------------------------
  Case                    시작 상황               예상 결과
  ----------------------- ----------------------- -----------------------
  A                       배달 지연 문의지만 아직 배달 정보 확인 후 정상
                          ETA 전. 주문 `A1001`    진행 안내

  B                       저가 메뉴 누락이고 기존 Agent가 Policy 제약
                          동일 환불과 Risk 없음   안에서 필요한 확인
                                                  여부와 해결 Action을
                                                  판단

  C                       추가적인 매장 정보가    Agent가 필요성을 판단한
                          필요한 누락 Case        경우 Merchant Queue
                                                  생성. Merchant가
                                                  선택지로 응답하고,
                                                  부족하거나 설명과
                                                  충돌할 때만 후속 질문을
                                                  이어간 뒤 같은 Case
                                                  재개

  D                       고객 주장과 Merchant의  자동 보상은 제한하되
                          `DENIED` 진술 등         Agent가 추가 해결
                          핵심 정보가 충돌        가능성을 판단하고, 해결
                                                  불가 시 Human CS 이관

  E                       오배달이며 증빙이 있음  증빙·주문·Merchant 정보
                                                  등을 Observation으로
                                                  사용하여 Agent가 허용된
                                                  해결 Action을 판단
  -----------------------------------------------------------------------

각 Demo Case의 예상 결과는 테스트 검증용이다. 고객 문장을 미리 넣은
Case로 실행 경로를 시작하지 않고, Agent의 Tool 실행 순서도 고정하지
않는다. Demo에 필요한 주문, 배달, 이력 데이터만 공통 Mock Data로
준비한다.

예상 도착 시각은 고정이다. `A1001`은 21:30, `A1006`은 20:05, `A1007`은
19:05다. 지연 분은 앱을 연 시각에서 이 시각을 뺀 값이다. 앱을 21:30 전에
열면 `A1001`은 정상 진행이고, `A1006`과 `A1007`은 지연이다. 두 주문의
차이로 장기 지연을 나누지 않는다. `C008`의 주문 `A1008`은 최근 30일 환불
5회로 `frequent_refund` 샘플이다.

------------------------------------------------------------------------

## 14 역할 분담

### 공동 결정

-   이 문서의 타입과 상태값
-   Tool 입력과 결과 형식
-   Policy와 Risk의 최소 기준
-   Demo Case의 시작 상태와 예상 결과
-   공통 계약 변경

### 담당자 A

-   현재 Case와 Observation을 보고 다음 행동 선택
-   Dynamic Agent Loop
-   Customer 화면과 Agent 연결
-   추가 질문, Tool 호출, 자동 처리, Merchant 확인, Human CS 이관 판단
-   고객 결과와 개발용 Agent Trace 분리

### 담당자 B

-   Mock Data와 Demo Case
-   Case Store와 상태 변경 이력
-   Tool 실제 동작
-   Merchant 화면과 응답 저장
-   Human CS 화면과 최종 처리

------------------------------------------------------------------------

## 15 공통 계약 변경 규칙

다음 항목을 바꾸려면 구현 전에 두 담당자가 합의한다.

-   `IssueType`
-   `CaseStatus`
-   `AgentDecision`
-   `MerchantResponse`
-   `CsCase`에서 화면 사이에 전달하는 정보
-   Tool 이름, 입력, 결과 형식
-   Policy와 Risk 분기 결과
-   `conversation`, Merchant 대화, 증빙 분석, 최종 Action 결과의 공통
    형식
-   Demo Case의 예상 결과

다음 항목은 각 담당자가 자율적으로 바꿀 수 있다.

-   화면 배치와 디자인
-   컴포넌트와 파일 구조
-   내부 상태 관리 방식
-   문구와 애니메이션
-   세부 Mock 데이터의 이름과 시간
-   공통 계약에 영향을 주지 않는 리팩터링

------------------------------------------------------------------------

## 16 공통 준비 완료 기준

-   같은 `caseId`를 Customer, Merchant, Human CS가 조회할 수 있다.
-   Case 변경이 구독 중인 화면에 반영된다.
-   `history`와 `toolHistory`가 서로 다른 목적으로 기록된다.
-   Tool 성공 결과에는 `data`, 실패 결과에는 `error`가 반드시 존재한다.
-   고객 문장을 미리 넣은 실행용 Demo Case는 없다.
-   Merchant 확인 요청 결과는 Case에 저장할 수 있고, 저장 후 상태는
    `WAITING_MERCHANT`가 될 수 있다.
-   Merchant와 Agent의 자연어 대화 및 구조화된 `MerchantResponse`가 같은
    Case에 저장된다.
-   Risk 또는 정보 충돌이 특정 Action을 제한할 수 있고, Agent가 해결할
    수 없는 경우 `ESCALATED` 상태로 저장될 수 있다.
-   고객과 Agent의 추가 대화가 `conversation`에 누적된다.
-   증빙이 필요한 경우 `analyze_evidence` 결과를 Case에 저장할 수 있다.
-   Mock Action 결과를 `finalActionResult`에 저장할 수 있다.
-   Mock 환불과 재배달이 실제 처리처럼 표시되지 않는다.
-   Policy는 허용 Action과 `constraints`를, Risk는 `blockedActions`를
    반환하며 서로의 책임을 대신하지 않는다.
-   사진 URL 존재 여부가 아니라 구조화된 증빙 분석 결과로 Policy와
    Risk를 판단한다.
-   Tool은 결과만 반환하고 다음 행동을 결정하지 않는다.
-   Demo Case ID에 따른 전용 실행 경로가 존재하지 않는다.
-   공통 영역에 문의 유형별 고정 Tool 실행 순서가 존재하지 않는다.

이 조건을 통과한 뒤 담당자 A와 B가 각자 화면을 독립적으로 완성한다.
