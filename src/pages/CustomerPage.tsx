import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentWorkspace } from '../components/customer/AgentWorkspace'
import { CustomerBottomNav } from '../components/customer/CustomerBottomNav'
import { CustomerHeader } from '../components/customer/CustomerHeader'
import { IssueSelector } from '../components/customer/IssueSelector'
import {
  firstSelectableOrderId,
  OrderSummaryCard,
} from '../components/customer/OrderSummaryCard'
import { TrustPanel } from '../components/customer/TrustPanel'
import {
  assessRisk,
  caseStore,
  evaluateDelayCompensation,
  evaluatePolicy,
  findCustomer,
  findOrder,
  requiresHumanCsBeforeMerchant,
  type CsCase,
  type CreateCaseInput,
  type CustomerLanguage,
  type ToolName,
} from '../features/cs'
import {
  agentController,
  correctCaseIssue,
  executeTool,
  processCustomerEvidence,
  hasPotentialIssueUpdate,
  issueChangeLocked,
  issueClassificationStatus,
  latestOrderItemStatement,
  reassessCustomerIssueWithRules,
  reassessIssueWithOpenAI,
  replyWithOpenAI,
  resolveOrderItem,
  understandCustomerMessage,
  understandWithOpenAI,
  type MessageUnderstanding,
} from '../features/agent'
import type {
  AgentAction as CustomerAgentAction,
  ChatMessage,
  CustomerIssue,
} from '../types/customer'
import '../styles/customer.css'

const initialMessages: ChatMessage[] = [
  { id: 'intro', role: 'agent', content: 'chat.intro', translate: true },
]

const NEW_CONVERSATION_VALUE = 'new'
const ACTIVE_CUSTOMER_CASE_KEY = 'delivery-cs-agent:active-customer-case'
const readActiveCustomerCaseId = () => window.localStorage.getItem(ACTIVE_CUSTOMER_CASE_KEY)
const writeActiveCustomerCaseId = (caseId: string) => {
  window.localStorage.setItem(ACTIVE_CUSTOMER_CASE_KEY, caseId)
}
let activeCustomerCaseId: string | null = typeof window === 'undefined'
  ? null
  : readActiveCustomerCaseId()

interface PendingIssueConflict {
  message: string
  attachment: string | null
  selectedIssue: CustomerIssue
  detectedIssue: CustomerIssue
  claimedItemName?: string
  customerLanguage: CustomerLanguage
  confidence: number
  clarificationQuestion?: string
}

interface PendingIssueReclassification {
  caseId: string
  currentIssue: CustomerIssue
  proposedIssue: CustomerIssue
  claimedItemName?: string
  confidence: number
  customerClaim: string
}

const mockCaseInput = (
  issue: CustomerIssue,
  orderId: string,
  customerClaim: string,
  evidenceUrls: string[],
  customerLanguage: CustomerLanguage,
): CreateCaseInput => {
  const order = findOrder(orderId)
  if (!order) throw new Error(`Order ${orderId} was not found.`)
  const shared = { customerClaim, evidenceUrls }
  return {
    customerId: order.customerId,
    orderId: order.orderId,
    storeId: order.storeId,
    issueType: issue === 'delay'
      ? 'delivery_delay'
      : issue === 'missing'
        ? 'missing_item'
        : 'wrong_delivery',
    ...shared,
    customerLanguage,
  }
}

const customerIssueForType = (issueType: CsCase['issueType']): CustomerIssue | null => {
  if (issueType === 'delivery_delay') return 'delay'
  if (issueType === 'missing_item') return 'missing'
  if (issueType === 'wrong_delivery') return 'wrong'
  return null
}

const issueTypeForCustomerIssue = (issue: CustomerIssue): CsCase['issueType'] => {
  if (issue === 'delay') return 'delivery_delay'
  if (issue === 'missing') return 'missing_item'
  return 'wrong_delivery'
}

const fallbackClarification = (language: CustomerLanguage) => language === 'en'
  ? 'Please clarify whether the delivery has not arrived, an item is missing, or you received a different order.'
  : '배달이 아직 도착하지 않은 건지, 일부 메뉴가 빠진 건지, 다른 음식이 도착한 건지 조금 더 알려주세요.'

const askedArrivalOrMissingClarification = (caseData: CsCase) => {
  if (caseData.issueClassificationStatus !== 'PROVISIONAL') return false
  const latestAgentMessage = [...caseData.conversation]
    .reverse()
    .find((message) => message.role === 'agent')?.content ?? ''
  return (
    /(배달|주문)/.test(latestAgentMessage)
    && /(일부|메뉴)/.test(latestAgentMessage)
    && /(도착|누락|빠지|빠졌|안\s*왔)/.test(latestAgentMessage)
  ) || (
    /(delivery|order)/i.test(latestAgentMessage)
    && /(items?|menu).{0,16}missing/i.test(latestAgentMessage)
  )
}

const toCustomerUiState = (caseData: CsCase) => {
  if (caseData.status === 'AUTO_RESOLVED' || caseData.status === 'CLOSED') return 'resolved' as const
  if (
    caseData.status === 'COLLECTING_INFO'
    || caseData.status === 'WAITING_EVIDENCE'
    || caseData.status === 'WAITING_MERCHANT'
    || caseData.status === 'ACTION_READY'
    || caseData.status === 'ESCALATED'
  ) return 'waiting' as const
  if (caseData.status === 'ACTION_EXECUTING') return 'working' as const
  return 'working' as const
}

const toolMessageKeys: Partial<Record<ToolName, string>> = {
  request_merchant_confirmation: 'agent.toolEvents.requestMerchant',
  refund: 'agent.toolEvents.refund',
  redelivery: 'agent.toolEvents.redelivery',
  issue_coupon: 'agent.toolEvents.issueCoupon',
  escalate_to_human: 'agent.toolEvents.escalateHuman',
}

const conversationToMessages = (caseData: CsCase): ChatMessage[] => {
  const timeline = [
    ...caseData.conversation.map((message, index) => ({
      at: message.createdAt,
      message: {
        id: `${message.role}-${message.createdAt}-${index}`,
        role: message.role === 'customer' ? 'user' as const : 'agent' as const,
        content: message.content,
      },
    })),
    ...caseData.toolHistory.flatMap((tool) => {
      const content = toolMessageKeys[tool.toolName]
      return content ? [{
        at: tool.completedAt,
        message: {
          id: `tool-${tool.id}`,
          role: 'tool' as const,
          content,
          translate: true,
        },
      }] : []
    }),
  ].sort((left, right) => left.at.localeCompare(right.at))

  const messages = [...initialMessages, ...timeline.map((entry) => entry.message)]
  if (caseData.status !== 'ESCALATED') return messages

  return [
    ...messages,
    {
      id: `escalated-${caseData.caseId}`,
      role: 'agent',
      content: caseData.customerLanguage === 'en'
        ? 'Your case has been transferred to a support agent. They will take it from here and help you further.'
        : '상담원에게 이관되었습니다. 이제 상담원이 이어서 도와드릴게요.',
    },
  ]
}

const delayActions: CustomerAgentAction[] = [
  { id: 'trackDelivery', labelKey: 'agent.actions.trackDelivery', primary: true },
  { id: 'checkCompensation', labelKey: 'agent.actions.checkCompensation' },
]

