import type {
  AgentAction,
  CsCase,
  PolicyResult,
  RiskResult,
} from '../cs'
import { requiresHumanCsBeforeMerchant } from '../cs'
import { latestOrderItemStatement } from './nlu'
import { decidePreMerchantInformationWithOpenAI } from './remoteAgent'
import { latestToolResult, wasToolCalled } from './toolHistory'

const wasCalled = wasToolCalled
const latestResult = latestToolResult

const customerText = (caseData: CsCase, ko: string, en: string) =>
  caseData.customerLanguage === 'en' ? en : ko

const formatAmount = (caseData: CsCase, amount: number) =>
  caseData.customerLanguage === 'en'
    ? `KRW ${amount.toLocaleString('en-US')}`
    : `${amount.toLocaleString('ko-KR')}원`

const finishForHumanReview = (
  customerMessage: string,
  escalationReason?: string,
): AgentAction => ({
  type: 'FINISH',
  decision: 'ESCALATE',
  finalAction: 'human_review',
  customerMessage,
  escalationReason,
})

const waitForCustomerAfterUnapprovedMerchantResponse = (caseData: CsCase): AgentAction | null => {
  const confirmation = caseData.merchantConfirmation
  if (
    confirmation?.status !== 'completed'
    || !confirmation.response
    || confirmation.response === 'CONFIRMED'
  ) return null

  const responseMessage: Record<Exclude<typeof confirmation.response, undefined | 'CONFIRMED'>, {
    ko: string
    en: string
  }> = {
    DENIED: {
      ko: '매장은 주문대로 포장했다고 답변했습니다.',
      en: 'The restaurant states that it packed the order as requested.',
    },
    POSSIBLE: {
      ko: '매장은 문제가 발생했을 가능성은 있지만 현재 확정하기 어렵다고 답변했습니다.',
      en: 'The restaurant says the problem may have occurred but cannot confirm it yet.',
    },
    UNKNOWN: {
      ko: '매장은 현재 포장·전달 여부를 확인하기 어렵다고 답변했습니다.',
      en: 'The restaurant says it cannot currently confirm the packing or handoff.',
    },
  }
  const message = responseMessage[confirmation.response]
  return {
    type: 'ASK_CUSTOMER',
    waitStatus: 'COLLECTING_INFO',
    question: customerText(
      caseData,
      `${message.ko} 이 답변을 확인하고 문의를 마치거나, 상담원에게 추가 확인을 요청할 수 있어요.`,
      `${message.en} You can close the request after reviewing this response or ask a support agent for further review.`,
    ),
  }
}

