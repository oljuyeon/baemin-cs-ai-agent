import { evaluateDelayCompensation } from '../cs'
import type {
  AgentAction,
  CsCase,
  FinalAction,
  HumanHandoffSummary,
  OrderItem,
  PolicyResult,
  RiskResult,
  ToolName,
  ToolResult,
} from '../cs'
import type { CustomerIssueHint, MessageUnderstanding } from './nlu'

type RemoteToolName = Exclude<ToolName, 'analyze_evidence' | 'escalate_to_human'>

type RemoteDecision = {
  type: 'ASK_CUSTOMER' | 'CALL_TOOL' | 'FINISH'
  toolName: RemoteToolName | null
  message: string
  decision: 'AUTO_RESOLVE' | 'ESCALATE' | null
  finalAction: Exclude<FinalAction, 'mock_coupon'> | null
}

const requestJson = async <T>(path: string, body: unknown, timeoutMs = 20_000): Promise<T> => {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Agent API 요청 실패 (${response.status})`)
    return await response.json() as T
  } finally {
    window.clearTimeout(timeout)
  }
}

type HumanHandoffSummaryResponse = Pick<
  HumanHandoffSummary,
  'customerClaimSummary' | 'merchantResponseSummary' | 'escalationReasonSummary' | 'reviewGuidance' | 'source' | 'model'
>

const handoffRequests = new Map<string, Promise<HumanHandoffSummary>>()
const HUMAN_HANDOFF_SUMMARY_VERSION = 'v3'

type OptionalHandoffTask = {
  issueType?: unknown
  status?: unknown
  customerClaim?: unknown
  claimedItemName?: unknown
  liability?: unknown
  resolutionPreference?: unknown
  finalAction?: unknown
}

type HandoffCaseExtensions = {
  liability?: unknown
  resolutionPreference?: unknown
  tasks?: OptionalHandoffTask[]
}

const humanHandoffContext = (caseData: CsCase) => {
  const extendedCase = caseData as CsCase & HandoffCaseExtensions

  return {
  caseState: {
    caseId: caseData.caseId,
    customerId: caseData.customerId,
    orderId: caseData.orderId,
    storeId: caseData.storeId,
    issueType: caseData.issueType,
    status: caseData.status,
    liability: extendedCase.liability ?? null,
    resolutionPreference: extendedCase.resolutionPreference ?? null,
    riskFlags: caseData.riskFlags,
    appliedPolicy: caseData.appliedPolicy ?? null,
    finalAction: caseData.finalAction ?? null,
    finalActionResult: caseData.finalActionResult ?? null,
    humanCsResolution: caseData.humanCsResolution ?? null,
    legacyAgentSummary: caseData.agentSummary ?? null,
    legacyEscalationReason: caseData.escalationReason ?? null,
    tasks: (extendedCase.tasks ?? []).map((task) => ({
      issueType: task.issueType,
      status: task.status,
      customerClaim: task.customerClaim,
      claimedItemName: task.claimedItemName ?? null,
      liability: task.liability,
      resolutionPreference: task.resolutionPreference ?? null,
      finalAction: task.finalAction ?? null,
    })),
  },
  customerStatements: {
    initialClaim: caseData.customerClaim,
    claimedItemName: caseData.claimedItemName ?? null,
    receivedItemDescription: caseData.receivedItemDescription ?? null,
    conversation: caseData.conversation.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })),
  },
  merchantStatements: {
    requestStatus: caseData.merchantConfirmation?.status ?? null,
    response: caseData.merchantConfirmation?.response ?? null,
    comment: caseData.merchantConfirmation?.comment ?? null,
    conversation: caseData.merchantConfirmation?.conversation.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })) ?? [],
  },
  verifiedFacts: {
    order: caseData.order ? {
      orderId: caseData.order.orderId,
      customerId: caseData.order.customerId,
      storeId: caseData.order.storeId,
      orderedAt: caseData.order.orderedAt,
      items: caseData.order.items,
      totalAmount: caseData.order.totalAmount,
      orderStatus: caseData.order.orderStatus,
    } : null,
    delivery: caseData.delivery ?? null,
    csHistory: caseData.csHistory,
    evidenceAnalysis: caseData.evidenceAnalysis ?? [],
    toolObservations: caseData.toolHistory.map((entry) => ({
      toolName: entry.toolName,
      status: entry.result.status,
      observation: entry.result.status === 'success' ? entry.result.data : null,
      error: entry.result.status === 'error' ? entry.result.error : null,
      completedAt: entry.completedAt,
    })),
  },
  }
}

const fingerprint = (value: unknown) => {
  const text = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${HUMAN_HANDOFF_SUMMARY_VERSION}-${(hash >>> 0).toString(16)}`
}

