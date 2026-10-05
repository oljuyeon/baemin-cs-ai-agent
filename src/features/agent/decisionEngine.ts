import type {
  AgentAction,
  CsCase,
  PolicyResult,
  RiskResult,
  ToolName,
  ToolResult,
} from '../cs'

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

/**
 * Demo B에서 Agent Loop와 공통 Tool 연결을 검증하기 위한 첫 Decision Engine이다.
 * Demo ID나 고정 Tool 배열을 사용하지 않고 현재 Case에 없는 Observation을 기준으로
 * 다음 행동을 고른다. 이후 서버 측 LLM Decision Engine으로 교체해도 Controller와
 * Tool 실행부는 그대로 사용할 수 있다.
 */
export async function decideNextAction(caseData: CsCase): Promise<AgentAction> {
  if (caseData.issueType !== 'missing_item') {
    return finishForHumanReview(
      '현재 자동 처리 범위를 벗어난 문의라 상담원이 확인하도록 전달합니다.',
    )
  }

  if (!caseData.order) {
    return {
      type: 'CALL_TOOL',
      toolName: 'get_order',
      input: { orderId: caseData.orderId },
    }
  }

  if (!caseData.claimedItemName) {
    return {
      type: 'ASK_CUSTOMER',
      question: '누락된 메뉴 이름을 알려주세요.',
    }
  }

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
      type: 'CALL_TOOL',
      toolName: 'refund',
      input: {
        caseId: caseData.caseId,
        orderId: caseData.orderId,
        itemName: item.name,
        amount: item.price,
      },
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
