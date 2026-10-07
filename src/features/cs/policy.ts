import { calculateDelayMinutes, findCustomer } from './demoData'
import { PROJECT_SIMULATION_POLICY } from './projectPolicy'
import type {
  CsCase,
  FinalAction,
  Liability,
  MerchantResponse,
  PolicyResult,
  RiskFlag,
  RiskResult,
} from './types'

export const LOW_PRICE_LIMIT = PROJECT_SIMULATION_POLICY.autoRefundMaxAmount
export const FREQUENT_REFUND_LIMIT_30D = PROJECT_SIMULATION_POLICY.maxSimilarClaims30d
export const DELAY_COMPENSATION_MINUTES = PROJECT_SIMULATION_POLICY.delayCompensationThresholdMinutes
export const DELAY_COMPENSATION_AMOUNT = PROJECT_SIMULATION_POLICY.delayCompensationAmount

export type DelayCompensationResult = {
  eligible: boolean
  delayMinutes: number | null
  minimumMinutes: number
  amount: number
  reason: 'eligible' | 'missing_delivery' | 'insufficient_delay' | 'already_issued'
}

const unique = <T>(values: T[]): T[] => [...new Set(values)]

const PROVISIONAL_CONSTRAINT = '매장 확인이 끝나기 전에는 이 응답으로 환불, 재배달, 이관을 확정하지 않는다.'

const riskCopy: Record<RiskFlag, { blockedActions: FinalAction[], reason: string }> = {
  duplicate_refund: {
    blockedActions: ['mock_refund'],
    reason: '같은 주문과 같은 문제의 환불 이력이 있어 추가 환불을 막습니다.',
  },
  frequent_refund: {
    blockedActions: ['mock_refund', 'mock_redelivery'],
    reason: `최근 30일 유사 처리가 ${FREQUENT_REFUND_LIMIT_30D}회를 초과해 자동 환불과 재배달을 막습니다.`,
  },
  order_claim_mismatch: {
    blockedActions: ['mock_refund', 'mock_redelivery'],
    reason: '주문에 없는 메뉴 주장이라 그 상품의 환불과 재배달을 막습니다.',
  },
  evidence_mismatch: {
    blockedActions: ['mock_refund', 'mock_redelivery'],
    reason: '증빙이 주장과 충돌해 환불과 재배달을 막습니다.',
  },
  high_value_claim: {
    blockedActions: [],
    reason: '자동 처리 금액 또는 주문 대비 비율 기준을 초과해 매장 확인이 필요합니다.',
  },
}

const merchantConfirmed = (response?: MerchantResponse) =>
  response === 'CONFIRMED' || response === 'POSSIBLE'

const claimedItem = (caseData: CsCase) => caseData.order?.items.find(
  (candidate) => candidate.name === caseData.claimedItemName,
)

export const isAutomaticMissingCandidate = (caseData: CsCase) => {
  const item = claimedItem(caseData)
  if (!item || !caseData.order || caseData.order.totalAmount <= 0) return false
  return item.price <= PROJECT_SIMULATION_POLICY.autoRefundMaxAmount
    && item.price / caseData.order.totalAmount
      <= PROJECT_SIMULATION_POLICY.autoRefundMaxOrderRatio
}

export function inferLiability(caseData: CsCase): Liability {
  const response = caseData.merchantConfirmation?.response
  if (response === 'CONFIRMED') return 'MERCHANT'
  if (response === 'DENIED' || response === 'UNKNOWN') return 'UNKNOWN'
  if (caseData.issueType === 'delivery_delay') {
    if (!caseData.delivery) return 'UNKNOWN'
    if (!caseData.delivery.riderAssignedAt) return 'PLATFORM'
    if (caseData.delivery.pickedUpAt) return 'DELIVERY'
  }
  return caseData.liability ?? 'UNKNOWN'
}

