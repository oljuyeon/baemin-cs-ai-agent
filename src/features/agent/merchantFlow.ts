import {
  assessRisk,
  caseStore,
  inferLiability,
  requiresHumanCsBeforeMerchant,
  type CsCase,
  type MerchantConditionalAction,
  type MerchantConversationMessage,
  type MerchantResponse,
} from '../cs'
import { agentController } from './controller'
import { interpretMerchantResponseWithOpenAI } from './remoteAgent'
import { executeTool } from './toolExecutor'

export type MerchantHandoffOutcome = 'completed' | 'follow_up' | 'customer_input'

export interface MerchantHandoffResult {
  outcome: MerchantHandoffOutcome
  caseData: CsCase
}

const CHANGE_CONFIRMATION_PREFIX = '선택 확인:'
const MORE_DETAIL_PREFIX = '추가 확인:'

const responseDescription: Record<MerchantResponse, string> = {
  CONFIRMED: '누락 또는 오배달을 인정한다는 답변',
  DENIED: '고객 주문대로 포장했다는 답변',
  POSSIBLE: '누락 또는 주문 변경 가능성이 있다는 답변',
  UNKNOWN: '현재 확인하기 어렵다는 답변',
}

const customerUpdateByResponse: Record<MerchantResponse, string> = {
  CONFIRMED: '매장이 누락 또는 오배달을 확인하고 환불·재배달 해결에 동의했습니다. 원하는 해결 방법을 이어서 선택해 주세요.',
  DENIED: '매장에서는 주문대로 포장했다고 답변해 해결 조치를 승인하지 않았습니다. 이 답변을 확인하고 문의를 마치거나 고객센터에 직접 도움을 요청할 수 있어요.',
  POSSIBLE: '매장은 문제 가능성은 인정했지만 아직 환불·재배달을 승인하지 않았습니다. 추가 확인을 원하면 고객센터에 직접 도움을 요청할 수 있어요.',
  UNKNOWN: '매장에서 현재 포장 여부를 확정하기 어렵다고 답변했습니다. 이 답변을 확인하고 문의를 마치거나 고객센터에 직접 도움을 요청할 수 있어요.',
}

const merchantCompletionByResponse: Record<MerchantResponse, string> = {
  CONFIRMED: '확인해 주셔서 감사합니다. 누락 또는 오배송 확인과 해결 동의 내용을 반영해 고객 안내와 후속 처리를 이어가겠습니다. 매장 확인은 여기서 마무리됩니다.',
  DENIED: '확인해 주셔서 감사합니다. 정상 포장했다는 매장 답변을 고객 주장과 함께 검토해 후속 처리를 이어가겠습니다. 추가 확인이 필요하면 다시 요청드리겠습니다.',
  POSSIBLE: '확인해 주셔서 감사합니다. 문제 발생 가능성이 있다는 답변을 반영해 추가 검토와 고객 안내를 이어가겠습니다. 추가 확인이 필요하면 다시 요청드리겠습니다.',
  UNKNOWN: '답변해 주셔서 감사합니다. 현재 확인이 어렵다는 내용을 반영해 확보된 정보로 후속 처리를 이어가겠습니다. 추가 확인이 필요하면 다시 요청드리겠습니다.',
}

const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase()

const inferMerchantResponse = (content: string): MerchantResponse | undefined => {
  const text = normalize(content)

  if (/(확인어렵|확인불가|모르겠|알수없|연락안|담당자없)/.test(text)) {
    return 'UNKNOWN'
  }
  if (/(가능성|수도있|바뀌었을|누락됐을|빠졌을)/.test(text)) {
    return 'POSSIBLE'
  }
  if (/(정상포장|주문대로|포장했|넣었|포장기록|체크리스트)/.test(text)) {
    return 'DENIED'
  }
  if (/(누락인정|오배달인정|못넣|빠뜨|빼먹|다른주문.*전달|잘못전달)/.test(text)) {
    return 'CONFIRMED'
  }

  return undefined
}

const merchantMessages = (conversation: MerchantConversationMessage[]) =>
  conversation.filter((message) => message.role === 'merchant')

