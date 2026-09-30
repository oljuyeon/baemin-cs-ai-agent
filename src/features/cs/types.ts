export type AgentUiState = 'ready' | 'working' | 'waiting' | 'resolved'

export type UserRole = 'customer' | 'merchant' | 'cs'

export type IssueType =
  | 'delivery_delay'
  | 'missing_item'
  | 'wrong_delivery'
  | 'other'

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

export type MerchantResponse = 'PACKED' | 'POSSIBLE_MISSING' | 'UNKNOWN'

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

export interface HumanCsResolution {
  action: HumanCsAction
  comment?: string
  handledBy: string
  handledAt: string
}

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
  escalateToHuman(input: {
    caseId: string
    reason: string
    summary?: string
  }): Promise<ToolResult<HumanEscalationResult>>
}

export type DemoCaseId = 'A' | 'B' | 'C' | 'D' | 'E'

export type DemoStage = 'start' | 'waiting_merchant' | 'merchant_responded' | 'escalated'

export interface CreateCaseInput {
  caseId?: string
  customerId: string
  orderId: string
  storeId: string
  issueType: IssueType
  customerClaim: string
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
  appendConversation(
    caseId: string,
    role: ConversationMessage['role'],
    content: string,
  ): CsCase
  recordEvidenceAnalysis(caseId: string, analysis: EvidenceAnalysis): CsCase
  recordMerchantResponse(
    caseId: string,
    response: MerchantResponse,
    comment?: string,
  ): CsCase
  recordHumanCsResolution(
    caseId: string,
    action: HumanCsAction,
    handledBy: string,
    comment?: string,
  ): CsCase
  subscribe(caseId: string, listener: (caseData: CsCase) => void): () => void
  resetCase(caseId: string): CsCase
  resetAllDemoCases(): CsCase[]
  loadDemoStage(demoCaseId: DemoCaseId, stage?: DemoStage): CsCase
}
