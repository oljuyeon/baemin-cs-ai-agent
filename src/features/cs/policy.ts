import { calculateDelayMinutes, findCustomer } from './demoData'
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
      reason: '고객 주장과 Merchant의 정상 포장 응답이 충돌합니다.',
    }
  }

  if (caseData.merchantConfirmation?.response === 'UNKNOWN') {
    return {
      policyId: 'MERCHANT_UNKNOWN',
      requiresMerchantConfirmation: false,
      allowedActions: ['human_review'],
      reason: 'Merchant가 확인 불가로 응답해 상담원 이관이 필요합니다.',
    }
  }

  if (caseData.issueType === 'delivery_delay') {
    if (!caseData.delivery) {
      return {
        policyId: 'DELIVERY_DELAY_NEEDS_DATA',
        requiresMerchantConfirmation: false,
        allowedActions: ['guide_customer', 'human_review'],
        reason: '배달 정보가 없어 예상 도착 시각 대비 지연 시간을 계산할 수 없습니다.',
      }
    }

    const delayMinutes = calculateDelayMinutes(caseData.delivery)
    if (delayMinutes > 0) {
      return {
        policyId: 'DELIVERY_DELAYED',
        requiresMerchantConfirmation: false,
        allowedActions: ['guide_customer', 'human_review'],
        reason: `예상 도착 시각보다 ${delayMinutes}분 지나 지연으로 봅니다.`,
      }
    }

    return {
      policyId: 'DELIVERY_ON_TIME',
      requiresMerchantConfirmation: false,
      allowedActions: ['guide_customer', 'human_review'],
      reason: '예상 도착 시각이 지나지 않아 정상 진행으로 봅니다.',
    }
  }

  if (caseData.issueType === 'wrong_delivery') {
    const supportiveEvidence = caseData.evidenceAnalysis?.some(
      (analysis) => analysis.assessment === 'supports_claim',
    ) ?? false
    const merchantConfirmed = caseData.merchantConfirmation?.response === 'POSSIBLE_MISSING'

    if (supportiveEvidence && merchantConfirmed) {
      return {
        policyId: 'WRONG_DELIVERY_REDELIVERY_AFTER_MERCHANT',
        requiresMerchantConfirmation: false,
        allowedActions: ['mock_redelivery', 'human_review'],
        reason: '증빙과 Merchant 확인이 모두 있어 Mock 재배달을 허용합니다.',
      }
    }

    if (supportiveEvidence) {
      return {
        policyId: 'WRONG_DELIVERY_NEEDS_MERCHANT',
        requiresMerchantConfirmation: true,
        allowedActions: ['human_review'],
        reason: '증빙이 오배달 주장을 뒷받침하지만 재배달 전에 Merchant 확인이 필요합니다.',
      }
    }

    return {
      policyId: 'WRONG_DELIVERY_NEEDS_REVIEW',
      requiresMerchantConfirmation: false,
      allowedActions: ['human_review'],
      reason: '오배달을 확정할 증빙이 없어 추가 검토가 필요합니다.',
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

    const merchantConfirmed = caseData.merchantConfirmation?.response === 'POSSIBLE_MISSING'

    if (merchantConfirmed) {
      return {
        policyId: 'MISSING_ITEM_AFTER_MERCHANT_CONFIRMATION',
        requiresMerchantConfirmation: false,
        allowedActions: ['mock_refund', 'mock_redelivery', 'human_review'],
        reason: 'Merchant가 누락 가능성을 확인해 Mock 환불 또는 재배달을 허용합니다.',
      }
    }

    if (item.price > LOW_PRICE_LIMIT) {
      return {
        policyId: 'HIGH_PRICE_MERCHANT_CONFIRMATION',
        requiresMerchantConfirmation: true,
        allowedActions: ['human_review'],
        reason: `메뉴 가격이 ${LOW_PRICE_LIMIT.toLocaleString('ko-KR')}원을 초과해 Merchant 확인이 필요합니다.`,
      }
    }

    return {
      policyId: 'LOW_PRICE_MISSING_REFUND',
      requiresMerchantConfirmation: false,
      allowedActions: ['mock_refund', 'human_review'],
      reason: '저가 메뉴 누락으로 Mock 부분 환불을 허용합니다. 재배달은 Merchant 확인 후에만 허용합니다.',
    }
  }

  return {
    policyId: 'OUT_OF_SCOPE',
    requiresMerchantConfirmation: false,
    allowedActions: ['guide_customer', 'human_review'],
    reason: 'MVP 범위 밖 문의이므로 안내하거나 Human CS로 이관합니다.',
  }
}