export const getHumanHandoffSourceFingerprint = (caseData: CsCase) =>
  fingerprint(humanHandoffContext(caseData))

export async function summarizeHumanHandoffWithOpenAI(
  caseData: CsCase,
  language: string,
): Promise<HumanHandoffSummary> {
  const context = humanHandoffContext(caseData)
  const sourceFingerprint = fingerprint(context)
  const requestKey = `${caseData.caseId}:${sourceFingerprint}:${language}`
  const existing = handoffRequests.get(requestKey)
  if (existing) return existing

  const request = requestJson<HumanHandoffSummaryResponse>(
    '/api/agent/handoff-summary',
    { language, context },
    60_000,
  ).then((result) => ({
    ...result,
    sourceFingerprint,
    language,
    generatedAt: new Date().toISOString(),
  })).finally(() => {
    handoffRequests.delete(requestKey)
  })

  handoffRequests.set(requestKey, request)
  return request
}

export async function understandWithOpenAI(
  message: string,
  orderItems: OrderItem[] = [],
  hint?: CustomerIssueHint | null,
): Promise<MessageUnderstanding | null> {
  try {
    return await requestJson<MessageUnderstanding>('/api/agent/understand', {
      message,
      hint: hint ?? null,
      orderItems: orderItems.map(({ name }) => ({ name })),
    })
  } catch (error) {
    console.warn('OpenAI 문의 분류를 사용할 수 없어 규칙 기반 분류로 전환합니다.', error)
    return null
  }
}

const latestResult = <T>(caseData: CsCase, toolName: ToolName) =>
  [...caseData.toolHistory]
    .reverse()
    .find((entry) => entry.toolName === toolName)
    ?.result as ToolResult<T> | undefined

const wasCalled = (caseData: CsCase, toolName: ToolName) =>
  caseData.toolHistory.some((entry) => entry.toolName === toolName)

const toSafeContext = (caseData: CsCase) => {
  const policy = latestResult<PolicyResult>(caseData, 'get_policy')
  const risk = latestResult<RiskResult>(caseData, 'check_risk')
  return {
    issueType: caseData.issueType,
    status: caseData.status,
    customerMessages: caseData.conversation
      .filter((message) => message.role === 'customer')
      .slice(-6)
      .map((message) => message.content),
    claimedItemName: caseData.claimedItemName ?? null,
    order: caseData.order ? {
      items: caseData.order.items.map(({ name, price }) => ({ name, price })),
      orderStatus: caseData.order.orderStatus,
    } : null,
    delivery: caseData.delivery ? {
      deliveryStatus: caseData.delivery.deliveryStatus,
      delayMinutes: caseData.delivery.delayMinutes,
    } : null,
    policyAllowedActions: policy?.status === 'success' ? policy.data.allowedActions : [],
    riskBlockedActions: risk?.status === 'success' ? risk.data.blockedActions : [],
    toolHistory: caseData.toolHistory.map((entry) => ({
      toolName: entry.toolName,
      status: entry.result.status,
    })),
  }
}

const actionIsAllowed = (caseData: CsCase, action: FinalAction) => {
  const policy = latestResult<PolicyResult>(caseData, 'get_policy')
  const risk = latestResult<RiskResult>(caseData, 'check_risk')
  return policy?.status === 'success'
    && risk?.status === 'success'
    && policy.data.allowedActions.includes(action)
    && !risk.data.blockedActions.includes(action)
}

const buildToolAction = (
  caseData: CsCase,
  toolName: RemoteDecision['toolName'],
): Extract<AgentAction, { type: 'CALL_TOOL' }> | null => {
  if (!toolName) return null

  switch (toolName) {
    case 'get_order':
      return caseData.order ? null : { type: 'CALL_TOOL', toolName, input: { orderId: caseData.orderId } }
    case 'get_delivery':
      return caseData.delivery ? null : { type: 'CALL_TOOL', toolName, input: { orderId: caseData.orderId } }
    case 'get_cs_history':
      return wasCalled(caseData, toolName) ? null : {
        type: 'CALL_TOOL',
        toolName,
        input: { customerId: caseData.customerId, orderId: caseData.orderId },
      }
    case 'get_policy':
      if (
        wasCalled(caseData, toolName)
        || !wasCalled(caseData, 'get_cs_history')
        || (caseData.issueType === 'delivery_delay' && !caseData.delivery)
      ) return null
      return { type: 'CALL_TOOL', toolName, input: { caseData } }
    case 'check_risk':
      return wasCalled(caseData, toolName) || !wasCalled(caseData, 'get_policy')
        ? null
        : { type: 'CALL_TOOL', toolName, input: { caseData } }
    case 'request_merchant_confirmation':
      return caseData.issueType !== 'delivery_delay'
        && caseData.order
        && !caseData.merchantConfirmation ? {
        type: 'CALL_TOOL',
        toolName,
        input: {
          caseId: caseData.caseId,
          orderId: caseData.orderId,
          issueType: caseData.issueType,
          itemName: caseData.claimedItemName,
          customerClaim: caseData.customerClaim,
        },
      } : null
    case 'refund': {
      // 환불은 고객이 금액을 확인하고 UI에서 명시적으로 동의한 뒤에만 실행한다.
      return null
    }
    case 'redelivery':
      return actionIsAllowed(caseData, 'mock_redelivery') && !wasCalled(caseData, toolName)
        ? { type: 'CALL_TOOL', toolName, input: { caseId: caseData.caseId, orderId: caseData.orderId } }
        : null
  }
}

