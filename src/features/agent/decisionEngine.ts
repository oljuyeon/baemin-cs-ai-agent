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
      const delay = Math.max(0, caseData.delivery.delayMinutes)
      const message = delay >= 30
        ? `시스템 배송 데이터 기준 예상 도착 시각보다 ${delay}분 지연됐습니다. 주문당 1회 지연 보상 기준에 해당하므로, 아래에서 쿠폰 지급 여부를 확인해 주세요.`
        : delay > 0
          ? `시스템 배송 데이터 기준 예상 도착 시각보다 ${delay}분 지연됐습니다. 현재 배송 상태를 안내해 드릴게요. 30분 이상 지연되면 보상 기준이 적용되며, 배송 알림도 켤 수 있어요.`
          : '예상 도착 시각 전이거나 정상 진행 중입니다. 현재 배송 상태를 안내하고 배송 알림을 켤 수 있어요.'
      return {
        type: 'FINISH',
        decision: 'AUTO_RESOLVE',
        finalAction: 'guide_customer',
        customerMessage: message,
      }
    }

    return finishForHumanReview('배달 상태를 자동으로 안내하기 어려워 상담원이 이어서 확인합니다.')
  }

  if (caseData.issueType === 'wrong_delivery') {
    if (caseData.evidenceUrls.length === 0) {
      return {
        type: 'ASK_CUSTOMER',
        waitStatus: 'WAITING_EVIDENCE',
        question: '오배달 확인을 위해 받은 음식과 포장지 또는 영수증 사진을 첨부해 주세요. 사진은 보조 증빙으로만 사용하며, 사진만으로 책임을 단정하지 않아요.',
      }
    }

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
    const refundAllowed =
      policy?.status === 'success'
      && risk?.status === 'success'
      && policy.data.allowedActions.includes('mock_refund')
      && !risk.data.blockedActions.includes('mock_refund')
    const redeliveryAllowed =
      policy?.status === 'success'
      && risk?.status === 'success'
      && policy.data.allowedActions.includes('mock_redelivery')
      && !risk.data.blockedActions.includes('mock_redelivery')
    const refundResult = latestResult(caseData, 'refund')
    const redeliveryResult = latestResult(caseData, 'redelivery')
    if (refundResult?.status === 'success') {
      return {
        type: 'FINISH',
        decision: 'AUTO_RESOLVE',
        finalAction: 'mock_refund',
        customerMessage: `오배달 해결 방식으로 주문 금액 ${caseData.order.totalAmount.toLocaleString('ko-KR')}원을 Mock 환불 처리했습니다.`,
      }
    }
    if (redeliveryResult?.status === 'success') {
      return {
        type: 'FINISH',
        decision: 'AUTO_RESOLVE',
        finalAction: 'mock_redelivery',
        customerMessage: '고객이 선택한 해결 방식에 따라 올바른 메뉴의 Mock 재배달을 요청했습니다.',
      }
    }

    if (refundAllowed || redeliveryAllowed) {
      return {
        type: 'ASK_CUSTOMER',
        waitStatus: 'ACTION_READY',
        question: '주문·증빙·정책·위험 신호를 확인했습니다. 가능한 해결 방법을 아래에서 선택해 주세요. 사진 분석은 보조 근거이며 책임 주체를 확정하지 않습니다.',
      }
    }

    if (risk?.status === 'success' && risk.data.blockedActions.some(
      (action) => action === 'mock_refund' || action === 'mock_redelivery',
    )) {
      return finishForHumanReview('증빙 불일치 또는 반복 신고 등 위험 신호가 있어 자동 처리하지 않고 상담원이 전체 맥락을 검토합니다.')
    }

    if (!caseData.merchantConfirmation) {
      return {
        type: 'CALL_TOOL',
        toolName: 'request_merchant_confirmation',
        input: {
          caseId: caseData.caseId,
          orderId: caseData.orderId,
          issueType: caseData.issueType,
          customerClaim: caseData.customerClaim,
          evidenceUrl: caseData.evidenceUrls[0],
        },
      }
    }

    return finishForHumanReview('고객 증빙과 매장 확인 결과만으로 귀책을 확정하기 어려워 상담원이 배송 과정까지 이어서 검토합니다.')
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
  const redeliveryAllowed =
    policy.data.allowedActions.includes('mock_redelivery')
    && !risk.data.blockedActions.includes('mock_redelivery')
  const redeliveryResult = latestResult(caseData, 'redelivery')

  if (refundAllowed && refundResult?.status === 'success') {
    const item = caseData.order.items.find(
      (candidate) => candidate.name === caseData.claimedItemName,
    )
    return {
      type: 'FINISH',
      decision: 'AUTO_RESOLVE',
      finalAction: 'mock_refund',
      customerMessage: `${caseData.claimedItemName} 누락에 대해 ${item?.price.toLocaleString('ko-KR') ?? '해당'}원을 Mock 부분 환불로 처리했습니다.`,
    }
  }

  if (redeliveryAllowed && redeliveryResult?.status === 'success') {
    return {
      type: 'FINISH',
      decision: 'AUTO_RESOLVE',
      finalAction: 'mock_redelivery',
      customerMessage: `${caseData.claimedItemName} 누락 해결 방식으로 Mock 재배달을 요청했습니다.`,
    }
  }

  if ((refundAllowed || redeliveryAllowed) && !refundResult && !redeliveryResult) {
    const item = caseData.order.items.find(
      (candidate) => candidate.name === caseData.claimedItemName,
    )
    if (!item) {
      return finishForHumanReview('주문에서 요청한 메뉴를 확인하지 못해 상담원이 이어서 확인합니다.')
    }
    return {
      type: 'ASK_CUSTOMER',
      waitStatus: 'ACTION_READY',
      question: `주문 메뉴, ${item.price.toLocaleString('ko-KR')}원 가격, 주문 대비 비율, 최근 유사 신고, 중복 처리와 위험 신호를 확인했습니다. 가능한 해결 방법을 아래에서 선택해 주세요.`,
    }
  }

  if (refundResult?.status === 'error') {
    return finishForHumanReview(
      'Mock 환불 처리 중 오류가 발생해 상담원이 이어서 확인합니다.',
    )
  }

  if (risk.data.blockedActions.some(
    (action) => action === 'mock_refund' || action === 'mock_redelivery',
  )) {
    return finishForHumanReview('중복 처리, 반복 신고 또는 증빙 불일치 위험 신호가 있어 자동 처리하지 않고 상담원이 검토합니다.')
  }

  if (!caseData.merchantConfirmation) {
    return {
      type: 'CALL_TOOL',
      toolName: 'request_merchant_confirmation',
      input: {
        caseId: caseData.caseId,
        orderId: caseData.orderId,
        issueType: caseData.issueType,
        itemName: caseData.claimedItemName,
        customerClaim: caseData.customerClaim,
        evidenceUrl: caseData.evidenceUrls[0],
      },
    }
  }

  return finishForHumanReview(
    '정책·위험 기준 또는 매장 확인 결과상 자동 처리가 어려워 상담원이 전체 맥락을 이어서 확인합니다.',
  )
}

export async function decideNextAction(caseData: CsCase): Promise<AgentAction> {
  // v2 원칙: LLM은 자연어 이해에 사용하고, Action Route는 Policy와 Risk로 결정한다.
  return decideNextActionWithRules(caseData)
}
