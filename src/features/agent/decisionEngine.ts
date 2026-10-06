import type {
  AgentAction,
  CsCase,
  PolicyResult,
  RiskResult,
  ToolName,
  ToolResult,
} from '../cs'
import { decideWithOpenAI } from './remoteAgent'

const wasCalled = (caseData: CsCase, toolName: ToolName) =>
  caseData.toolHistory.some((log) => log.toolName === toolName)

const latestResult = <T>(caseData: CsCase, toolName: ToolName) =>
  [...caseData.toolHistory]
    .reverse()
    .find((log) => log.toolName === toolName)
    ?.result as ToolResult<T> | undefined

const finishForHumanReview = (customerMessage: string): AgentAction => ({
  type: 'FINISH',
  decision: 'ESCALATE',
  finalAction: 'human_review',
  customerMessage,
})

const nextCommonObservation = (caseData: CsCase): AgentAction | null => {
  if (!wasCalled(caseData, 'get_cs_history')) {
    return {
      type: 'CALL_TOOL',
      toolName: 'get_cs_history',
      input: {
        customerId: caseData.customerId,
        orderId: caseData.orderId,
      },
    }
  }

  if (!wasCalled(caseData, 'get_policy')) {
    return {
      type: 'CALL_TOOL',
      toolName: 'get_policy',
      input: { caseData },
    }
  }

  if (!wasCalled(caseData, 'check_risk')) {
    return {
      type: 'CALL_TOOL',
      toolName: 'check_risk',
      input: { caseData },
    }
  }

  return null
}

/**
 * Demo B에서 Agent Loop와 공통 Tool 연결을 검증하기 위한 첫 Decision Engine이다.
 * Demo ID나 고정 Tool 배열을 사용하지 않고 현재 Case에 없는 Observation을 기준으로
 * 다음 행동을 고른다. 이후 서버 측 LLM Decision Engine으로 교체해도 Controller와
 * Tool 실행부는 그대로 사용할 수 있다.
 */