const decide = (
  caseData: CsCase,
  result: Omit<PolicyResult, 'constraints'> & { constraints?: string[] },
): PolicyResult => {
  const constraints = [...(result.constraints ?? [])]
  const confirmation = caseData.merchantConfirmation
  if (confirmation?.status === 'waiting' && confirmation.response) {
    constraints.push(PROVISIONAL_CONSTRAINT)
  }
  return { ...result, constraints }
}

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
  if (customer && customer.refundCount30d > FREQUENT_REFUND_LIMIT_30D) {
    risks.push('frequent_refund')
  }

  if (caseData.issueType === 'missing_item' && claimedItem && !isAutomaticMissingCandidate(caseData)) {
    risks.push('high_value_claim')
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

export function assessRisk(caseData: CsCase): RiskResult {
  const flags = evaluateRisk(caseData)
  if (flags.length === 0) {
    return { flags, blockedActions: [], reason: '리스크 플래그가 없습니다.' }
  }
  return {
    flags,
    blockedActions: unique(flags.flatMap((flag) => riskCopy[flag].blockedActions)),
    reason: flags.map((flag) => riskCopy[flag].reason).join(' '),
  }
}

/** 수업용 Mock 정책: 실측 지연 30분 이상이며 동일 주문 쿠폰이 아직 없을 때만 허용한다. */
export function evaluateDelayCompensation(caseData: CsCase): DelayCompensationResult {
  const base = {
    minimumMinutes: DELAY_COMPENSATION_MINUTES,
    amount: DELAY_COMPENSATION_AMOUNT,
  }

  if (!caseData.delivery) {
    return { ...base, eligible: false, delayMinutes: null, reason: 'missing_delivery' }
  }

  const delayMinutes = Math.max(0, calculateDelayMinutes(caseData.delivery))
  const alreadyIssued = caseData.finalAction === 'mock_coupon'
    || caseData.csHistory.some((record) =>
      record.orderId === caseData.orderId
      && record.action === 'mock_coupon'
      && record.status === 'completed',
    )

  if (alreadyIssued) {
    return { ...base, eligible: false, delayMinutes, reason: 'already_issued' }
  }

  if (delayMinutes < DELAY_COMPENSATION_MINUTES) {
    return { ...base, eligible: false, delayMinutes, reason: 'insufficient_delay' }
  }

  return { ...base, eligible: true, delayMinutes, reason: 'eligible' }
}

export function evaluatePolicy(caseData: CsCase): PolicyResult {
  const response = caseData.merchantConfirmation?.response

  if (response === 'DENIED') {
    return decide(caseData, {
      policyId: 'MERCHANT_CLAIM_CONFLICT',
      allowedActions: ['human_review'],
      constraints: [
        '포장 응답은 매장 진술이며 확정 사실이 아니다.',
        '고객 주장과 충돌하는 동안 환불과 재배달을 확정하지 않는다.',
      ],
      reason: '매장이 해당 상품을 포장했다고 진술해 고객 주장과 충돌합니다.',
    })
  }

  if (response === 'UNKNOWN' && caseData.merchantConfirmation?.status === 'completed') {
    return decide(caseData, {
      policyId: 'MERCHANT_UNKNOWN',
      allowedActions: ['human_review'],
      constraints: [
        '확인 불가이므로 환불과 재배달을 허용하지 않는다.',
        '이 값만으로 상담원 이관을 확정하지 않는다. 추가 질문이나 다른 근거를 먼저 볼 수 있다.',
      ],
      reason: '매장이 현재 확인하기 어렵다고 응답했습니다.',
    })
  }

  if (caseData.issueType === 'delivery_delay') {
    if (!caseData.delivery) {
      return decide(caseData, {
        policyId: 'DELIVERY_DELAY_NEEDS_DATA',
        allowedActions: ['guide_customer', 'human_review'],
        reason: '배달 정보가 없어 예상 도착 시각 대비 지연 시간을 계산할 수 없습니다.',
      })
    }

    const delayMinutes = calculateDelayMinutes(caseData.delivery)
    if (delayMinutes >= DELAY_COMPENSATION_MINUTES) {
      return decide(caseData, {
        policyId: 'DELIVERY_COMPENSATION_ELIGIBLE',
        allowedActions: ['guide_customer', 'mock_coupon', 'human_review'],
        constraints: ['동일 주문의 지연 보상은 한 번만 지급한다.'],
        reason: `예상 도착 시각보다 ${delayMinutes}분 지연되어 프로젝트 보상 기준을 충족합니다.`,
      })
    }

    if (delayMinutes > 0) {
      return decide(caseData, {
        policyId: 'DELIVERY_DELAYED',
        allowedActions: ['guide_customer', 'human_review'],
        reason: `예상 도착 시각보다 ${delayMinutes}분 지나 지연으로 봅니다.`,
      })
    }

    return decide(caseData, {
      policyId: 'DELIVERY_ON_TIME',
      allowedActions: ['guide_customer', 'human_review'],
      reason: '예상 도착 시각이 지나지 않아 정상 진행으로 봅니다.',
    })
  }

  if (caseData.issueType === 'wrong_delivery') {
    const supportiveEvidence = caseData.evidenceAnalysis?.some(
      (analysis) => analysis.assessment === 'supports_claim',
    ) ?? false

    if (response === 'CONFIRMED') {
      return decide(caseData, {
        policyId: 'WRONG_DELIVERY_AFTER_ADMISSION',
        allowedActions: ['mock_refund', 'mock_redelivery', 'human_review'],
        constraints: supportiveEvidence ? [] : ['증빙이 주장을 확정하지는 않습니다.'],
        reason: '매장이 누락을 인정해 Mock 재배달을 허용합니다.',
      })
    }

    if (supportiveEvidence && response === 'POSSIBLE') {
      return decide(caseData, {
        policyId: 'WRONG_DELIVERY_REDELIVERY_AFTER_MERCHANT',
        allowedActions: ['mock_refund', 'mock_redelivery', 'human_review'],
        reason: '증빙과 매장의 누락 가능성 확인이 모두 있어 Mock 재배달을 허용합니다.',
      })
    }

    if (supportiveEvidence && !response) {
      return decide(caseData, {
        policyId: 'WRONG_DELIVERY_CLEAR_LOW_RISK',
        allowedActions: ['mock_refund', 'mock_redelivery', 'human_review'],
        constraints: ['사진 분석은 보조 증빙이며 귀책 주체를 확정하지 않는다.'],
        reason: '주문과 다른 음식이라는 보조 증빙이 명확해 자동 해결 후보입니다.',
      })
    }

    return decide(caseData, {
      policyId: 'WRONG_DELIVERY_NEEDS_MERCHANT',
      allowedActions: ['human_review'],
      constraints: ['불명확한 오배달은 매장 확인 후 처리한다.'],
      reason: '오배달 증빙이 불명확해 매장 확인이 필요합니다.',
    })
  }

  if (caseData.issueType === 'missing_item') {
    const item = claimedItem(caseData)

    if (!item) {
      return decide(caseData, {
        policyId: 'MISSING_ITEM_NEEDS_MORE_INFO',
        allowedActions: ['human_review'],
        reason: '누락 메뉴 또는 주문 정보를 추가로 확인해야 합니다.',
      })
    }

    if (response === 'CONFIRMED') {
      return decide(caseData, {
        policyId: 'MISSING_ITEM_ADMITTED',
        allowedActions: ['mock_refund', 'mock_redelivery', 'human_review'],
        reason: '매장이 누락을 인정해 Mock 환불 또는 재배달을 허용합니다.',
      })
    }

    if (merchantConfirmed(response)) {
      return decide(caseData, {
        policyId: 'MISSING_ITEM_AFTER_MERCHANT_CONFIRMATION',
        allowedActions: ['mock_refund', 'mock_redelivery', 'human_review'],
        reason: '매장이 누락 가능성을 확인해 Mock 환불 또는 재배달을 허용합니다.',
      })
    }

    if (!isAutomaticMissingCandidate(caseData)) {
      return decide(caseData, {
        policyId: 'MISSING_ITEM_NEEDS_MERCHANT',
        allowedActions: ['human_review'],
        constraints: [
          `자동 처리 기준은 ${LOW_PRICE_LIMIT.toLocaleString('ko-KR')}원 이하이면서 주문 금액의 ${Math.round(PROJECT_SIMULATION_POLICY.autoRefundMaxOrderRatio * 100)}% 이하입니다.`,
        ],
        reason: '자동 처리 금액 또는 주문 대비 비율 기준을 초과해 매장 확인이 필요합니다.',
      })
    }

    return decide(caseData, {
      policyId: 'MISSING_ITEM_AUTO_CANDIDATE',
      allowedActions: ['mock_refund', 'mock_redelivery', 'human_review'],
      constraints: ['고객이 환불 또는 재배달을 명시적으로 선택한 뒤 실행한다.'],
      reason: '금액·주문 비율 기준을 충족해 자동 해결 후보입니다.',
    })
  }

  return decide(caseData, {
    policyId: 'OUT_OF_SCOPE',
    allowedActions: ['guide_customer', 'human_review'],
    reason: 'MVP 범위 밖 문의이므로 안내하거나 Human CS로 이관합니다.',
  })
}
