export type AgentUiState = 'ready' | 'working' | 'waiting' | 'resolved'

export type UserRole = 'customer' | 'merchant' | 'cs'

export type CustomerLanguage = 'ko' | 'en'

export type IssueType =
  | 'delivery_delay'
  | 'missing_item'
  | 'wrong_delivery'
  | 'other'

export type IssueClassificationStatus = 'PROVISIONAL' | 'CONFIRMED'

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

export type MerchantConditionalAction =
  | 'mock_coupon'
  | 'mock_refund'
  | 'mock_redelivery'
  | 'merchant_review'

export type Liability =
  | 'CUSTOMER'
  | 'MERCHANT'
  | 'DELIVERY'
  | 'PLATFORM'
  | 'UNKNOWN'

export type ResolutionPreference =
  | 'refund'
  | 'redelivery'
  | 'undecided'

export type CaseTaskStatus =
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'WAITING_CUSTOMER'
  | 'WAITING_MERCHANT'
  | 'WAITING_HUMAN_CS'
  | 'ACTION_READY'
  | 'ACTION_EXECUTING'
  | 'RESOLVED'
  | 'CANCELLED'

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
  role: 'merchant' | 'agent' | 'human_cs'
  content: string
  createdAt: string
}

export type EvidenceAssessment =
  | 'supports_claim'
  | 'inconclusive'
  | 'contradicts_claim'

export interface EvidenceAnalysis {
  evidenceUrl: string
  assessment: EvidenceAssessment
  observation: string
  limitations: string[]
}

export type HumanCsAction =
  | 'approve_refund'
  | 'reject_refund'
  | 'approve_redelivery'
  | 'request_more_info'
  | 'request_additional_confirmation'

export type ToolResult<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: string }

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
  /** 예상 도착 시각 대비 지난 분. 0보다 크면 지연이다. */
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
  /** 매장 확인을 요청한 주체. 회신 후 복귀할 흐름을 결정한다. */
  requestedBy?: 'agent' | 'human_cs'
  respondedAt?: string
  followUpCount?: number
  /** 점주가 고객에게 추가 정보·사진을 요청하려고 선택한 상태 */
  pendingIntent?: 'request_customer_info'
  /** 매장이 고객에게 요청한 추가 자료 또는 설명 */
  customerInfoRequest?: string
  customerInfoRequestedAt?: string
  customerInfoProvidedAt?: string
  /** 고객 사진이 주장을 뒷받침할 때 매장이 미리 승인한 조치 */
  conditionalAction?: MerchantConditionalAction
  conditionalCouponAmount?: number
}

export interface CaseTask {
  taskId: string
  issueType: IssueType
  status: CaseTaskStatus
  customerClaim: string
  claimedItemName?: string
  liability: Liability
  resolutionPreference?: ResolutionPreference
  finalAction?: FinalAction
  createdAt: string
  updatedAt: string
}

export interface HumanCsResolution {
  action: HumanCsAction
  comment?: string
  handledBy: string
  handledAt: string
}

export interface HumanReviewGuidance {
  caution: string
  verification: string
  nextAction: string
}

export interface HumanHandoffSummary {
  customerClaimSummary: string
  merchantResponseSummary: string
  escalationReasonSummary: string
  reviewGuidance: HumanReviewGuidance
  sourceFingerprint: string
  source: 'openai'
  model: string
  language: string
  generatedAt: string
}

export type CaseActor = 'customer' | 'agent' | 'merchant' | 'cs'

export type CaseEvent =
  | 'CASE_CREATED'
  | 'ISSUE_TYPE_CHANGED'
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
  | 'issue_coupon'
  | 'escalate_to_human'

export interface ToolCallLog {
  id: string
  step: number
  /** 문의 유형이 정정돼도 이전 Policy/Risk 결과를 감사 기록으로 보존하기 위한 버전 */
  issueVersion?: number
  toolName: ToolName
  input: unknown
  result: ToolResult<unknown>
  startedAt: string
  completedAt: string
}

