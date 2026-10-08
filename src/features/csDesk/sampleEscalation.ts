import {
  agentTools,
  caseStore,
  type CsCase,
  type IssueType,
  type MerchantResponse,
  type ToolCallLogDraft,
} from '../cs'

export interface EscalationSample {
  id: string
  orderId: string
  issueType: IssueType
  customerClaim: string
  claimedItemName: string
  evidenceUrl?: string
  merchant?: {
    response: MerchantResponse
    comment: string
  }
  reason: string
  summary: string
}

const samples: EscalationSample[] = [
  {
    id: 'packed-rice',
    orderId: 'A1003',
    issueType: 'missing_item',
    claimedItemName: '공깃밥',
    customerClaim: '불고기정식은 왔는데 공깃밥이 없어요.',
    evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    merchant: {
      response: 'DENIED',
      comment: '공깃밥까지 넣어서 포장했습니다.',
    },
    reason: '고객은 공깃밥 누락을 주장하고, 매장은 포장했다고 진술해 주장이 충돌합니다.',
    summary: '주문 A1003, 공깃밥 누락 주장. 증빙은 일부만 확인되고 매장 응답은 포장 진술입니다.',
  },
  {
    id: 'unknown-chicken',
    orderId: 'A1005',
    issueType: 'wrong_delivery',
    claimedItemName: '양념치킨',
    customerClaim: '양념치킨을 주문했는데 다른 음식이 왔어요.',
    evidenceUrl: 'mock://evidence/wrong-delivery-supports-claim.jpg',
    merchant: {
      response: 'UNKNOWN',
      comment: '해당 시간대 포장 장면을 확인하기 어렵습니다.',
    },
    reason: '매장이 확인 불가로 응답해 자동 재배달을 진행하지 못했습니다.',
    summary: '주문 A1005, 오배달 주장. 증빙은 주장을 뒷받침하고 매장 응답은 UNKNOWN입니다.',
  },
  {
    id: 'frequent-stew',
    orderId: 'A1008',
    issueType: 'missing_item',
    claimedItemName: '된장찌개',
    customerClaim: '된장찌개가 포장에서 빠졌어요.',
    merchant: {
      response: 'POSSIBLE',
      comment: '포장 중 누락됐을 수 있습니다.',
    },
    reason: '최근 30일 환불이 5회라 자동 환불을 멈추고 상담원 확인이 필요합니다.',
    summary: '주문 A1008, 된장찌개 누락. 매장은 누락 가능성을 확인했으나 반복 환불 리스크가 있습니다.',
  },
  {
    id: 'evidence-tteok',
    orderId: 'A1004',
    issueType: 'wrong_delivery',
    claimedItemName: '떡볶이',
    customerClaim: '떡볶이 대신 다른 음식이 왔어요.',
    evidenceUrl: 'mock://evidence/contradicts-claim.jpg',
    reason: '첨부 사진이 고객이 말한 수령 메뉴와 달라 자동 처리를 멈췄습니다.',
    summary: '주문 A1004, 오배달 주장. 증빙 분석은 고객 설명과 맞지 않습니다.',
  },
  {
    id: 'mismatch-cider',
    orderId: 'A1002',
    issueType: 'missing_item',
    claimedItemName: '사이다',
    customerClaim: '사이다가 안 왔어요.',
    reason: '주문에 없는 메뉴를 누락으로 주장해 자동 환불을 진행하지 않았습니다.',
    summary: '주문 A1002에는 후라이드치킨과 콜라만 있습니다. 사이다 누락 주장은 주문과 맞지 않습니다.',
  },
]

const sampleKey = (orderId: string, issueType: IssueType, claimedItemName: string) =>
  `${orderId}:${issueType}:${claimedItemName}`

const matchesSample = (caseData: CsCase, sample: EscalationSample) =>
  sampleKey(caseData.orderId, caseData.issueType, caseData.claimedItemName ?? '')
  === sampleKey(sample.orderId, sample.issueType, sample.claimedItemName)

export function samplesForCs() {
  return samples
}

export function waitingSampleIds() {
  const waiting = caseStore.getCasesForRole('cs').filter((caseData) => caseData.status === 'ESCALATED')
  return samples.filter((sample) => waiting.some((caseData) => matchesSample(caseData, sample))).map((sample) => sample.id)
}

const tagBySample: Record<string, string> = {
  'packed-rice': 'claim_conflict',
  'unknown-chicken': 'unknown',
  'frequent-stew': 'frequent_refund',
  'evidence-tteok': 'evidence_mismatch',
  'mismatch-cider': 'order_claim_mismatch',
}

export function queueTagForCase(caseData: CsCase) {
  const sample = samples.find((item) => matchesSample(caseData, item))
  if (sample) return tagBySample[sample.id]
  if (caseData.riskFlags.includes('frequent_refund')) return 'frequent_refund'
  if (caseData.riskFlags.includes('evidence_mismatch')) return 'evidence_mismatch'
  if (caseData.riskFlags.includes('order_claim_mismatch')) return 'order_claim_mismatch'
  if (caseData.merchantConfirmation?.response === 'DENIED') return 'claim_conflict'
  if (caseData.merchantConfirmation?.response === 'UNKNOWN') return 'unknown'
  return null
}

const toolLog = (
  toolName: ToolCallLogDraft['toolName'],
  input: unknown,
  result: ToolCallLogDraft['result'],
): ToolCallLogDraft => {
  const at = new Date().toISOString()
  return { toolName, input, result, startedAt: at, completedAt: at }
}