const conditionalActionLabel = (
  action?: MerchantConditionalAction,
  couponAmount = 2_000,
) => {
  if (action === 'mock_coupon') return `${couponAmount.toLocaleString('ko-KR')}원 쿠폰 지급`
  if (action === 'mock_refund') return '누락 메뉴 부분 환불'
  if (action === 'mock_redelivery') return '재배달'
  if (action === 'merchant_review') return '매장 재확인'
  return '사진 확인 후 매장 재확인'
}

const asksForCustomerMaterial = (content: string) =>
  /(사진|이미지|영수증|포장지|증빙|추가\s*(정보|설명|내용))/.test(content)
  && /(첨부|보내|전달|요청|필요|희망|확인)/.test(content)

const requestCustomerInformation = (
  caseData: CsCase,
  request: string,
): MerchantHandoffResult => {
  const confirmation = caseData.merchantConfirmation
  if (!confirmation) return { outcome: 'follow_up', caseData }

  const prompt = [
    '상황을 더 정확히 확인하려면 다음 자료가 필요합니다.',
    `“${request}”`,
    `사진이 문의 내용을 명확히 뒷받침할 경우 매장이 미리 선택한 조치: ${conditionalActionLabel(confirmation.conditionalAction, confirmation.conditionalCouponAmount)}`,
    '첨부한 사진은 AI 분석을 위해 프로젝트 서버를 통해 OpenAI API로 전송됩니다.',
    '사진이나 설명을 보내주시면 같은 문의에서 확인을 이어갈게요. 제공이 어렵다면 상담원에게 도움을 요청할 수 있어요.',
  ].join('\n')

  let next = caseStore.updateCase(caseData.caseId, {
    status: 'WAITING_EVIDENCE',
    decision: 'NEED_MORE_INFO',
    finalAction: undefined,
    escalationCode: undefined,
    escalationReason: undefined,
    agentSummary: undefined,
    merchantConfirmation: {
      ...confirmation,
      status: 'waiting',
      customerInfoRequest: request,
      customerInfoRequestedAt: new Date().toISOString(),
      pendingIntent: undefined,
    },
  })
  next = caseStore.appendConversation(caseData.caseId, 'agent', prompt)
  return { outcome: 'customer_input', caseData: next }
}

const latestAgentMessageIndex = (conversation: MerchantConversationMessage[]) => {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    if (conversation[index].role === 'agent' || conversation[index].role === 'human_cs') return index
  }
  return -1
}

const isAffirmative = (content: string) =>
  /(네|예|맞|변경|바꿔|수정)/.test(normalize(content))

const isNegative = (content: string) =>
  /(아니|기존|유지|변경아님|바꾸지)/.test(normalize(content))

const appendAgentQuestion = (caseId: string, question: string): MerchantHandoffResult => ({
  outcome: 'follow_up',
  caseData: caseStore.appendMerchantConversation(caseId, 'agent', question),
})

const resolvePendingChangeConfirmation = (
  caseData: CsCase,
): MerchantHandoffResult | CsCase => {
  const confirmation = caseData.merchantConfirmation
  if (!confirmation) return caseData

  const conversation = confirmation.conversation ?? []
  const agentIndex = latestAgentMessageIndex(conversation)
  const latestAgentMessage = agentIndex >= 0 ? conversation[agentIndex] : undefined
  if (!latestAgentMessage?.content.startsWith(CHANGE_CONFIRMATION_PREFIX)) return caseData

  const replies = merchantMessages(conversation.slice(agentIndex + 1))
  const reply = replies[replies.length - 1]
  if (!reply) return { outcome: 'follow_up', caseData }

  if (isNegative(reply.content)) return caseData

  if (isAffirmative(reply.content)) {
    const explanation = merchantMessages(conversation.slice(0, agentIndex)).at(-1)
    const changedResponse = explanation
      ? inferMerchantResponse(explanation.content)
      : undefined
    if (changedResponse && changedResponse !== confirmation.response) {
      return caseStore.recordMerchantResponse(caseData.caseId, changedResponse)
    }
    return caseData
  }

  return appendAgentQuestion(
    caseData.caseId,
    `${CHANGE_CONFIRMATION_PREFIX} 선택을 변경하는 것인지 “변경합니다” 또는 “기존 선택을 유지합니다”라고 답해 주세요.`,
  )
}