export interface CsCase {
  caseId: string
  demoCaseId?: DemoCaseId
  customerId: string
  orderId: string
  storeId: string
  issueType: IssueType
  issueClassificationStatus: IssueClassificationStatus
  issueConfidence: number
  issueVersion: number
  issueClarificationQuestion?: string
  tasks: CaseTask[]
  activeTaskId: string
  status: CaseStatus
  decision?: AgentDecision
  customerClaim: string
  customerLanguage?: CustomerLanguage
  /** 매장 확인 전에 고객에게 사건의 구체적인 상황을 한 번 더 요청한 시각 */
  customerDetailRequestedAt?: string
  /** 위 요청 이후 고객이 추가 설명 또는 증빙을 보낸 시각 */
  customerDetailProvidedAt?: string
  claimedItemName?: string
  receivedItemDescription?: string
  liability: Liability
  resolutionPreference?: ResolutionPreference
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
  escalationCode?: 'MERCHANT_TIMEOUT'
  escalationReason?: string
  humanHandoffSummary?: HumanHandoffSummary
  finalAction?: FinalAction
  finalActionResult?: MockActionResult
  history: CaseHistory[]
  toolHistory: ToolCallLog[]
  createdAt: string
  updatedAt: string
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
  action: 'mock_coupon' | 'mock_refund' | 'mock_redelivery'
  completedAt: string
  idempotencyKey: string
}

export interface HumanEscalationResult {
  queueId: string
  status: 'queued'
  createdAt: string
}

export interface AgentTools {
  getOrder(input: { orderId: string }): Promise<ToolResult<OrderData>>
  getDelivery(input: { orderId: string }): Promise<ToolResult<DeliveryData>>
  getCsHistory(input: {
    customerId: string
    orderId: string
  }): Promise<ToolResult<CsHistoryData[]>>
  getPolicy(input: { caseData: CsCase }): Promise<ToolResult<PolicyResult>>
  checkRisk(input: { caseData: CsCase }): Promise<ToolResult<RiskResult>>
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
  issueCoupon(input: {
    caseId: string
    orderId: string
    amount: number
  }): Promise<ToolResult<MockActionResult>>
  escalateToHuman(input: {
    caseId: string
    reason: string
    summary?: string
  }): Promise<ToolResult<HumanEscalationResult>>
}

export type AgentAction =
  | {
      type: 'ASK_CUSTOMER'
      question: string
      waitStatus?: 'COLLECTING_INFO' | 'WAITING_EVIDENCE' | 'ACTION_READY'
      purpose?: 'ISSUE_DETAIL'
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
      /** 상담원 인수인계에만 쓰며 고객에게 그대로 노출하지 않는 내부 이관 근거 */
      escalationReason?: string
    }

export interface AgentController {
  decideNextAction(caseData: CsCase): Promise<AgentAction>
  runNextStep(caseId: string): Promise<CsCase>
}

export type DemoCaseId = 'A' | 'B' | 'C' | 'D' | 'E'

export interface CreateCaseInput {
  caseId?: string
  customerId: string
  orderId: string
  storeId: string
  issueType: IssueType
  issueClassificationStatus?: IssueClassificationStatus
  issueConfidence?: number
  issueClarificationQuestion?: string
  customerClaim: string
  customerLanguage?: CustomerLanguage
  claimedItemName?: string
  receivedItemDescription?: string
  evidenceUrls?: string[]
}

export type CaseChanges = Partial<
  Omit<CsCase, 'caseId' | 'history' | 'toolHistory' | 'createdAt'>
>

export type CaseHistoryDraft = Omit<CaseHistory, 'id' | 'createdAt'> & {
  id?: string
  createdAt?: string
}

export type ToolCallLogDraft = Omit<ToolCallLog, 'id' | 'step'> & {
  id?: string
  step?: number
}

export interface CaseCommit {
  changes?: CaseChanges
  history?: CaseHistoryDraft[]
  toolHistory?: ToolCallLogDraft[]
}

export interface CaseStore {
  createCase(input: CreateCaseInput): CsCase
  getCase(caseId: string): CsCase | undefined
  getAllCases(): CsCase[]
  findCaseByOrderId(orderId: string): CsCase | undefined
  commitCase(caseId: string, commit: CaseCommit): CsCase
  updateCase(caseId: string, changes: CaseChanges): CsCase
  getCasesByStatus(status: CaseStatus): CsCase[]
  getCasesForRole(role: UserRole, subjectId?: string): CsCase[]
  expireMerchantConfirmations(now?: number): CsCase[]
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