async function createOne(sample: EscalationSample) {
  const orderResult = await agentTools.getOrder({ orderId: sample.orderId })
  if (orderResult.status !== 'success') return null
  const order = orderResult.data
  const deliveryResult = await agentTools.getDelivery({ orderId: sample.orderId })
  const historyResult = await agentTools.getCsHistory({
    customerId: order.customerId,
    orderId: sample.orderId,
  })
  const evidenceResult = sample.evidenceUrl
    ? await agentTools.analyzeEvidence({ evidenceUrl: sample.evidenceUrl })
    : null

  const created = caseStore.createCase({
    customerId: order.customerId,
    orderId: order.orderId,
    storeId: order.storeId,
    issueType: sample.issueType,
    customerClaim: sample.customerClaim,
    claimedItemName: sample.claimedItemName,
    evidenceUrls: sample.evidenceUrl ? [sample.evidenceUrl] : [],
  })

  const merchantResult = sample.merchant
    ? await agentTools.requestMerchantConfirmation({
      caseId: created.caseId,
      orderId: order.orderId,
      issueType: sample.issueType,
      itemName: sample.claimedItemName,
      customerClaim: sample.customerClaim,
      evidenceUrl: sample.evidenceUrl,
    })
    : null
  const merchantConfirmation = merchantResult?.status === 'success' && sample.merchant
    ? {
      ...merchantResult.data,
      response: sample.merchant.response,
      comment: sample.merchant.comment,
      status: 'completed' as const,
      respondedAt: new Date().toISOString(),
    }
    : undefined

  const draft: CsCase = {
    ...created,
    order,
    delivery: deliveryResult.status === 'success' ? deliveryResult.data : undefined,
    csHistory: historyResult.status === 'success' ? historyResult.data : [],
    evidenceAnalysis: evidenceResult?.status === 'success' ? [evidenceResult.data] : undefined,
    merchantConfirmation,
  }
  const policyResult = await agentTools.getPolicy({ caseData: draft })
  const riskResult = await agentTools.checkRisk({ caseData: draft })
  const escalateResult = await agentTools.escalateToHuman({
    caseId: created.caseId,
    reason: sample.reason,
    summary: sample.summary,
  })

  const logs = [
    toolLog('get_order', { orderId: sample.orderId }, orderResult),
    toolLog('get_delivery', { orderId: sample.orderId }, deliveryResult),
    toolLog('get_cs_history', { customerId: order.customerId, orderId: sample.orderId }, historyResult),
    evidenceResult ? toolLog('analyze_evidence', { evidenceUrl: sample.evidenceUrl }, evidenceResult) : null,
    merchantResult
      ? toolLog('request_merchant_confirmation', {
        caseId: created.caseId,
        orderId: order.orderId,
        issueType: sample.issueType,
        itemName: sample.claimedItemName,
      }, merchantResult)
      : null,
    toolLog('get_policy', { caseId: created.caseId }, policyResult),
    toolLog('check_risk', { caseId: created.caseId }, riskResult),
    toolLog('escalate_to_human', { caseId: created.caseId, reason: sample.reason }, escalateResult),
  ].filter((entry): entry is ToolCallLogDraft => entry !== null)

  const respondedAt = merchantConfirmation?.respondedAt
  caseStore.commitCase(created.caseId, {
    changes: {
      status: 'ESCALATED',
      decision: 'ESCALATE',
      order,
      delivery: draft.delivery,
      csHistory: draft.csHistory,
      evidenceAnalysis: draft.evidenceAnalysis,
      merchantConfirmation,
      appliedPolicy: policyResult.status === 'success' ? policyResult.data.policyId : undefined,
      riskFlags: riskResult.status === 'success' ? riskResult.data.flags : [],
      escalationReason: sample.reason,
      agentSummary: sample.summary,
    },
    history: [
      ...(merchantConfirmation ? [
        {
          actor: 'agent' as const,
          event: 'MERCHANT_REQUESTED' as const,
          detail: '매장 확인을 요청했습니다.',
        },
        {
          actor: 'merchant' as const,
          event: 'MERCHANT_RESPONDED' as const,
          detail: `Merchant 응답 저장: ${merchantConfirmation.response}`,
          createdAt: respondedAt,
        },
      ] : []),
      {
        actor: 'agent' as const,
        event: 'ESCALATED' as const,
        fromStatus: 'NEW' as const,
        toStatus: 'ESCALATED' as const,
        detail: sample.reason,
      },
    ],
    toolHistory: logs,
  })

  return created.caseId
}

export async function createSampleEscalation(sampleId: string) {
  const sample = samples.find((item) => item.id === sampleId)
  if (!sample) return { status: 'failed' as const }
  const existing = caseStore.getCasesForRole('cs').find((caseData) =>
    caseData.status === 'ESCALATED' && matchesSample(caseData, sample),
  )
  if (existing) return { status: 'already_waiting' as const, caseId: existing.caseId }
  try {
    const caseId = await createOne(sample)
    if (!caseId) return { status: 'failed' as const }
    return { status: 'created' as const, caseId }
  } catch {
    return { status: 'failed' as const }
  }
}

export async function createRemainingEscalations() {
  const waiting = new Set(waitingSampleIds())
  const created: string[] = []
  for (const sample of samples) {
    if (waiting.has(sample.id)) continue
    const result = await createSampleEscalation(sample.id)
    if (result.status === 'created') created.push(result.caseId)
  }
  return created
}