const ensureStructuredResponse = async (
  caseData: CsCase,
): Promise<MerchantHandoffResult | CsCase> => {
  const confirmation = caseData.merchantConfirmation
  if (!confirmation) return caseData
  if (confirmation.response) return caseData

  const directAnswer = merchantMessages(confirmation.conversation ?? []).at(-1)
  if (!directAnswer) return { outcome: 'follow_up', caseData }

  const interpretation = await interpretMerchantResponseWithOpenAI(
    caseData,
    caseData.customerLanguage ?? 'ko',
  )
  const fallbackCustomerRequest = !interpretation && asksForCustomerMaterial(directAnswer.content)
    ? directAnswer.content.trim()
    : null
  const customerRequest = interpretation?.requestCustomerInfo
    ? interpretation.customerInfoRequest
    : fallbackCustomerRequest
  if (customerRequest) {
    return requestCustomerInformation(caseData, customerRequest)
  }
  const inferred = interpretation?.response
    ?? inferMerchantResponse(directAnswer.content)
  const followUpCount = confirmation.followUpCount ?? 0

  if (
    followUpCount < 1
    && (interpretation?.needsFollowUp || !inferred)
  ) {
    caseStore.updateCase(caseData.caseId, {
      merchantConfirmation: {
        ...confirmation,
        followUpCount: followUpCount + 1,
      },
    })
    return appendAgentQuestion(
      caseData.caseId,
      `${MORE_DETAIL_PREFIX} ${interpretation?.followUpQuestion
        ?? '말씀하신 내용이 고객이 받은 상품과 어떤 관계인지 한 번만 더 설명해 주세요.'}`,
    )
  }

  return caseStore.recordMerchantResponse(
    caseData.caseId,
    inferred ?? 'UNKNOWN',
    interpretation?.summary ?? directAnswer.content,
  )
}

const checkResponseConflict = (caseData: CsCase): MerchantHandoffResult | CsCase => {
  const confirmation = caseData.merchantConfirmation
  if (!confirmation?.response) return caseData

  const conversation = confirmation.conversation ?? []
  const lastAgentIndex = latestAgentMessageIndex(conversation)
  const latestMerchant = merchantMessages(
    lastAgentIndex >= 0 ? conversation.slice(lastAgentIndex + 1) : conversation,
  ).at(-1)

  if (!latestMerchant) return caseData
  const inferred = inferMerchantResponse(latestMerchant.content)
  if (!inferred || inferred === confirmation.response) return caseData

  return appendAgentQuestion(
    caseData.caseId,
    `${CHANGE_CONFIRMATION_PREFIX} 추가 설명은 ${responseDescription[inferred]}으로 보입니다. 기존 선택을 변경한다는 뜻인가요? “변경합니다” 또는 “기존 선택을 유지합니다”라고 답해 주세요.`,
  )
}

const requireSupportingDetail = (caseData: CsCase): MerchantHandoffResult | CsCase => {
  const confirmation = caseData.merchantConfirmation
  if (!confirmation?.response) return caseData
  if (
    confirmation.response !== 'DENIED'
    && confirmation.response !== 'UNKNOWN'
  ) return caseData

  const conversation = confirmation.conversation ?? []
  const lastAgentIndex = latestAgentMessageIndex(conversation)
  const hasMerchantReply = merchantMessages(
    lastAgentIndex >= 0 ? conversation.slice(lastAgentIndex + 1) : conversation,
  ).length > 0

  if (hasMerchantReply) return caseData

  const followUpCount = confirmation.followUpCount ?? 0
  if (followUpCount >= 1) return caseData

  const question = confirmation.response === 'DENIED'
    ? `${MORE_DETAIL_PREFIX} 포장 체크리스트나 당시 담당자 확인 등 정상 포장으로 판단한 근거를 알려 주세요.`
    : `${MORE_DETAIL_PREFIX} 확인 가능한 포장 기록이나 당시 담당 직원의 확인 결과가 있는지 한 번 더 알려 주세요.`

  caseStore.updateCase(caseData.caseId, {
    merchantConfirmation: {
      ...confirmation,
      followUpCount: followUpCount + 1,
    },
  })
  return appendAgentQuestion(caseData.caseId, question)
}

