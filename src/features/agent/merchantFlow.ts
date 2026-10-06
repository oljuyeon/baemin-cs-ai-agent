import {
  caseStore,
  type CsCase,
  type MerchantConversationMessage,
  type MerchantResponse,
} from '../cs'
import { agentController } from './controller'
import { executeTool } from './toolExecutor'

export type MerchantHandoffOutcome = 'completed' | 'follow_up'

export interface MerchantHandoffResult {
  outcome: MerchantHandoffOutcome
  caseData: CsCase
}

const CHANGE_CONFIRMATION_PREFIX = '선택 확인:'
const MORE_DETAIL_PREFIX = '추가 확인:'

const responseDescription: Record<MerchantResponse, string> = {
  ADMITTED_MISSING: '누락 또는 오배달을 인정한다는 답변',
  CLAIMS_PACKED: '고객 주문대로 포장했다는 답변',
  POSSIBLE_MISSING: '누락 또는 주문 변경 가능성이 있다는 답변',
  UNKNOWN: '현재 확인하기 어렵다는 답변',
}

const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase()

const inferMerchantResponse = (content: string): MerchantResponse | undefined => {
  const text = normalize(content)

  if (/(확인어렵|확인불가|모르겠|알수없|연락안|담당자없)/.test(text)) {
    return 'UNKNOWN'
  }
  if (/(가능성|수도있|바뀌었을|누락됐을|빠졌을)/.test(text)) {
    return 'POSSIBLE_MISSING'
  }
  if (/(정상포장|주문대로|포장했|넣었|포장기록|체크리스트)/.test(text)) {
    return 'CLAIMS_PACKED'
  }
  if (/(누락인정|오배달인정|못넣|빠뜨|빼먹|다른주문.*전달|잘못전달)/.test(text)) {
    return 'ADMITTED_MISSING'
  }

  return undefined
}

const merchantMessages = (conversation: MerchantConversationMessage[]) =>
  conversation.filter((message) => message.role === 'merchant')

const latestAgentMessageIndex = (conversation: MerchantConversationMessage[]) => {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    if (conversation[index].role === 'agent') return index
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

const ensureStructuredResponse = (caseData: CsCase): MerchantHandoffResult | CsCase => {
  const confirmation = caseData.merchantConfirmation
  if (!confirmation) return caseData
  if (confirmation.response) return caseData

  const directAnswer = merchantMessages(confirmation.conversation ?? []).at(-1)
  const inferred = directAnswer
    ? inferMerchantResponse(directAnswer.content)
    : undefined

  if (!inferred) {
    return appendAgentQuestion(
      caseData.caseId,
      `${MORE_DETAIL_PREFIX} 답변의 의미를 확정하기 어렵습니다. 빠른 답변을 선택하거나 누락·정상 포장·발생 가능성·확인 어려움 중 어디에 해당하는지 알려 주세요.`,
    )
  }

  return caseStore.recordMerchantResponse(caseData.caseId, inferred)
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
    confirmation.response !== 'CLAIMS_PACKED'
    && confirmation.response !== 'UNKNOWN'
  ) return caseData

  const conversation = confirmation.conversation ?? []
  const lastAgentIndex = latestAgentMessageIndex(conversation)
  const hasMerchantReply = merchantMessages(
    lastAgentIndex >= 0 ? conversation.slice(lastAgentIndex + 1) : conversation,
  ).length > 0

  if (hasMerchantReply) return caseData

  const question = confirmation.response === 'CLAIMS_PACKED'
    ? `${MORE_DETAIL_PREFIX} 포장 체크리스트나 당시 담당자 확인 등 정상 포장으로 판단한 근거를 알려 주세요.`
    : `${MORE_DETAIL_PREFIX} 확인 가능한 포장 기록이나 당시 담당 직원의 확인 결과가 있는지 한 번 더 알려 주세요.`

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

  const structured = ensureStructuredResponse(pendingChange)
  if (isHandoffResult(structured)) return structured

  const conflictChecked = checkResponseConflict(structured)
  if (isHandoffResult(conflictChecked)) return conflictChecked

  const detailChecked = requireSupportingDetail(conflictChecked)
  if (isHandoffResult(detailChecked)) return detailChecked

  caseStore.completeMerchantConfirmation(caseId)

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