const buildFinishAction = (
  caseData: CsCase,
  decision: RemoteDecision,
): Extract<AgentAction, { type: 'FINISH' }> | null => {
  if (!decision.decision || !decision.finalAction) return null

  if (decision.decision === 'ESCALATE') {
    if (
      caseData.issueType !== 'other'
      && (!wasCalled(caseData, 'get_policy') || !wasCalled(caseData, 'check_risk'))
    ) return null

    if (caseData.issueType === 'delivery_delay' && actionIsAllowed(caseData, 'guide_customer')) {
      return null
    }

    if (caseData.issueType === 'missing_item' && actionIsAllowed(caseData, 'mock_refund')) {
      const refundResult = latestResult(caseData, 'refund')
      if (!refundResult || refundResult.status === 'success') return null
    }

    if (caseData.issueType === 'wrong_delivery' && actionIsAllowed(caseData, 'mock_redelivery')) {
      const redeliveryResult = latestResult(caseData, 'redelivery')
      if (!redeliveryResult || redeliveryResult.status === 'success') return null
    }

    return decision.finalAction === 'human_review'
      ? {
          type: 'FINISH',
          decision: 'ESCALATE',
          finalAction: 'human_review',
          customerMessage: decision.message,
        }
      : null
  }

  if (decision.finalAction === 'mock_refund') {
    if (latestResult(caseData, 'refund')?.status !== 'success') return null
  } else if (decision.finalAction === 'mock_redelivery') {
    if (latestResult(caseData, 'redelivery')?.status !== 'success') return null
  } else if (
    decision.finalAction !== 'guide_customer'
    && decision.finalAction !== 'no_action'
  ) {
    return null
  }

  if (
    (decision.finalAction === 'guide_customer' || decision.finalAction === 'no_action')
    && (!wasCalled(caseData, 'get_policy') || !wasCalled(caseData, 'check_risk'))
  ) return null

  return {
    type: 'FINISH',
    decision: 'AUTO_RESOLVE',
    finalAction: decision.finalAction,
    customerMessage: decision.message,
  }
}

const toAgentAction = (caseData: CsCase, decision: RemoteDecision): AgentAction | null => {
  if (!decision.message.trim()) return null
  if (decision.type === 'ASK_CUSTOMER') {
    if (caseData.issueType === 'delivery_delay') return null
    if (caseData.issueType === 'missing_item' && caseData.claimedItemName) return null
    return { type: 'ASK_CUSTOMER', question: decision.message }
  }
  if (decision.type === 'CALL_TOOL') return buildToolAction(caseData, decision.toolName)
  if (decision.type === 'FINISH') return buildFinishAction(caseData, decision)
  return null
}

export async function decideWithOpenAI(caseData: CsCase): Promise<AgentAction | null> {
  try {
    const decision = await requestJson<RemoteDecision>('/api/agent/decide', {
      context: toSafeContext(caseData),
    })
    const action = toAgentAction(caseData, decision)
    if (!action) throw new Error('Policy와 현재 Case에 맞지 않는 Agent 행동입니다.')
    return action
  } catch (error) {
    console.warn('OpenAI Decision Engine을 사용할 수 없어 규칙 기반 판단으로 전환합니다.', error)
    return null
  }
}

export async function replyWithOpenAI(
  caseData: CsCase,
  customerMessage: string,
): Promise<string | null> {
  try {
    const compensation = caseData.issueType === 'delivery_delay'
      ? evaluateDelayCompensation(caseData)
      : null
    const result = await requestJson<{ message: string }>('/api/agent/reply', {
      context: toSafeContext(caseData),
      compensation,
      customerMessage,
    })
    return result.message.trim() || null
  } catch (error) {
    console.warn('OpenAI 후속 답변을 사용할 수 없어 규칙 기반 답변으로 전환합니다.', error)
    return null
  }
}