const isHandoffResult = (
  value: MerchantHandoffResult | CsCase,
): value is MerchantHandoffResult => 'outcome' in value

/**
 * Merchant UI는 저장한 Case의 ID만 전달한다. 응답 구조화, 후속 질문,
 * 확인 완료와 본 Agent Loop 재개는 이 연결 모듈이 담당한다.
 */
export async function processMerchantResponse(
  caseId: string,
): Promise<MerchantHandoffResult> {
  const original = caseStore.getCase(caseId)
  if (!original?.merchantConfirmation) {
    throw new Error(`Case ${caseId} has no Merchant confirmation request.`)
  }
  if (original.status !== 'WAITING_MERCHANT') {
    throw new Error(`Case ${caseId} is not waiting for a Merchant response.`)
  }
  if (original.merchantConfirmation.status === 'completed') {
    return { outcome: 'completed', caseData: original }
  }

  const pendingChange = resolvePendingChangeConfirmation(original)
  if (isHandoffResult(pendingChange)) return pendingChange

  const structured = await ensureStructuredResponse(pendingChange)
  if (isHandoffResult(structured)) return structured

  const conflictChecked = checkResponseConflict(structured)
  if (isHandoffResult(conflictChecked)) return conflictChecked

  const detailChecked = requireSupportingDetail(conflictChecked)
  if (isHandoffResult(detailChecked)) return detailChecked

  const responseForCompletion = detailChecked.merchantConfirmation?.response
  if (responseForCompletion) {
    caseStore.appendMerchantConversation(
      caseId,
      'agent',
      merchantCompletionByResponse[responseForCompletion],
    )
  }

  const completedConfirmation = caseStore.completeMerchantConfirmation(caseId)
  const confirmed = caseStore.updateCase(caseId, {
    liability: inferLiability(completedConfirmation),
  })

  if ((confirmed.merchantConfirmation?.requestedBy ?? 'agent') === 'human_cs') {
    const returned = caseStore.commitCase(caseId, {
      changes: {
        status: 'ESCALATED',
        decision: 'ESCALATE',
        finalAction: 'human_review',
        escalationReason: '상담원이 요청한 매장 추가 확인 답변이 도착함',
      },
      history: [{
        actor: 'merchant',
        event: 'ESCALATED',
        fromStatus: 'WAITING_MERCHANT',
        toStatus: 'ESCALATED',
        detail: '매장 추가 확인 답변을 상담원 검토 대기열로 복귀',
      }],
    })
    return { outcome: 'completed', caseData: returned }
  }
  const confirmedResponse = confirmed.merchantConfirmation?.response
  if (confirmedResponse === 'CONFIRMED') {
    const customerUpdate = requiresHumanCsBeforeMerchant(assessRisk(confirmed))
      ? '매장 답변이 접수되었습니다. 위험 신호가 있는 문의이므로 환불이나 재배달을 바로 확정하지 않고 상담원이 매장 답변과 전체 맥락을 다시 검토합니다.'
      : customerUpdateByResponse[confirmedResponse]
    caseStore.appendConversation(
      caseId,
      'agent',
      customerUpdate,
    )
  }

  const current = caseStore.getCase(caseId)
  if (!current) throw new Error(`Case ${caseId} was not found.`)
  if (!current.toolHistory.some((entry) => entry.toolName === 'get_cs_history')) {
    await executeTool(caseId, {
      type: 'CALL_TOOL',
      toolName: 'get_cs_history',
      input: { customerId: current.customerId, orderId: current.orderId },
    })
  }

  await executeTool(caseId, {
    type: 'CALL_TOOL',
    toolName: 'get_policy',
    input: { caseData: caseStore.getCase(caseId) },
  })
  await executeTool(caseId, {
    type: 'CALL_TOOL',
    toolName: 'check_risk',
    input: { caseData: caseStore.getCase(caseId) },
  })

  const completed = await agentController.runNextStep(caseId)
  return { outcome: 'completed', caseData: completed }
}