const claimedItemConflictsWithCustomerStatement = (caseData: CsCase) => Boolean(
  caseData.claimedItemName
  && ['received', 'conflict'].includes(latestOrderItemStatement(
    caseData.conversation
      .filter((message) => message.role === 'customer')
      .map((message) => message.content),
    caseData.claimedItemName,
  )),
)

const actionsForCase = (caseData: CsCase): CustomerAgentAction[] => {
  if (
    caseData.status === 'AUTO_RESOLVED'
    && caseData.issueType === 'delivery_delay'
    && caseData.finalAction === 'guide_customer'
  ) return delayActions

  if (
    caseData.status === 'WAITING_EVIDENCE'
    && caseData.merchantConfirmation?.customerInfoRequest
    && !caseData.merchantConfirmation.customerInfoProvidedAt
  ) {
    return [{
      id: 'escalateHuman',
      labelKey: 'agent.actions.escalateHuman',
      label: '고객센터에 직접 도움 요청',
    }]
  }

  if (
    caseData.status === 'COLLECTING_INFO'
    && caseData.merchantConfirmation?.status === 'completed'
    && caseData.merchantConfirmation.response
    && caseData.merchantConfirmation.response !== 'CONFIRMED'
  ) {
    return [
      {
        id: 'escalateHuman',
        labelKey: 'agent.actions.escalateHuman',
        label: '고객센터에 직접 도움 요청',
        primary: true,
      },
      {
        id: 'cancelAction',
        labelKey: 'agent.actions.cancelAction',
        label: '매장 답변 확인 후 문의 종료',
      },
    ]
  }

  if (caseData.status === 'ACTION_READY' && caseData.order) {
    if (
      caseData.issueType === 'missing_item'
      && claimedItemConflictsWithCustomerStatement(caseData)
    ) return []

    const policy = evaluatePolicy(caseData)
    const risk = assessRisk(caseData)
    const item = caseData.order.items.find((candidate) =>
      candidate.name === caseData.claimedItemName,
    )
    const refundAllowed = policy.allowedActions.includes('mock_refund')
      && !risk.blockedActions.includes('mock_refund')
    const redeliveryAllowed = policy.allowedActions.includes('mock_redelivery')
      && !risk.blockedActions.includes('mock_redelivery')
    const refundAmount = caseData.issueType === 'missing_item'
      ? item?.price
      : caseData.order.totalAmount
    const next: CustomerAgentAction[] = []
    if (refundAllowed && refundAmount) {
      next.push(
        {
          id: 'confirmRefund',
          labelKey: 'agent.actions.confirmRefund',
          label: `${caseData.issueType === 'missing_item' ? item?.name : '주문'} ${refundAmount.toLocaleString('ko-KR')}원 환불하기`,
          primary: true,
        },
      )
    }
    if (redeliveryAllowed) {
      next.push({
        id: 'requestRedelivery',
        labelKey: 'agent.actions.requestRedelivery',
        label: caseData.issueType === 'missing_item'
          ? `${item?.name ?? '누락 메뉴'} 재배달 요청`
          : '올바른 메뉴 재배달 요청',
      })
    }
    if (next.length > 0) next.push({ id: 'cancelAction', labelKey: 'agent.actions.cancelAction' })
    return next
  }

  return []
}

const followUpWithRules = (caseData: CsCase, customerMessage: string) => {
  const text = (ko: string, en: string) => caseData.customerLanguage === 'en' ? en : ko
  if (caseData.issueType === 'delivery_delay') {
    const compensation = evaluateDelayCompensation(caseData)
    const claimedMinutes = customerMessage.match(/(\d+)\s*분/)?.[1]
    const measuredMinutes = compensation.delayMinutes
    const difference = claimedMinutes && measuredMinutes !== null
      ? `말씀하신 ${claimedMinutes}분과 차이가 있네요. `
      : ''

    if (measuredMinutes === null) {
      return text(`${difference}현재는 배송 시간 데이터가 없어 지연 시간을 다시 확인하기 어렵습니다.`, 'Delivery timing data is not available, so I cannot recheck the delay right now.')
    }
    if (compensation.reason === 'already_issued') {
      return text(`${difference}시스템 배송 데이터 기준 실제 지연은 ${measuredMinutes}분이며, 이 주문에는 이미 보상 쿠폰이 발급됐습니다.`, `The system delivery data shows a ${measuredMinutes}-minute delay, and a compensation coupon has already been issued for this order.`)
    }
    if (compensation.eligible) {
      return text(`${difference}시스템 배송 데이터 기준 실제 지연은 ${measuredMinutes}분으로 확인돼 ${compensation.amount.toLocaleString('ko-KR')}원 쿠폰 대상입니다.`, `The system delivery data shows a ${measuredMinutes}-minute delay, so this order is eligible for a KRW ${compensation.amount.toLocaleString('en-US')} coupon.`)
    }
    return text(`${difference}시스템 배송 데이터 기준 실제 지연은 ${measuredMinutes}분입니다. 현재 보상 기준은 ${compensation.minimumMinutes}분 이상입니다.`, `The system delivery data shows a ${measuredMinutes}-minute delay. Compensation is available from ${compensation.minimumMinutes} minutes.`)
  }

  if (caseData.status === 'ESCALATED') {
    return text('상담원에게 이관되었습니다. 이제 상담원이 이어서 도와드릴게요.', 'Your case has been transferred to a support agent. They will take it from here and help you further.')
  }

  return text('앞서 확인한 주문 정보와 처리 결과를 유지하고 있어요. 궁금한 내용을 조금 더 구체적으로 말씀해 주세요.', 'I still have the order details and previous result. Please describe what you would like to know in a little more detail.')
}

const canRecoverMissingItem = (caseData: CsCase) => {
  if (
    caseData.status !== 'ESCALATED'
    || caseData.issueType !== 'missing_item'
    || !caseData.claimedItemName
    || !caseData.order
  ) return false

  const customerRequestedHumanCs = caseData.history.some((entry) =>
    entry.actor === 'customer' && entry.event === 'ESCALATED',
  ) || /(고객이|고객센터|상담원.*요청|support agent.*requested)/i.test(
    caseData.escalationReason ?? '',
  )
  if (customerRequestedHumanCs || caseData.merchantConfirmation) return false

  const risk = assessRisk(caseData)
  return !requiresHumanCsBeforeMerchant(risk)
}

const wantsHumanCs = (message: string) =>
  /(고객센터|상담원|사람.*연결|직원.*연결|상담.*연결)/.test(message.replace(/\s+/g, ''))

const customerTextForCase = (caseData: CsCase, ko: string, en: string) =>
  caseData.customerLanguage === 'en' ? en : ko

const issueLabelForLanguage = (issue: CustomerIssue, language: CustomerLanguage) => {
  const labels: Record<CustomerIssue, Record<CustomerLanguage, string>> = {
    delay: { ko: '배달 지연', en: 'delivery delay' },
    missing: { ko: '메뉴 누락', en: 'missing item' },
    wrong: { ko: '오배달', en: 'wrong delivery' },
  }
  return labels[issue][language]
}