export async function decideNextActionWithRules(caseData: CsCase): Promise<AgentAction> {
  if (!caseData.order) {
    return {
      type: 'CALL_TOOL',
      toolName: 'get_order',
      input: { orderId: caseData.orderId },
    }
  }

  if (caseData.issueType === 'delivery_delay') {
    if (!caseData.delivery) {
      return {
        type: 'CALL_TOOL',
        toolName: 'get_delivery',
        input: { orderId: caseData.orderId },
      }
    }

    const commonAction = nextCommonObservation(caseData)
    if (commonAction) return commonAction

    const policy = latestResult<PolicyResult>(caseData, 'get_policy')
    const risk = latestResult<RiskResult>(caseData, 'check_risk')
    if (
      policy?.status === 'success'
      && risk?.status === 'success'
      && policy.data.allowedActions.includes('guide_customer')
      && !risk.data.blockedActions.includes('guide_customer')
    ) {
      const delay = caseData.delivery.delayMinutes
      return {
        type: 'FINISH',
        decision: 'AUTO_RESOLVE',
        finalAction: 'guide_customer',
        customerMessage: delay > 0
          ? `예상 도착 시각보다 ${delay}분 지연된 상태로 확인됩니다. 현재 배달 상태를 계속 확인해 주세요.`
          : '예상 도착 시각 전이거나 정상 진행 중인 배달로 확인됩니다.',
      }
    }

    return finishForHumanReview('배달 상태를 자동으로 안내하기 어려워 상담원이 이어서 확인합니다.')
  }

  if (caseData.issueType === 'wrong_delivery') {
    const evidenceUrl = caseData.evidenceUrls.find((url) =>
      !caseData.evidenceAnalysis?.some((analysis) => analysis.evidenceUrl === url),
    )
    if (evidenceUrl) {
      return {
        type: 'CALL_TOOL',
        toolName: 'analyze_evidence',
        input: { evidenceUrl },
      }
    }

    const commonAction = nextCommonObservation(caseData)
    if (commonAction) return commonAction

    const policy = latestResult<PolicyResult>(caseData, 'get_policy')
    const risk = latestResult<RiskResult>(caseData, 'check_risk')
    const redeliveryAllowed =
      policy?.status === 'success'
      && risk?.status === 'success'
      && policy.data.allowedActions.includes('mock_redelivery')
      && !risk.data.blockedActions.includes('mock_redelivery')
    const redeliveryResult = latestResult(caseData, 'redelivery')

    if (redeliveryAllowed && !redeliveryResult) {
      return {
        type: 'CALL_TOOL',
        toolName: 'redelivery',
        input: { caseId: caseData.caseId, orderId: caseData.orderId },
      }
    }
    if (redeliveryAllowed && redeliveryResult?.status === 'success') {
      return {
        type: 'FINISH',
        decision: 'AUTO_RESOLVE',
        finalAction: 'mock_redelivery',
        customerMessage: '오배달 확인 결과 Mock 재배달로 처리했습니다.',
      }
    }

    return finishForHumanReview('오배달 정보를 확인했으며 상담원이 이어서 검토합니다.')
  }

  if (caseData.issueType !== 'missing_item') {
    return finishForHumanReview(
      '현재 자동 처리 범위를 벗어난 문의라 상담원이 확인하도록 전달합니다.',
    )
  }

  if (!caseData.claimedItemName) {
    const candidates = caseData.order?.items.map((item) => item.name).join(', ')
    return {
      type: 'ASK_CUSTOMER',
      question: candidates
        ? `주문 메뉴는 ${candidates}입니다. 이 중 실제로 누락된 메뉴 하나를 알려주세요.`
        : '누락된 메뉴 이름을 알려주세요.',
    }
  }

  const commonAction = nextCommonObservation(caseData)
  if (commonAction) return commonAction

  const policy = latestResult<PolicyResult>(caseData, 'get_policy')
  const risk = latestResult<RiskResult>(caseData, 'check_risk')

  if (policy?.status !== 'success' || risk?.status !== 'success') {
    return finishForHumanReview(
      '정책 또는 위험 정보를 확인하지 못해 상담원이 이어서 확인합니다.',
    )
  }

  const refundAllowed =
    policy.data.allowedActions.includes('mock_refund')
    && !risk.data.blockedActions.includes('mock_refund')

  const refundResult = latestResult(caseData, 'refund')

  if (refundAllowed && !refundResult) {
    const item = caseData.order.items.find(
      (candidate) => candidate.name === caseData.claimedItemName,
    )

    if (!item) {
      return finishForHumanReview(
        '주문에서 요청한 메뉴를 확인하지 못해 상담원이 이어서 확인합니다.',
      )
    }

    return {
      type: 'ASK_CUSTOMER',
      question: `주문 내역, 메뉴 가격, 동일 주문 환불 이력, 처리 정책과 위험 신호를 확인했습니다. ${item.name} ${item.price.toLocaleString('ko-KR')}원은 부분 환불 가능한 상태입니다. 아래에서 처리 방법을 선택해 주세요.`,
    }
  }

  if (refundAllowed && refundResult?.status === 'success') {
    const item = caseData.order.items.find(
      (candidate) => candidate.name === caseData.claimedItemName,
    )
    const amount = item?.price.toLocaleString('ko-KR') ?? '해당'

    return {
      type: 'FINISH',
      decision: 'AUTO_RESOLVE',
      finalAction: 'mock_refund',
      customerMessage: `${caseData.claimedItemName} 누락을 확인해 ${amount}원을 Mock 부분 환불로 처리했습니다.`,
    }
  }

  if (refundResult?.status === 'error') {
    return finishForHumanReview(
      'Mock 환불 처리 중 오류가 발생해 상담원이 이어서 확인합니다.',
    )
  }

  return finishForHumanReview(
    '정책 또는 위험 기준상 자동 환불이 어려워 상담원이 이어서 확인합니다.',
  )
}

export async function decideNextAction(caseData: CsCase): Promise<AgentAction> {
  return await decideWithOpenAI(caseData) ?? decideNextActionWithRules(caseData)
}