const hasEnoughDetailForFallback = (caseData: CsCase) => {
  if (caseData.evidenceUrls.length > 0) return true
  const distinctCustomerMessages = [...new Set(
    caseData.conversation
      .filter((message) => message.role === 'customer')
      .map((message) => message.content.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  )]
  const combined = distinctCustomerMessages.join(' ')
  return distinctCustomerMessages.length >= 2
    && (
      combined.length >= 45
      || /(나머지|포장|봉투|용기|영수증|사진|배달은|주문은|받았|도착)/.test(combined)
    )
}

const decidePreMerchantInformation = async (caseData: CsCase): Promise<AgentAction | null> => {
  if (caseData.customerDetailRequestedAt || caseData.customerDetailProvidedAt) return null

  const remoteDecision = await decidePreMerchantInformationWithOpenAI(caseData)
  if (remoteDecision?.nextAction === 'ASK_MERCHANT') return null

  if (!remoteDecision && hasEnoughDetailForFallback(caseData)) return null

  const question = remoteDecision?.question?.trim() || customerText(
    caseData,
    '매장에 확인하기 전에 상황을 조금 더 자세히 알려주세요. 나머지 메뉴는 받으셨는지, 포장 상태와 당시 상황은 어땠는지 설명해 주세요. 사진이 있다면 함께 첨부해 주셔도 됩니다.',
    'Before I contact the restaurant, please share a little more detail. Let me know whether the other items arrived and what the packaging and situation were like. You may also attach a photo if you have one.',
  )

  return {
    type: 'ASK_CUSTOMER',
    waitStatus: 'COLLECTING_INFO',
    purpose: 'ISSUE_DETAIL',
    question,
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
  if (caseData.issueClassificationStatus === 'PROVISIONAL') {
    return {
      type: 'ASK_CUSTOMER',
      waitStatus: 'COLLECTING_INFO',
      question: caseData.issueClarificationQuestion ?? customerText(
        caseData,
        '배달이 아직 도착하지 않은 건지, 일부 메뉴가 빠진 건지, 다른 음식이 도착한 건지 조금 더 알려주세요.',
        'Please clarify whether the delivery has not arrived, an item is missing, or you received a different order.',
      ),
    }
  }

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

    if (risk?.status === 'success' && requiresHumanCsBeforeMerchant(risk.data)) {
      return finishForHumanReview(
        customerText(caseData, '자동 처리를 진행하기 전에 추가 검토가 필요해 상담원에게 전달했습니다. 상담원이 내용을 이어서 확인해 안내할게요.', 'Additional review is needed before automatic handling, so I sent the case to a support agent.'),
        '반복 보상 이력, 중복 처리 또는 증빙 불일치 등 주의할 이력이 확인되어 상담원이 매장 확인 전 전체 맥락을 먼저 검토해야 합니다.',
      )
    }

    if (!caseData.merchantConfirmation) {
      const informationAction = await decidePreMerchantInformation(caseData)
      if (informationAction) return informationAction

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

    const merchantChoice = waitForCustomerAfterUnapprovedMerchantResponse(caseData)
    if (merchantChoice) return merchantChoice

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
        customerMessage: customerText(caseData, `오배달 해결 방식으로 주문 금액 ${formatAmount(caseData, caseData.order.totalAmount)}을 환불 처리했습니다.`, `A refund of ${formatAmount(caseData, caseData.order.totalAmount)} was completed for the wrong delivery.`),
      }
    }
    if (redeliveryResult?.status === 'success') {
      return {
        type: 'FINISH',
        decision: 'AUTO_RESOLVE',
        finalAction: 'mock_redelivery',
        customerMessage: customerText(caseData, '네, 주문하신 올바른 메뉴를 다시 보내드릴게요. 매장에서 준비가 시작되면 예상 도착 시간도 알려드릴게요.', 'Sure, I’ll have the correct items delivered again. I’ll let you know the estimated arrival time once the restaurant starts preparing them.'),
      }
    }

    if (refundAllowed || redeliveryAllowed) {
      return {
        type: 'ASK_CUSTOMER',
        waitStatus: 'ACTION_READY',
        question: customerText(caseData, '오배달 건은 환불 또는 재배달로 도와드릴 수 있어요. 아래에서 원하시는 방법을 선택해 주세요.', 'I can help resolve the wrong delivery with a refund or redelivery. Please choose what you prefer below.'),
      }
    }

    if (risk?.status === 'success' && risk.data.blockedActions.some(
      (action) => action === 'mock_refund' || action === 'mock_redelivery',
    )) {
      return finishForHumanReview(
        customerText(caseData, '자동 처리를 진행하기 전에 추가 검토가 필요해 상담원에게 전달했습니다. 상담원이 내용을 이어서 확인해 안내할게요.', 'Additional review is needed before automatic handling, so I sent the case to a support agent.'),
        '증빙 불일치 또는 반복 신고 등 주의할 이력으로 자동 처리가 제한되어 상담원 검토가 필요합니다.',
      )
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

  const claimedItemStatement = latestOrderItemStatement(
    caseData.conversation
      .filter((message) => message.role === 'customer')
      .map((message) => message.content),
    caseData.claimedItemName,
  )
  if (claimedItemStatement === 'received' || claimedItemStatement === 'conflict') {
    const candidates = caseData.order.items.map((item) => item.name).join(', ')
    return {
      type: 'ASK_CUSTOMER',
      waitStatus: 'COLLECTING_INFO',
      question: customerText(
        caseData,
        `받으셨다고 설명한 상품과 누락 상품 판정이 일치하지 않아요. 주문 메뉴는 ${candidates}입니다. 이 중 받지 못한 메뉴를 다시 알려주세요.`,
        `The item marked as missing conflicts with what you said you received. Your order includes ${candidates}. Please tell me which item you did not receive.`,
      ),
    }
  }

  const commonAction = nextCommonObservation(caseData)
  if (commonAction) return commonAction

  const policy = latestResult<PolicyResult>(caseData, 'get_policy')
  const risk = latestResult<RiskResult>(caseData, 'check_risk')

  if (policy?.status !== 'success' || risk?.status !== 'success') {
    return finishForHumanReview(
      customerText(caseData, '자동 확인을 완료하지 못해 상담원에게 전달했습니다. 상담원이 내용을 이어서 확인해 안내할게요.', 'The automatic review could not be completed, so I sent the case to a support agent.'),
      '정책 또는 위험 정보를 정상적으로 확인하지 못해 자동 처리를 종료하고 상담원 검토가 필요합니다.',
    )
  }

  if (requiresHumanCsBeforeMerchant(risk.data)) {
    return finishForHumanReview(
      customerText(caseData, '자동 처리를 진행하기 전에 추가 검토가 필요해 상담원에게 전달했습니다. 상담원이 내용을 이어서 확인해 안내할게요.', 'Additional review is needed before automatic handling, so I sent the case to a support agent.'),
      '반복 보상 이력, 중복 처리 또는 주문·주장 불일치 등 주의할 이력이 확인되어 상담원이 매장 확인 전 전체 맥락을 먼저 검토해야 합니다.',
    )
  }

  if (!caseData.merchantConfirmation) {
    const informationAction = await decidePreMerchantInformation(caseData)
    if (informationAction) return informationAction

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

  const merchantChoice = waitForCustomerAfterUnapprovedMerchantResponse(caseData)
  if (merchantChoice) return merchantChoice

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
      customerMessage: customerText(caseData, `${caseData.claimedItemName} 누락에 대해 ${item ? formatAmount(caseData, item.price) : '해당 금액'}을 부분 환불로 처리했습니다.`, `A partial refund${item ? ` of ${formatAmount(caseData, item.price)}` : ''} was completed for the missing ${caseData.claimedItemName}.`),
    }
  }

  if (redeliveryAllowed && redeliveryResult?.status === 'success') {
    return {
      type: 'FINISH',
      decision: 'AUTO_RESOLVE',
      finalAction: 'mock_redelivery',
      customerMessage: customerText(caseData, `네, ${caseData.claimedItemName}은 다시 보내드릴게요. 매장에서 준비가 시작되면 예상 도착 시간도 알려드릴게요.`, `Sure, I’ll have the missing ${caseData.claimedItemName} delivered again. I’ll let you know the estimated arrival time once the restaurant starts preparing it.`),
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
      question: customerText(caseData, `${caseData.claimedItemName} 누락 건은 환불 또는 재배달로 도와드릴 수 있어요. 원하시는 방법을 선택해 주세요.`, `I can help resolve the missing ${caseData.claimedItemName} with a refund or redelivery. Please choose what you prefer.`),
    }
  }

  if (refundResult?.status === 'error') {
    return finishForHumanReview(
      customerText(caseData, '환불 처리 중 오류가 발생해 상담원이 이어서 확인합니다.', 'A refund processing error occurred, so a support agent will continue the review.'),
    )
  }

  return finishForHumanReview(
    customerText(caseData, '현재 정보만으로 바로 처리하기 어려워 상담원이 이어서 확인할 수 있도록 전달할게요.', 'I can’t resolve this immediately with the available information, so I’ll send it to a support agent for further review.'),
  )
}

export async function decideNextAction(caseData: CsCase): Promise<AgentAction> {
  // v2 원칙: LLM은 자연어 이해에 사용하고, Action Route는 Policy와 Risk로 결정한다.
  return decideNextActionWithRules(caseData)
}