const issueConfirmationQuestion = (
  issue: CustomerIssue,
  language: CustomerLanguage,
) => {
  const questions: Record<CustomerIssue, Record<CustomerLanguage, string>> = {
    delay: {
      ko: '주문 전체가 아직 도착하지 않은 상황인가요?',
      en: 'Has the order itself still not arrived?',
    },
    missing: {
      ko: '주문은 도착했지만 일부 메뉴만 빠진 상황인가요?',
      en: 'Did the order arrive with only some of the items missing?',
    },
    wrong: {
      ko: '주문은 도착했지만 주문하신 것과 다른 음식이 온 상황인가요?',
      en: 'Did your order arrive, but with food different from what you ordered?',
    },
  }
  return questions[issue][language]
}

const issueCorrectionAcknowledgement = (
  issue: CustomerIssue,
  language: CustomerLanguage,
  claimedItemName?: string,
) => {
  const messages: Record<CustomerIssue, Record<CustomerLanguage, string>> = {
    delay: {
      ko: '주문 전체가 아직 도착하지 않았다는 말씀이시군요. 현재 배달 상태를 이어서 확인할게요.',
      en: 'I understand that the order itself has not arrived yet. I will continue by checking its delivery status.',
    },
    missing: {
      ko: '주문은 도착했지만 일부 메뉴가 빠졌다는 말씀이시군요. 누락된 내용을 이어서 확인할게요.',
      en: 'I understand that the order arrived with an item missing. I will continue by checking the missing item.',
    },
    wrong: {
      ko: '주문한 것과 다른 음식이 도착했다는 말씀이시군요. 받은 음식을 이어서 확인할게요.',
      en: 'I understand that food different from your order arrived. I will continue by checking what you received.',
    },
  }
  if (issue === 'missing' && claimedItemName) {
    return language === 'en'
      ? `I understand that the missing item is ${claimedItemName}. I will check the order details now.`
      : `누락된 메뉴는 ${claimedItemName}이라는 말씀이시군요. 주문 내역을 확인해볼게요.`
  }
  return messages[issue][language]
}

const detectSupportedCustomerLanguage = (message: string): CustomerLanguage | null => {
  const hasKorean = /[가-힣]/.test(message)
  const hasEnglish = /[a-z]/i.test(message)
  if (hasEnglish && !hasKorean) return 'en'
  if (hasKorean) return 'ko'
  return null
}

const escalateFromCustomerChoice = async (caseData: CsCase, reason: string) => {
  await executeTool(caseData.caseId, {
    type: 'CALL_TOOL',
    toolName: 'escalate_to_human',
    input: {
      caseId: caseData.caseId,
      reason,
      summary: [
        `고객 주장: ${caseData.customerClaim}`,
        `매장 응답: ${caseData.merchantConfirmation?.response ?? '없음'}`,
        `매장 추가 요청: ${caseData.merchantConfirmation?.customerInfoRequest ?? '없음'}`,
        `고객 선택: 상담원 연결`,
      ].join(' / '),
    },
  })
  const escalated = caseStore.commitCase(caseData.caseId, {
    changes: {
      status: 'ESCALATED',
      decision: 'ESCALATE',
      finalAction: 'human_review',
      escalationReason: reason,
      agentSummary: `고객이 매장과의 추가 확인 대신 고객센터 연결을 요청했습니다. ${reason}`,
    },
    history: [{
      actor: 'customer',
      event: 'ESCALATED',
      fromStatus: caseData.status,
      toStatus: 'ESCALATED',
      detail: reason,
    }],
  })
  return caseStore.appendConversation(
    escalated.caseId,
    'agent',
    customerTextForCase(caseData, '요청하신 대로 고객센터에 문의 맥락과 매장 답변을 함께 전달했습니다. 같은 내용을 다시 설명하지 않아도 됩니다.', 'I sent the case context and restaurant response to a support agent as requested. You will not need to explain everything again.'),
  )
}

