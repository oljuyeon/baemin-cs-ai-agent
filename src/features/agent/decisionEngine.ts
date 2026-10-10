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

const customerText = (caseData: CsCase, ko: string, en: string) =>
  caseData.customerLanguage === 'en' ? en : ko

const formatAmount = (caseData: CsCase, amount: number) =>
  caseData.customerLanguage === 'en'
    ? `KRW ${amount.toLocaleString('en-US')}`
    : `${amount.toLocaleString('ko-KR')}원`

const finishForHumanReview = (customerMessage: string): AgentAction => ({
  type: 'FINISH',
  decision: 'ESCALATE',
  finalAction: 'human_review',
  customerMessage,
})

const askCustomerAfterUnapprovedMerchantResponse = (caseData: CsCase): AgentAction | null => {
  const confirmation = caseData.merchantConfirmation
  if (
    confirmation?.status !== 'completed'
    || !confirmation.response
    || confirmation.response === 'CONFIRMED'
  ) return null

  return {
    type: 'ASK_CUSTOMER',
    waitStatus: 'COLLECTING_INFO',
    question: customerText(
      caseData,
      '매장이 아직 환불이나 재배달을 승인하지 않았습니다. 매장 답변을 확인하고 문의를 마치거나, 추가 확인이 필요하면 고객센터에 직접 도움을 요청해 주세요.',
      'The restaurant has not approved a refund or redelivery. You can close the case after reviewing its response or ask a support agent for further help.',
    ),
  }
}

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
        ? customerText(caseData, `시스템 배송 데이터 기준 예상 도착 시각보다 ${delay}분 지연됐습니다. 주문당 1회 지연 보상 기준에 해당하므로, 아래에서 쿠폰 지급 여부를 확인해 주세요.`, `The delivery is ${delay} minutes past the system ETA. It meets the once-per-order delay compensation threshold, so you can check coupon eligibility below.`)
        : delay > 0
          ? customerText(caseData, `시스템 배송 데이터 기준 예상 도착 시각보다 ${delay}분 지연됐습니다. 현재 배송 상태를 안내해 드릴게요. 30분 이상 지연되면 보상 기준이 적용되며, 배송 알림도 켤 수 있어요.`, `The delivery is ${delay} minutes past the system ETA. I can show the current delivery status and enable updates. Compensation applies from a 30-minute delay.`)
          : customerText(caseData, '예상 도착 시각 전이거나 정상 진행 중입니다. 현재 배송 상태를 안내하고 배송 알림을 켤 수 있어요.', 'The order is before its ETA or progressing normally. I can show the current delivery status and enable updates.')
      return {
        type: 'FINISH',
        decision: 'AUTO_RESOLVE',
        finalAction: 'guide_customer',
        customerMessage: message,
      }
    }

    return finishForHumanReview(customerText(caseData, '배달 상태를 자동으로 안내하기 어려워 상담원이 이어서 확인합니다.', 'The delivery status cannot be handled automatically, so a support agent will continue the review.'))
  }

  if (caseData.issueType === 'wrong_delivery') {
    if (caseData.evidenceUrls.length === 0) {
      return {
        type: 'ASK_CUSTOMER',
        waitStatus: 'WAITING_EVIDENCE',
        question: customerText(caseData, '오배달 확인을 위해 받은 음식과 포장지 또는 영수증 사진을 첨부해 주세요. 사진은 보조 증빙으로만 사용하며, 사진만으로 책임을 단정하지 않아요.', 'Please attach photos of the food you received and its packaging or receipt. Photos are supporting evidence and do not determine responsibility on their own.'),
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
        customerMessage: customerText(caseData, `오배달 해결 방식으로 주문 금액 ${formatAmount(caseData, caseData.order.totalAmount)}을 Mock 환불 처리했습니다.`, `A mock refund of ${formatAmount(caseData, caseData.order.totalAmount)} was completed for the wrong delivery.`),
      }
    }
    if (redeliveryResult?.status === 'success') {
      return {
        type: 'FINISH',
        decision: 'AUTO_RESOLVE',
        finalAction: 'mock_redelivery',
        customerMessage: customerText(caseData, '고객이 선택한 해결 방식에 따라 올바른 메뉴의 Mock 재배달을 요청했습니다.', 'A mock redelivery of the correct item was requested based on your choice.'),
      }
    }

    if (refundAllowed || redeliveryAllowed) {
      return {
        type: 'ASK_CUSTOMER',
        waitStatus: 'ACTION_READY',
        question: customerText(caseData, '주문·증빙·정책·위험 신호를 확인했습니다. 가능한 해결 방법을 아래에서 선택해 주세요. 사진 분석은 보조 근거이며 책임 주체를 확정하지 않습니다.', 'I checked the order, evidence, policy, and risk signals. Choose an available option below. Photo analysis is supporting evidence and does not determine responsibility.'),
      }
    }

    if (risk?.status === 'success' && risk.data.blockedActions.some(
      (action) => action === 'mock_refund' || action === 'mock_redelivery',
    )) {
      return finishForHumanReview(customerText(caseData, '증빙 불일치 또는 반복 신고 등 위험 신호가 있어 자동 처리하지 않고 상담원이 전체 맥락을 검토합니다.', 'Risk signals such as conflicting evidence or repeated claims prevent automatic processing, so a support agent will review the full context.'))
    }

    const merchantChoice = askCustomerAfterUnapprovedMerchantResponse(caseData)
    if (merchantChoice) return merchantChoice

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

    return finishForHumanReview(customerText(caseData, '고객 증빙과 매장 확인 결과만으로 귀책을 확정하기 어려워 상담원이 배송 과정까지 이어서 검토합니다.', 'The customer evidence and restaurant response are not enough to determine responsibility, so a support agent will also review the delivery process.'))
  }

  if (caseData.issueType !== 'missing_item') {
    return finishForHumanReview(
      customerText(caseData, '현재 자동 처리 범위를 벗어난 문의라 상담원이 확인하도록 전달합니다.', 'This request is outside the current automatic handling scope and will be sent to a support agent.'),
    )
  }

  if (!caseData.claimedItemName) {
    const candidates = caseData.order?.items.map((item) => item.name).join(', ')
    return {
      type: 'ASK_CUSTOMER',
      question: candidates
        ? customerText(caseData, `주문 메뉴는 ${candidates}입니다. 이 중 실제로 누락된 메뉴 하나를 알려주세요.`, `Your order includes ${candidates}. Please tell me which one item was missing.`)
        : customerText(caseData, '누락된 메뉴 이름을 알려주세요.', 'Please tell me the name of the missing item.'),
    }
  }

  const commonAction = nextCommonObservation(caseData)
  if (commonAction) return commonAction

  const policy = latestResult<PolicyResult>(caseData, 'get_policy')
  const risk = latestResult<RiskResult>(caseData, 'check_risk')

  if (policy?.status !== 'success' || risk?.status !== 'success') {
    return finishForHumanReview(
      customerText(caseData, '정책 또는 위험 정보를 확인하지 못해 상담원이 이어서 확인합니다.', 'Policy or risk information could not be verified, so a support agent will continue the review.'),
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
      customerMessage: customerText(caseData, `${caseData.claimedItemName} 누락에 대해 ${item ? formatAmount(caseData, item.price) : '해당 금액'}을 Mock 부분 환불로 처리했습니다.`, `A mock partial refund${item ? ` of ${formatAmount(caseData, item.price)}` : ''} was completed for the missing ${caseData.claimedItemName}.`),
    }
  }

  if (redeliveryAllowed && redeliveryResult?.status === 'success') {
    return {
      type: 'FINISH',
      decision: 'AUTO_RESOLVE',
      finalAction: 'mock_redelivery',
      customerMessage: customerText(caseData, `${caseData.claimedItemName} 누락 해결 방식으로 Mock 재배달을 요청했습니다.`, `A mock redelivery was requested for the missing ${caseData.claimedItemName}.`),
    }
  }

  if ((refundAllowed || redeliveryAllowed) && !refundResult && !redeliveryResult) {
    const item = caseData.order.items.find(
      (candidate) => candidate.name === caseData.claimedItemName,
    )
    if (!item) {
      return finishForHumanReview(customerText(caseData, '주문에서 요청한 메뉴를 확인하지 못해 상담원이 이어서 확인합니다.', 'The requested item could not be found in the order, so a support agent will continue the review.'))
    }
    return {
      type: 'ASK_CUSTOMER',
      waitStatus: 'ACTION_READY',
      question: customerText(caseData, `주문 메뉴, ${formatAmount(caseData, item.price)} 가격, 주문 대비 비율, 최근 유사 신고, 중복 처리와 위험 신호를 확인했습니다. 가능한 해결 방법을 아래에서 선택해 주세요.`, `I checked the ordered item, its ${formatAmount(caseData, item.price)} price, its share of the order, recent similar claims, duplicate handling, and risk signals. Choose an available option below.`),
    }
  }

  if (refundResult?.status === 'error') {
    return finishForHumanReview(
      customerText(caseData, 'Mock 환불 처리 중 오류가 발생해 상담원이 이어서 확인합니다.', 'A mock refund error occurred, so a support agent will continue the review.'),
    )
  }

  const merchantChoice = askCustomerAfterUnapprovedMerchantResponse(caseData)
  if (merchantChoice) return merchantChoice

  if (risk.data.blockedActions.some(
    (action) => action === 'mock_refund' || action === 'mock_redelivery',
  )) {
    return finishForHumanReview(customerText(caseData, '중복 처리, 반복 신고 또는 증빙 불일치 위험 신호가 있어 자동 처리하지 않고 상담원이 검토합니다.', 'Duplicate handling, repeated claims, or conflicting evidence prevents automatic processing, so a support agent will review the case.'))
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
    customerText(caseData, '정책·위험 기준 또는 매장 확인 결과상 자동 처리가 어려워 상담원이 전체 맥락을 이어서 확인합니다.', 'Policy, risk criteria, or the restaurant response prevents automatic processing, so a support agent will review the full context.'),
  )
}

export async function decideNextAction(caseData: CsCase): Promise<AgentAction> {
  // v2 원칙: LLM은 자연어 이해에 사용하고, Action Route는 Policy와 Risk로 결정한다.
  return decideNextActionWithRules(caseData)
}
