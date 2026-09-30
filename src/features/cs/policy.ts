import { findCustomer } from './demoData'
import type { CsCase, PolicyResult, RiskFlag } from './types'

export const LOW_PRICE_LIMIT = 5_000
export const FREQUENT_REFUND_LIMIT_30D = 5

const unique = <T>(values: T[]): T[] => [...new Set(values)]

export function evaluateRisk(caseData: CsCase): RiskFlag[] {
  const risks: RiskFlag[] = []
  const claimedItem = caseData.claimedItemName

  if (
    claimedItem
    && caseData.csHistory.some((record) =>
      record.orderId === caseData.orderId
      && record.itemName === claimedItem
      && record.action === 'mock_refund'
      && record.status === 'completed',
    )
  ) {
    risks.push('duplicate_refund')
  }

  const customer = findCustomer(caseData.customerId)
  if (customer && customer.refundCount30d >= FREQUENT_REFUND_LIMIT_30D) {
    risks.push('frequent_refund')
  }

  if (
    claimedItem
    && caseData.order
    && !caseData.order.items.some((item) => item.name === claimedItem)
  ) {
    risks.push('order_claim_mismatch')
  }

  if (
    caseData.evidenceAnalysis?.some(
      (analysis) => analysis.assessment === 'contradicts_claim',
    )
  ) {
    risks.push('evidence_mismatch')
  }

  return unique(risks)
}

export function evaluatePolicy(caseData: CsCase): PolicyResult {
  if (caseData.merchantConfirmation?.response === 'PACKED') {
    return {
      policyId: 'MERCHANT_CLAIM_CONFLICT',
      requiresMerchantConfirmation: false,
      allowedActions: ['human_review'],
      reason: '고객의 누락 주장과 Merchant의 정상 포장 응답이 충돌합니다.',
    }
  }

  if (caseData.issueType === 'delivery_delay') {
    return {
      policyId: 'DELIVERY_DELAY_GUIDANCE',
      requiresMerchantConfirmation: false,
      allowedActions: ['guide_customer', 'human_review'],
      reason: '배달 상태와 ETA를 기준으로 안내하며 예외 상황만 Human CS로 이관합니다.',
    }
  }

  if (caseData.issueType === 'wrong_delivery') {
    const supportiveEvidence = caseData.evidenceAnalysis?.some(
      (analysis) => analysis.assessment === 'supports_claim',
    ) ?? false
    return {
      policyId: supportiveEvidence
        ? 'WRONG_DELIVERY_WITH_SUPPORTING_EVIDENCE'
        : 'WRONG_DELIVERY_NEEDS_REVIEW',
      requiresMerchantConfirmation: false,
      allowedActions: supportiveEvidence
        ? ['mock_redelivery', 'human_review']
        : ['human_review'],
      reason: supportiveEvidence
        ? '증빙 분석이 고객의 오배달 주장을 뒷받침해 Mock 재배달을 허용합니다.'
        : '사진 첨부 여부만으로 오배달을 확정하지 않고 분석 결과를 추가 검토합니다.',
    }
  }

  if (caseData.issueType === 'missing_item') {
    const item = caseData.order?.items.find((candidate) => candidate.name === caseData.claimedItemName)

    if (!item) {
      return {
        policyId: 'MISSING_ITEM_NEEDS_MORE_INFO',
        requiresMerchantConfirmation: false,
        allowedActions: ['human_review'],
        reason: '누락 메뉴 또는 주문 정보를 추가로 확인해야 합니다.',
      }
    }

    if (item.price > LOW_PRICE_LIMIT && !caseData.merchantConfirmation?.response) {
      return {
        policyId: 'HIGH_PRICE_MERCHANT_CONFIRMATION',
        requiresMerchantConfirmation: true,
        allowedActions: ['human_review'],
        reason: `메뉴 가격이 ${LOW_PRICE_LIMIT.toLocaleString('ko-KR')}원을 초과해 Merchant 확인이 필요합니다.`,
      }
    }

    return {
      policyId: 'MISSING_ITEM_AUTO_RESOLUTION',
      requiresMerchantConfirmation: false,
      allowedActions: ['mock_refund', 'mock_redelivery', 'human_review'],
      reason: caseData.merchantConfirmation?.response === 'POSSIBLE_MISSING'
        ? 'Merchant가 누락 가능성을 인정해 Mock 환불 또는 재배달을 허용합니다.'
        : '저가 메뉴 누락으로 Mock 환불 또는 재배달을 허용합니다.',
    }
  }

  return {
    policyId: 'OUT_OF_SCOPE',
    requiresMerchantConfirmation: false,
    allowedActions: ['guide_customer', 'human_review'],
    reason: 'MVP 범위 밖 문의이므로 안내하거나 Human CS로 이관합니다.',
  }
}