export function CustomerPage() {
  const { t } = useTranslation('customer')
  const [selectedOrderId, setSelectedOrderId] = useState(firstSelectableOrderId)
  const [issue, setIssue] = useState<CustomerIssue | null>(null)
  const [draft, setDraft] = useState('')
  const [attachedFile, setAttachedFile] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [actions, setActions] = useState<CustomerAgentAction[]>([])
  const [caseState, setCaseState] = useState<'ready' | 'working' | 'waiting' | 'resolved'>('ready')
  const [isThinking, setIsThinking] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const [pendingIssueConflict, setPendingIssueConflict] = useState<PendingIssueConflict | null>(null)
  const [pendingIssueReclassification, setPendingIssueReclassification] = useState<PendingIssueReclassification | null>(null)
  const activeCaseId = useRef<string | null>(null)
  const [activeCaseKey, setActiveCaseKey] = useState<string | null>(null)
  const sendingRef = useRef(false)
  const mounted = useRef(true)

  const showCase = (caseData: CsCase) => {
    const visibleCase = caseData
    activeCaseId.current = visibleCase.caseId
    setActiveCaseKey(visibleCase.caseId)
    activeCustomerCaseId = visibleCase.caseId
    writeActiveCustomerCaseId(visibleCase.caseId)
    setSelectedOrderId(visibleCase.orderId)
    setIssue(customerIssueForType(visibleCase.issueType))
    setDraft('')
    setAttachedFile(null)
    setMessages(conversationToMessages(visibleCase))
    setActions(actionsForCase(visibleCase))
    setCaseState(toCustomerUiState(visibleCase))
    setIsThinking(false)
    setHasStarted(true)
  }

  const startNewConversation = () => {
    activeCaseId.current = null
    setActiveCaseKey(null)
    activeCustomerCaseId = NEW_CONVERSATION_VALUE
    writeActiveCustomerCaseId(NEW_CONVERSATION_VALUE)
  }

  useEffect(() => {
    mounted.current = true
    const merchantTimeoutClock = window.setInterval(() => {
      caseStore.expireMerchantConfirmations()
    }, 5_000)
    return () => {
      mounted.current = false
      window.clearInterval(merchantTimeoutClock)
    }
  }, [])

  useEffect(() => {
    const storedCaseId = activeCustomerCaseId
    if (storedCaseId === NEW_CONVERSATION_VALUE) return

    const storedCase = storedCaseId
      ? caseStore.getCase(storedCaseId)
      : undefined
    const latestCustomerCase = storedCase ?? caseStore.getAllCases()
      .filter((caseData) => !caseData.demoCaseId && customerIssueForType(caseData.issueType))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]

    if (latestCustomerCase) showCase(latestCustomerCase)
  }, [])

  useEffect(() => {
    if (!activeCaseKey) return undefined
    return caseStore.subscribe(activeCaseKey, (caseData) => {
      if (!mounted.current) return
      setSelectedOrderId(caseData.orderId)
      setIssue(customerIssueForType(caseData.issueType))
      setMessages(conversationToMessages(caseData))
      setActions(actionsForCase(caseData))
      setCaseState(toCustomerUiState(caseData))
      setHasStarted(true)
    })
  }, [activeCaseKey])

  useEffect(() => {
    if (!activeCaseKey) return undefined
    const staleEscalation = caseStore.getCase(activeCaseKey)
    if (!staleEscalation || !canRecoverMissingItem(staleEscalation)) return undefined

    let cancelled = false
    setIsThinking(true)
    setCaseState('working')
    const reopened = caseStore.updateCase(staleEscalation.caseId, {
      status: 'CHECKING_DATA',
      decision: undefined,
      finalAction: undefined,
      escalationCode: undefined,
      escalationReason: undefined,
      agentSummary: undefined,
    })

    void (async () => {
      await executeTool(reopened.caseId, {
        type: 'CALL_TOOL',
        toolName: 'get_policy',
        input: { caseData: reopened },
      })
      await executeTool(reopened.caseId, {
        type: 'CALL_TOOL',
        toolName: 'check_risk',
        input: { caseData: caseStore.getCase(reopened.caseId) ?? reopened },
      })
      return agentController.runNextStep(reopened.caseId)
    })()
      .then((continued) => {
        if (cancelled || !mounted.current) return
        setMessages(conversationToMessages(continued))
        setActions(actionsForCase(continued))
        setCaseState(toCustomerUiState(continued))
      })
      .catch((error) => {
        console.error('이전 누락 문의를 매장 확인 단계로 복구하지 못했습니다.', error)
        if (!cancelled && mounted.current) setCaseState('waiting')
      })
      .finally(() => {
        if (!cancelled && mounted.current) setIsThinking(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeCaseKey])

  const appendMessages = (...nextMessages: ChatMessage[]) => {
    if (mounted.current) setMessages((current) => [...current, ...nextMessages])
  }

  const attachImage = (file: File) => {
    if (file.size > 5_000_000) {
      appendMessages({
        id: `photo-too-large-${Date.now()}`,
        role: 'agent',
        content: 'chat.photoTooLarge',
        translate: true,
      })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string' && mounted.current) {
        setAttachedFile(reader.result)
      }
    }
    reader.onerror = () => {
      appendMessages({
        id: `photo-read-error-${Date.now()}`,
        role: 'agent',
        content: 'chat.photoReadError',
        translate: true,
      })
    }
    reader.readAsDataURL(file)
  }

  const selectIssue = (nextIssue: CustomerIssue) => {
    setIssue(nextIssue)
    setDraft(t(`chat.quickDraft.${nextIssue}`))
    setAttachedFile(null)
    setMessages(initialMessages)
    setActions([])
    setPendingIssueConflict(null)
    setPendingIssueReclassification(null)
    setIsThinking(false)
    setHasStarted(false)
    setCaseState('ready')
    startNewConversation()
    setFocusRequest((request) => request + 1)
  }

  const createCaseForIssue = (
    message: string,
    attachment: string | null,
    confirmedIssue: CustomerIssue,
    customerLanguage: CustomerLanguage,
    understoodItemName?: string,
    understanding?: Pick<MessageUnderstanding, 'confidence' | 'issueAmbiguous' | 'clarificationQuestion'>,
    explicitlyConfirmed = false,
  ) => {
    const baseInput = mockCaseInput(
      confirmedIssue,
      selectedOrderId,
      message,
      attachment ? [attachment] : [],
      customerLanguage,
    )
    const orderItems = findOrder(baseInput.orderId)?.items ?? []
    const claimedItemName = confirmedIssue === 'missing'
      ? understoodItemName ?? resolveOrderItem(message, orderItems)
      : undefined
    const caseData = caseStore.createCase({
      ...baseInput,
      claimedItemName,
      issueClassificationStatus: understanding
        ? issueClassificationStatus(understanding, explicitlyConfirmed)
        : 'CONFIRMED',
      issueConfidence: understanding?.confidence ?? 1,
      issueClarificationQuestion: understanding
        && issueClassificationStatus(understanding, explicitlyConfirmed) === 'PROVISIONAL'
        ? understanding.clarificationQuestion ?? fallbackClarification(customerLanguage)
        : undefined,
    })
    activeCaseId.current = caseData.caseId
    setActiveCaseKey(caseData.caseId)
    activeCustomerCaseId = caseData.caseId
    writeActiveCustomerCaseId(caseData.caseId)
    setIssue(confirmedIssue)
    setPendingIssueConflict(null)
    setPendingIssueReclassification(null)
    return caseData
  }

  const sendMessage = async () => {
    const attachment = attachedFile
    const typedMessage = draft.trim()
    const message = typedMessage || (attachment ? t('chat.photoReply') : '')
    if (!message || isThinking || sendingRef.current) return
    sendingRef.current = true
    setActions([])

    appendMessages({
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      attachment,
    })
    setDraft('')
    setAttachedFile(null)

    try {
      const selectedOrder = findOrder(selectedOrderId)
      const orderItems = selectedOrder?.items ?? []

      let currentCase: CsCase
      if (!activeCaseId.current) {
        const ruleUnderstanding = understandCustomerMessage(message, orderItems)
        const remoteUnderstanding = await understandWithOpenAI(message, orderItems, issue)
        const firstPass = remoteUnderstanding ?? ruleUnderstanding
        if (firstPass.detectedLanguage === 'other') {
          appendMessages({
            id: `unsupported-language-${Date.now()}`,
            role: 'agent',
            content: t('chat.unsupportedLanguage'),
          })
          if (mounted.current) {
            setCaseState('waiting')
            setHasStarted(true)
          }
          return
        }
        const customerLanguage: CustomerLanguage = firstPass.detectedLanguage
        const inferredIssue = customerIssueForType(firstPass.issueType)

        if (!inferredIssue) {
          appendMessages({
            id: `unsupported-${Date.now()}`,
            role: 'agent',
            content: 'chat.unsupported',
            translate: true,
          })
          if (mounted.current) {
            setCaseState('waiting')
            setHasStarted(true)
          }
          return
        }

        if (issue && issue !== inferredIssue) {
          setPendingIssueConflict({
            message,
            attachment,
            selectedIssue: issue,
            detectedIssue: inferredIssue,
            claimedItemName: firstPass.claimedItemName,
            customerLanguage,
            confidence: firstPass.confidence,
            clarificationQuestion: firstPass.clarificationQuestion,
          })
          appendMessages({
            id: `issue-conflict-${Date.now()}`,
            role: 'agent',
            content: customerLanguage === 'en'
              ? `It sounds like you are asking about ${issueLabelForLanguage(inferredIssue, 'en')}. Is that right?`
              : `말씀하신 내용은 ${issueLabelForLanguage(inferredIssue, 'ko')} 상황으로 이해했어요. 이 내용으로 확인해 볼까요?`,
          })
          setActions([
            {
              id: 'confirmDetectedIssue',
              labelKey: 'agent.actions.confirmDetectedIssue',
              label: customerLanguage === 'en' ? 'Yes' : '네',
              primary: true,
            },
            {
              id: 'keepSelectedIssue',
              labelKey: 'agent.actions.keepSelectedIssue',
              label: customerLanguage === 'en'
                ? 'No, let me explain again'
                : '아니요, 다시 설명할게요',
            },
          ])
          if (mounted.current) {
            setCaseState('waiting')
            setHasStarted(true)
          }
          return
        }

        const confirmedIssue = issue ?? inferredIssue
        currentCase = createCaseForIssue(
          message,
          attachment,
          confirmedIssue,
          customerLanguage,
          firstPass.claimedItemName,
          firstPass,
          Boolean(issue),
        )
      } else {
        const current = caseStore.appendConversation(
          activeCaseId.current,
          'customer',
          message,
        )
        if (attachment) {
          caseStore.updateCase(activeCaseId.current, {
            evidenceUrls: [...current.evidenceUrls, attachment],
          })
        }
        currentCase = caseStore.getCase(activeCaseId.current) ?? current
        if (
          currentCase.customerDetailRequestedAt
          && !currentCase.customerDetailProvidedAt
        ) {
          currentCase = caseStore.updateCase(currentCase.caseId, {
            customerDetailProvidedAt: new Date().toISOString(),
          })
        }
        const messageLanguage = detectSupportedCustomerLanguage(message)
        if (messageLanguage && messageLanguage !== currentCase.customerLanguage) {
          currentCase = caseStore.updateCase(currentCase.caseId, {
            customerLanguage: messageLanguage,
          })
        }

        if (typedMessage && hasPotentialIssueUpdate(typedMessage)) {
          const customerMessages = currentCase.conversation
            .filter((entry) => entry.role === 'customer')
            .map((entry) => entry.content)
          const hasAskedArrivalClarification = askedArrivalOrMissingClarification(currentCase)
          const ruleReassessment = reassessCustomerIssueWithRules(
            customerMessages,
            currentCase.issueType,
            orderItems,
            hasAskedArrivalClarification,
          )
          const remoteReassessment = await reassessIssueWithOpenAI(currentCase, orderItems)
          const clarificationWasResolvedByRules = hasAskedArrivalClarification
            && ruleReassessment.hasNewFacts
            && !ruleReassessment.requiresConfirmation
            && (
              (
                ruleReassessment.confidence >= 0.9
                && ruleReassessment.issueType === 'delivery_delay'
              )
              || (
                ruleReassessment.confidence >= 0.9
                &&
                ruleReassessment.issueType === 'missing_item'
                && Boolean(ruleReassessment.claimedItemName)
              )
              || (
                ruleReassessment.action === 'CLARIFY'
                && ruleReassessment.issueType === 'missing_item'
                && Boolean(ruleReassessment.clarificationQuestion)
              )
            )
          const reassessment = clarificationWasResolvedByRules
            ? ruleReassessment
            : remoteReassessment ?? ruleReassessment

          if (reassessment.hasNewFacts) {
            const proposedIssue = customerIssueForType(reassessment.issueType)
            const currentIssue = customerIssueForType(currentCase.issueType)
            const needsClarification = reassessment.action === 'CLARIFY'
              || reassessment.issueType === 'other'
              || reassessment.confidence < 0.72

            if (issueChangeLocked(currentCase) && reassessment.action !== 'KEEP') {
              currentCase = caseStore.appendConversation(
                currentCase.caseId,
                'agent',
                customerTextForCase(
                  currentCase,
                  '이 문의는 이미 매장 요청이나 최종 조치가 진행되어 유형을 자동으로 변경할 수 없어요. 다른 문제가 생겼다면 새 문의로 시작해 주세요.',
                  'This case already has a restaurant request or completed action, so its issue type cannot be changed automatically. Please start a new inquiry for the additional problem.',
                ),
              )
              if (mounted.current) {
                setMessages(conversationToMessages(currentCase))
                setCaseState(toCustomerUiState(currentCase))
                setActions(actionsForCase(currentCase))
              }
              return
            }

            if (needsClarification) {
              const question = reassessment.clarificationQuestion
                ?? fallbackClarification(currentCase.customerLanguage ?? 'ko')
              currentCase = caseStore.commitCase(currentCase.caseId, {
                changes: {
                  issueClassificationStatus: 'PROVISIONAL',
                  issueConfidence: reassessment.confidence,
                  issueClarificationQuestion: question,
                  claimedItemName: reassessment.issueType === 'missing_item'
                    && !reassessment.claimedItemName
                    ? undefined
                    : currentCase.claimedItemName,
                  status: 'COLLECTING_INFO',
                  decision: 'NEED_MORE_INFO',
                },
              })
              currentCase = caseStore.appendConversation(currentCase.caseId, 'agent', question)
              if (mounted.current) {
                setMessages(conversationToMessages(currentCase))
                setCaseState('waiting')
                setActions([])
              }
              return
            }

            if (
              reassessment.action === 'CORRECT'
              && proposedIssue
              && currentIssue
              && proposedIssue !== currentIssue
            ) {
              const canCorrectAutomatically = !reassessment.requiresConfirmation
                && reassessment.confidence >= 0.85
                && reassessment.evidence.length > 0

              if (canCorrectAutomatically) {
                currentCase = correctCaseIssue(
                  currentCase,
                  reassessment,
                  typedMessage,
                  'automatic',
                )
                currentCase = caseStore.appendConversation(
                  currentCase.caseId,
                  'agent',
                  issueCorrectionAcknowledgement(
                    proposedIssue,
                    currentCase.customerLanguage ?? 'ko',
                    reassessment.claimedItemName,
                  ),
                )
                setIssue(proposedIssue)
              } else {
                const question = reassessment.clarificationQuestion
                  ?? issueConfirmationQuestion(
                    proposedIssue,
                    currentCase.customerLanguage ?? 'ko',
                  )
                currentCase = caseStore.commitCase(currentCase.caseId, {
                  changes: {
                    issueClassificationStatus: 'PROVISIONAL',
                    issueConfidence: reassessment.confidence,
                    issueClarificationQuestion: question,
                    status: 'COLLECTING_INFO',
                    decision: 'NEED_MORE_INFO',
                  },
                })
                currentCase = caseStore.appendConversation(
                  currentCase.caseId,
                  'agent',
                  question,
                )
                setPendingIssueReclassification({
                  caseId: currentCase.caseId,
                  currentIssue,
                  proposedIssue,
                  claimedItemName: reassessment.claimedItemName,
                  confidence: reassessment.confidence,
                  customerClaim: typedMessage,
                })
                if (mounted.current) {
                  setMessages(conversationToMessages(currentCase))
                  setActions([
                    {
                      id: 'confirmIssueChange',
                      labelKey: 'agent.actions.confirmIssueChange',
                      primary: true,
                    },
                    {
                      id: 'rejectIssueChange',
                      labelKey: 'agent.actions.rejectIssueChange',
                    },
                  ])
                  setCaseState('waiting')
                }
                return
              }
            }

            const wasProvisional = currentCase.issueClassificationStatus === 'PROVISIONAL'
            currentCase = caseStore.updateCase(currentCase.caseId, {
              issueClassificationStatus: 'CONFIRMED',
              issueConfidence: reassessment.confidence,
              issueClarificationQuestion: undefined,
              claimedItemName: currentCase.issueType === 'missing_item'
                ? reassessment.claimedItemName ?? currentCase.claimedItemName
                : undefined,
              status: wasProvisional && currentCase.status === 'COLLECTING_INFO'
                ? 'CHECKING_DATA'
                : currentCase.status,
              decision: wasProvisional ? undefined : currentCase.decision,
            })
          }
        }

        const pendingMerchantRequest = currentCase.status === 'WAITING_EVIDENCE'
          && currentCase.merchantConfirmation?.customerInfoRequest
          && !currentCase.merchantConfirmation.customerInfoProvidedAt

        if (pendingMerchantRequest) {
          if (attachment && currentCase.merchantConfirmation) {
            currentCase = caseStore.updateCase(currentCase.caseId, {
              merchantConfirmation: {
                ...currentCase.merchantConfirmation,
                status: 'waiting',
                customerInfoProvidedAt: new Date().toISOString(),
              },
            })
            currentCase = caseStore.appendMerchantConversation(
              currentCase.caseId,
              'agent',
              `고객이 요청하신 사진을 첨부했습니다. 고객 메시지: ${message}`,
            )
            if (mounted.current) {
              setIsThinking(true)
              setCaseState('working')
            }
            currentCase = await processCustomerEvidence(
              currentCase.caseId,
              attachment,
            )
            if (mounted.current) {
              setMessages(conversationToMessages(currentCase))
              setCaseState(toCustomerUiState(currentCase))
              setActions(actionsForCase(currentCase))
              setHasStarted(true)
              setIsThinking(false)
            }
            return
          }

          currentCase = wantsHumanCs(message)
            ? await escalateFromCustomerChoice(
                currentCase,
                '고객이 매장의 추가 자료 요청 대신 고객센터 연결을 선택했습니다.',
              )
            : caseStore.appendConversation(
                currentCase.caseId,
                'agent',
                customerTextForCase(currentCase, '매장에서 요청한 사진을 첨부해 보내주세요. 사진 제공이 어렵거나 직접 도움을 원하시면 “고객센터 연결”을 선택할 수 있어요.', 'Please attach the photo requested by the restaurant. If you cannot provide it or want direct help, you can choose “Contact support.”'),
              )
          if (mounted.current) {
            setMessages(conversationToMessages(currentCase))
            setCaseState(toCustomerUiState(currentCase))
            setActions(actionsForCase(currentCase))
          }
          return
        }

        const unapprovedMerchantResponse = currentCase.status === 'COLLECTING_INFO'
          && currentCase.merchantConfirmation?.status === 'completed'
          && currentCase.merchantConfirmation.response !== 'CONFIRMED'
        if (unapprovedMerchantResponse && wantsHumanCs(message)) {
          currentCase = await escalateFromCustomerChoice(
            currentCase,
            '고객이 매장 답변 확인 후 고객센터 연결을 요청했습니다.',
          )
          if (mounted.current) {
            setMessages(conversationToMessages(currentCase))
            setCaseState(toCustomerUiState(currentCase))
            setActions([])
          }
          return
        }

        if (canRecoverMissingItem(currentCase)) {
          currentCase = caseStore.updateCase(currentCase.caseId, {
            status: 'CHECKING_DATA',
            decision: undefined,
            finalAction: undefined,
            escalationCode: undefined,
            escalationReason: undefined,
          })
        }

        if (
          currentCase.status === 'AUTO_RESOLVED'
          || currentCase.status === 'CLOSED'
          || currentCase.status === 'ESCALATED'
        ) {
          if (mounted.current) {
            setIsThinking(true)
            setCaseState('working')
          }
          const reply = await replyWithOpenAI(currentCase, message)
            ?? followUpWithRules(currentCase, message)
          const continued = caseStore.appendConversation(
            currentCase.caseId,
            'agent',
            reply,
          )
          if (mounted.current) {
            setMessages(conversationToMessages(continued))
            setCaseState(toCustomerUiState(continued))
            setActions(actionsForCase(continued))
          }
          return
        }
      }

      if (mounted.current) {
        setIsThinking(true)
        setCaseState('working')
      }
      const completed = await agentController.runNextStep(currentCase.caseId)
      if (mounted.current) {
        setMessages(conversationToMessages(completed))
        setCaseState(toCustomerUiState(completed))
        setActions(actionsForCase(completed))
      }
      if (mounted.current) setHasStarted(true)
    } catch (error) {
      appendMessages({
        id: `agent-error-${Date.now()}`,
        role: 'agent',
        content: error instanceof Error
          ? `Case 저장 중 오류가 발생했습니다: ${error.message}`
          : 'Case 저장 중 알 수 없는 오류가 발생했습니다.',
      })
      if (mounted.current) setCaseState('waiting')
    } finally {
      sendingRef.current = false
      if (mounted.current) setIsThinking(false)
    }
  }

  const resetConversation = () => {
    setIssue(null)
    setDraft('')
    setAttachedFile(null)
    setMessages(initialMessages)
    setActions([])
    setPendingIssueConflict(null)
    setPendingIssueReclassification(null)
    setCaseState('ready')
    setIsThinking(false)
    setHasStarted(false)
    startNewConversation()
    sendingRef.current = false
  }

  const handleAction = async (action: CustomerAgentAction) => {
    const currentCase = activeCaseId.current
      ? caseStore.getCase(activeCaseId.current)
      : undefined

    const appendAgentContent = (content: string) => {
      if (activeCaseId.current) {
        const updated = caseStore.appendConversation(activeCaseId.current, 'agent', content)
        setMessages(conversationToMessages(updated))
      } else {
        appendMessages({ id: `action-${Date.now()}`, role: 'agent', content })
      }
    }

    if (
      (action.id === 'confirmIssueChange' || action.id === 'rejectIssueChange')
      && pendingIssueReclassification
      && currentCase?.caseId === pendingIssueReclassification.caseId
      && !isThinking
    ) {
      setActions([])
      setIsThinking(true)
      setCaseState('working')
      try {
        let updated: CsCase
        if (action.id === 'confirmIssueChange') {
          const proposedIssueType = issueTypeForCustomerIssue(
            pendingIssueReclassification.proposedIssue,
          )
          updated = correctCaseIssue(currentCase, {
            action: 'CORRECT',
            issueType: proposedIssueType,
            claimedItemName: pendingIssueReclassification.claimedItemName,
            confidence: Math.max(0.9, pendingIssueReclassification.confidence),
            hasNewFacts: true,
            evidence: [pendingIssueReclassification.customerClaim],
            requiresConfirmation: false,
            detectedLanguage: currentCase.customerLanguage ?? 'ko',
          }, pendingIssueReclassification.customerClaim)
          updated = caseStore.appendConversation(
            updated.caseId,
            'agent',
            issueCorrectionAcknowledgement(
              pendingIssueReclassification.proposedIssue,
              updated.customerLanguage ?? 'ko',
              pendingIssueReclassification.claimedItemName,
            ),
          )
          setIssue(pendingIssueReclassification.proposedIssue)
          updated = await agentController.runNextStep(updated.caseId)
        } else {
          const question = fallbackClarification(currentCase.customerLanguage ?? 'ko')
          updated = caseStore.updateCase(currentCase.caseId, {
            issueClassificationStatus: 'PROVISIONAL',
            issueConfidence: 0,
            issueClarificationQuestion: question,
            status: 'COLLECTING_INFO',
            decision: 'NEED_MORE_INFO',
          })
          updated = caseStore.appendConversation(
            updated.caseId,
            'agent',
            customerTextForCase(
              updated,
              '알겠습니다. 어떤 상황인지 조금 더 자세히 알려주세요. 주문이 아직 도착하지 않은 건지, 일부 메뉴가 빠진 건지, 다른 음식이 온 건지 말씀해 주세요.',
              'Got it. Please tell me a little more about what happened—whether the order has not arrived, an item is missing, or different food arrived.',
            ),
          )
        }
        setPendingIssueReclassification(null)
        setMessages(conversationToMessages(updated))
        setCaseState(toCustomerUiState(updated))
        setActions(actionsForCase(updated))
        setHasStarted(true)
      } catch (error) {
        appendAgentContent(error instanceof Error
          ? `문의 유형 변경 중 오류가 발생했습니다: ${error.message}`
          : '문의 유형 변경 중 알 수 없는 오류가 발생했습니다.')
        setCaseState('waiting')
      } finally {
        setIsThinking(false)
      }
      return
    }

    if (
      (action.id === 'confirmDetectedIssue' || action.id === 'keepSelectedIssue')
      && pendingIssueConflict
      && !isThinking
    ) {
      const confirmedIssue = action.id === 'confirmDetectedIssue'
        ? pendingIssueConflict.detectedIssue
        : pendingIssueConflict.selectedIssue
      if (confirmedIssue === 'wrong' && !pendingIssueConflict.attachment) {
        appendAgentContent(t('chat.wrongDeliveryPhotoRequired'))
        setIssue('wrong')
        setDraft(pendingIssueConflict.message)
        setPendingIssueConflict(null)
        setActions([])
        setCaseState('waiting')
        setHasStarted(false)
        return
      }
      setActions([])
      setIsThinking(true)
      setCaseState('working')
      try {
        const created = createCaseForIssue(
          pendingIssueConflict.message,
          pendingIssueConflict.attachment,
          confirmedIssue,
          pendingIssueConflict.customerLanguage,
          pendingIssueConflict.claimedItemName,
          {
            confidence: pendingIssueConflict.confidence,
            issueAmbiguous: false,
            clarificationQuestion: pendingIssueConflict.clarificationQuestion,
          },
          true,
        )
        const completed = await agentController.runNextStep(created.caseId)
        setMessages(conversationToMessages(completed))
        setCaseState(toCustomerUiState(completed))
        setActions(actionsForCase(completed))
        setHasStarted(true)
      } catch (error) {
        appendAgentContent(error instanceof Error
          ? `Case 저장 중 오류가 발생했습니다: ${error.message}`
          : 'Case 저장 중 알 수 없는 오류가 발생했습니다.')
        setCaseState('waiting')
      } finally {
        setIsThinking(false)
      }
      return
    }

    if (action.id === 'escalateHuman' && currentCase && !isThinking) {
      setActions([])
      setIsThinking(true)
      setCaseState('working')
      try {
        const escalated = await escalateFromCustomerChoice(
          currentCase,
          '고객이 매장과의 추가 확인 대신 고객센터 연결을 직접 선택했습니다.',
        )
        setMessages(conversationToMessages(escalated))
        setCaseState(toCustomerUiState(escalated))
      } catch (error) {
        appendAgentContent(error instanceof Error
          ? `고객센터 연결 중 오류가 발생했습니다: ${error.message}`
          : '고객센터 연결 중 알 수 없는 오류가 발생했습니다.')
        setCaseState('waiting')
      } finally {
        setIsThinking(false)
      }
      return
    }

    if (action.id === 'confirmRefund' && currentCase) {
      const item = currentCase.order?.items.find((candidate) =>
        candidate.name === currentCase.claimedItemName,
      )
      if (item && claimedItemConflictsWithCustomerStatement(currentCase)) {
        let corrected = caseStore.updateCase(currentCase.caseId, {
          claimedItemName: undefined,
          issueClassificationStatus: 'PROVISIONAL',
          issueConfidence: 0,
          issueClarificationQuestion: customerTextForCase(
            currentCase,
            `주문 메뉴는 ${currentCase.order?.items.map((candidate) => candidate.name).join(', ')}입니다. 이 중 받지 못한 메뉴를 다시 알려주세요.`,
            `Your order includes ${currentCase.order?.items.map((candidate) => candidate.name).join(', ')}. Please tell me which item you did not receive.`,
          ),
          status: 'COLLECTING_INFO',
          decision: 'NEED_MORE_INFO',
        })
        corrected = caseStore.appendConversation(
          corrected.caseId,
          'agent',
          corrected.issueClarificationQuestion!,
        )
        setMessages(conversationToMessages(corrected))
        setActions([])
        setCaseState('waiting')
        return
      }
      const amount = currentCase.issueType === 'missing_item'
        ? item?.price
        : currentCase.order?.totalAmount
      if (!amount || isThinking) return

      setActions([])
      setIsThinking(true)
      setCaseState('working')
      try {
        caseStore.updateCase(currentCase.caseId, {
          status: 'ACTION_EXECUTING',
          resolutionPreference: 'refund',
        })
        await executeTool(currentCase.caseId, {
          type: 'CALL_TOOL',
          toolName: 'refund',
          input: {
            caseId: currentCase.caseId,
            orderId: currentCase.orderId,
            itemName: item?.name,
            amount,
          },
        })
        const completed = await agentController.runNextStep(currentCase.caseId)
        setMessages(conversationToMessages(completed))
        setCaseState(toCustomerUiState(completed))
        setActions(actionsForCase(completed))
      } catch (error) {
        appendAgentContent(error instanceof Error
          ? `환불 처리 중 오류가 발생했습니다: ${error.message}`
          : '환불 처리 중 알 수 없는 오류가 발생했습니다.')
        setCaseState('waiting')
      } finally {
        setIsThinking(false)
      }
      return
    }

    if (action.id === 'requestRedelivery' && currentCase && !isThinking) {
      setActions([])
      setIsThinking(true)
      setCaseState('working')
      try {
        caseStore.updateCase(currentCase.caseId, {
          status: 'ACTION_EXECUTING',
          resolutionPreference: 'redelivery',
        })
        await executeTool(currentCase.caseId, {
          type: 'CALL_TOOL',
          toolName: 'redelivery',
          input: {
            caseId: currentCase.caseId,
            orderId: currentCase.orderId,
          },
        })
        const completed = await agentController.runNextStep(currentCase.caseId)
        setMessages(conversationToMessages(completed))
        setCaseState(toCustomerUiState(completed))
        setActions(actionsForCase(completed))
      } catch (error) {
        appendAgentContent(error instanceof Error
          ? `재배달 처리 중 오류가 발생했습니다: ${error.message}`
          : '재배달 처리 중 알 수 없는 오류가 발생했습니다.')
        setCaseState('waiting')
      } finally {
        setIsThinking(false)
      }
      return
    }

    if (action.id === 'requestMerchant' && currentCase && !isThinking) {
      setActions([])
      setIsThinking(true)
      setCaseState('working')
      try {
        const updated = await executeTool(currentCase.caseId, {
          type: 'CALL_TOOL',
          toolName: 'request_merchant_confirmation',
          input: {
            caseId: currentCase.caseId,
            orderId: currentCase.orderId,
            issueType: currentCase.issueType,
            itemName: currentCase.claimedItemName,
            customerClaim: currentCase.customerClaim,
          },
        })
        const continued = caseStore.appendConversation(
          updated.caseId,
          'agent',
          t('agent.results.merchantPending'),
        )
        setMessages(conversationToMessages(continued))
        setCaseState('waiting')
      } catch (error) {
        appendAgentContent(error instanceof Error
          ? `매장 확인 요청 중 오류가 발생했습니다: ${error.message}`
          : '매장 확인 요청 중 알 수 없는 오류가 발생했습니다.')
        setCaseState('waiting')
      } finally {
        setIsThinking(false)
      }
      return
    }

    if (action.id === 'confirmCoupon' && currentCase && !isThinking) {
      const compensation = currentCase
        ? evaluateDelayCompensation(currentCase)
        : null
      if (!compensation?.eligible) {
        const resultKey = compensation?.reason === 'already_issued'
          ? 'agent.results.compensationAlreadyIssued'
          : compensation?.reason === 'insufficient_delay'
            ? 'agent.results.compensationNotEligible'
            : 'agent.results.compensationNeedsData'
        appendAgentContent(t(resultKey, {
          delayMinutes: compensation?.delayMinutes ?? 0,
          minimumMinutes: compensation?.minimumMinutes ?? 30,
          amount: (compensation?.amount ?? 3_000).toLocaleString('ko-KR'),
        }))
        setActions([])
        setCaseState('resolved')
        return
      }

      const content = t('agent.results.couponDone', {
        amount: compensation.amount.toLocaleString('ko-KR'),
      })
      setActions([])
      setIsThinking(true)
      setCaseState('working')
      try {
        caseStore.updateCase(currentCase.caseId, { status: 'ACTION_EXECUTING' })
        await executeTool(currentCase.caseId, {
          type: 'CALL_TOOL',
          toolName: 'issue_coupon',
          input: {
            caseId: currentCase.caseId,
            orderId: currentCase.orderId,
            amount: compensation.amount,
          },
        })
        const afterTool = caseStore.getCase(currentCase.caseId)
        if (afterTool?.finalActionResult?.action !== 'mock_coupon') {
          throw new Error('쿠폰 발급 Tool이 완료되지 않았습니다.')
        }
        caseStore.commitCase(currentCase.caseId, {
          changes: {
            status: 'AUTO_RESOLVED',
            decision: 'AUTO_RESOLVE',
            finalAction: 'mock_coupon',
          },
          history: [{
            actor: 'agent',
            event: 'FINAL_ACTION_COMPLETED',
            fromStatus: 'ACTION_EXECUTING',
            toStatus: 'AUTO_RESOLVED',
            detail: content,
          }],
        })
        appendAgentContent(content)
        setCaseState('resolved')
      } catch (error) {
        caseStore.updateCase(currentCase.caseId, { status: 'ACTION_READY' })
        appendAgentContent(error instanceof Error
          ? `쿠폰 발급 중 오류가 발생했습니다: ${error.message}`
          : '쿠폰 발급 중 알 수 없는 오류가 발생했습니다.')
        setActions([
          { id: 'confirmCoupon', labelKey: 'agent.actions.confirmCoupon', primary: true },
          { id: 'cancelAction', labelKey: 'agent.actions.cancelAction' },
        ])
        setCaseState('waiting')
      } finally {
        setIsThinking(false)
      }
      return
    }

    if (action.id === 'checkCompensation') {
      const compensation = currentCase
        ? evaluateDelayCompensation(currentCase)
        : null
      const resultKey = compensation?.reason === 'already_issued'
        ? 'agent.results.compensationAlreadyIssued'
        : compensation?.reason === 'insufficient_delay'
          ? 'agent.results.compensationNotEligible'
          : compensation?.reason === 'missing_delivery' || !compensation
            ? 'agent.results.compensationNeedsData'
            : 'agent.results.compensationOffer'
      const content = t(resultKey, {
        delayMinutes: compensation?.delayMinutes ?? 0,
        minimumMinutes: compensation?.minimumMinutes ?? 30,
        amount: (compensation?.amount ?? 3_000).toLocaleString('ko-KR'),
      })

      appendAgentContent(content)

      if (compensation?.eligible) {
        setActions([
          { id: 'confirmCoupon', labelKey: 'agent.actions.confirmCoupon', primary: true },
          { id: 'cancelAction', labelKey: 'agent.actions.cancelAction' },
        ])
        setCaseState('waiting')
      } else {
        setActions([])
        setCaseState('resolved')
      }
      return
    }

    const resultKeyByAction: Partial<Record<CustomerAgentAction['id'], string>> = {
      trackDelivery: 'agent.results.trackingDone',
      cancelAction: 'agent.results.noAction',
      checkRefund: 'agent.results.refundOffer',
      escalateHuman: 'agent.results.escalationDone',
    }
    const resultKey = resultKeyByAction[action.id]
    if (!resultKey) return

    const content = t(resultKey)
    appendAgentContent(content)

    if (action.id === 'cancelAction' && currentCase) {
      caseStore.updateCase(currentCase.caseId, {
        status: 'AUTO_RESOLVED',
        finalAction: 'no_action',
      })
    }

    if (action.id === 'checkRefund') {
      setActions([
        { id: 'confirmRefund', labelKey: 'agent.actions.confirmRefund', primary: true },
        { id: 'cancelAction', labelKey: 'agent.actions.cancelAction' },
      ])
      setCaseState('waiting')
      return
    }

    setActions([])
    setCaseState('resolved')
  }

  const orderCardCase = activeCaseKey ? caseStore.getCase(activeCaseKey) : undefined
  const selectedOrder = orderCardCase?.order ?? findOrder(selectedOrderId)
  const customerName = selectedOrder
    ? findCustomer(selectedOrder.customerId)?.name
    : undefined

  return (
    <div className="customer-page">
      <CustomerHeader />
      <main className="customer-shell customer-main">
        <section className="customer-welcome"><span>{t('welcome.eyebrow', { name: customerName ?? t('welcome.customerFallback') })}</span><h1>{t('welcome.title')}</h1><p>{t('welcome.description')}</p></section>
        <div className="customer-layout">
          <div className="customer-layout__left">
            <OrderSummaryCard
              orderId={selectedOrderId}
              locked={hasStarted || isThinking}
              onOrderChange={setSelectedOrderId}
              orderSnapshot={orderCardCase?.order}
              deliverySnapshot={orderCardCase?.delivery}
            />
            <IssueSelector selected={issue} onSelect={selectIssue} />
            <TrustPanel />
          </div>
          <div className="customer-layout__right">
            <AgentWorkspace
              issue={issue}
              messages={messages}
              actions={actions}
              draft={draft}
              attachedFile={attachedFile}
              caseState={caseState}
              isThinking={isThinking}
              focusRequest={focusRequest}
              hasStarted={hasStarted}
              conversationEnded={orderCardCase?.status === 'ESCALATED'}
              onDraftChange={setDraft}
              onAttach={attachImage}
              onSend={sendMessage}
              onAction={handleAction}
              onReset={resetConversation}
            />
          </div>
        </div>
      </main>
      <CustomerBottomNav />
    </div>
  )
}
