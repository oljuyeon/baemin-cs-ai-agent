import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentWorkspace } from '../components/customer/AgentWorkspace'
import { CustomerBottomNav } from '../components/customer/CustomerBottomNav'
import { CustomerHeader } from '../components/customer/CustomerHeader'
import { IssueSelector } from '../components/customer/IssueSelector'
import {
  firstSelectableOrderId,
  OrderSummaryCard,
  selectableOrders,
} from '../components/customer/OrderSummaryCard'
import { TrustPanel } from '../components/customer/TrustPanel'
import {
  assessRisk,
  caseStore,
  evaluateDelayCompensation,
  evaluatePolicy,
  findOrder,
  type CsCase,
  type CreateCaseInput,
  type ToolName,
} from '../features/cs'
import {
  agentController,
  executeTool,
  replyWithOpenAI,
  resolveOrderItem,
  surfaceMerchantCustomerRequest,
  understandCustomerMessage,
  understandWithOpenAI,
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

const ACTIVE_CUSTOMER_CASE_KEY = 'delivery-cs-agent:active-customer-case:v1'
const NEW_CONVERSATION_VALUE = 'new'

interface PendingIssueConflict {
  message: string
  attachment: string | null
  selectedIssue: CustomerIssue
  detectedIssue: CustomerIssue
}

const mockCaseInput = (
  issue: CustomerIssue,
  orderId: string,
  customerClaim: string,
  evidenceUrls: string[],
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
  }
}

const customerIssueForType = (issueType: CsCase['issueType']): CustomerIssue | null => {
  if (issueType === 'delivery_delay') return 'delay'
  if (issueType === 'missing_item') return 'missing'
  if (issueType === 'wrong_delivery') return 'wrong'
  return null
}

const selectableOrderItems = selectableOrders.flatMap((order) => order.items)

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
  get_order: 'agent.toolEvents.getOrder',
  get_delivery: 'agent.toolEvents.getDelivery',
  get_cs_history: 'agent.toolEvents.getCsHistory',
  get_policy: 'agent.toolEvents.getPolicy',
  check_risk: 'agent.toolEvents.checkRisk',
  analyze_evidence: 'agent.toolEvents.analyzeEvidence',
  request_merchant_confirmation: 'agent.toolEvents.requestMerchant',
  refund: 'agent.toolEvents.refund',
  redelivery: 'agent.toolEvents.redelivery',
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

  return [...initialMessages, ...timeline.map((entry) => entry.message)]
}

const delayActions: CustomerAgentAction[] = [
  { id: 'trackDelivery', labelKey: 'agent.actions.trackDelivery', primary: true },
  { id: 'checkCompensation', labelKey: 'agent.actions.checkCompensation' },
]

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
  if (caseData.issueType === 'delivery_delay') {
    const compensation = evaluateDelayCompensation(caseData)
    const claimedMinutes = customerMessage.match(/(\d+)\s*분/)?.[1]
    const measuredMinutes = compensation.delayMinutes
    const difference = claimedMinutes && measuredMinutes !== null
      ? `말씀하신 ${claimedMinutes}분과 차이가 있네요. `
      : ''

    if (measuredMinutes === null) {
      return `${difference}현재는 배송 시간 데이터가 없어 지연 시간을 다시 확인하기 어렵습니다.`
    }
    if (compensation.reason === 'already_issued') {
      return `${difference}시스템 배송 데이터 기준 실제 지연은 ${measuredMinutes}분이며, 이 주문에는 이미 보상 쿠폰이 발급됐습니다.`
    }
    if (compensation.eligible) {
      return `${difference}시스템 배송 데이터 기준 실제 지연은 ${measuredMinutes}분으로 확인돼 ${compensation.amount.toLocaleString('ko-KR')}원 쿠폰 대상입니다.`
    }
    return `${difference}시스템 배송 데이터 기준 실제 지연은 ${measuredMinutes}분입니다. 현재 Mock 정책은 ${compensation.minimumMinutes}분 이상부터 보상합니다.`
  }

  if (caseData.status === 'ESCALATED') {
    return '현재 데모의 상담원 연결은 대기열에 Mock 접수하는 단계까지만 구현되어 있어, 기다려도 전화나 실시간 상담이 자동으로 시작되지는 않습니다.'
  }

  return '앞서 확인한 주문 정보와 처리 결과를 유지하고 있어요. 궁금한 내용을 조금 더 구체적으로 말씀해 주세요.'
}

const canRecoverMissingItem = (caseData: CsCase) => {
  if (
    caseData.status !== 'ESCALATED'
    || caseData.issueType !== 'missing_item'
    || !caseData.claimedItemName
    || !caseData.order
  ) return false

  const policy = evaluatePolicy(caseData)
  const risk = assessRisk(caseData)
  return policy.allowedActions.includes('mock_refund')
    && !risk.blockedActions.includes('mock_refund')
}

const wantsHumanCs = (message: string) =>
  /(고객센터|상담원|사람.*연결|직원.*연결|상담.*연결)/.test(message.replace(/\s+/g, ''))

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
        `고객 선택: Human CS 연결`,
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
    '요청하신 대로 고객센터에 문의 맥락과 매장 답변을 함께 전달했습니다. 같은 내용을 다시 설명하지 않아도 됩니다.',
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
  const activeCaseId = useRef<string | null>(null)
  const [activeCaseKey, setActiveCaseKey] = useState<string | null>(null)
  const sendingRef = useRef(false)
  const mounted = useRef(true)

  const showCase = (caseData: CsCase) => {
    const visibleCase = caseData.merchantConfirmation
      ? surfaceMerchantCustomerRequest(caseData.caseId)
      : caseData
    activeCaseId.current = visibleCase.caseId
    setActiveCaseKey(visibleCase.caseId)
    window.localStorage.setItem(ACTIVE_CUSTOMER_CASE_KEY, visibleCase.caseId)
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
    window.localStorage.setItem(ACTIVE_CUSTOMER_CASE_KEY, NEW_CONVERSATION_VALUE)
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
    const storedCaseId = window.localStorage.getItem(ACTIVE_CUSTOMER_CASE_KEY)
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

  const appendMessages = (...nextMessages: ChatMessage[]) => {
    if (mounted.current) setMessages((current) => [...current, ...nextMessages])
  }

  const selectIssue = (nextIssue: CustomerIssue) => {
    setIssue(nextIssue)
    setDraft(t(`chat.quickDraft.${nextIssue}`))
    setAttachedFile(null)
    setMessages(initialMessages)
    setActions([])
    setPendingIssueConflict(null)
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
  ) => {
    const baseInput = mockCaseInput(
      confirmedIssue,
      selectedOrderId,
      message,
      attachment ? [attachment] : [],
    )
    const orderItems = findOrder(baseInput.orderId)?.items ?? []
    const claimedItemName = confirmedIssue === 'missing'
      ? resolveOrderItem(message, orderItems)
      : undefined
    const caseData = caseStore.createCase({
      ...baseInput,
      claimedItemName,
    })
    activeCaseId.current = caseData.caseId
    setActiveCaseKey(caseData.caseId)
    window.localStorage.setItem(ACTIVE_CUSTOMER_CASE_KEY, caseData.caseId)
    setIssue(confirmedIssue)
    setPendingIssueConflict(null)
    return caseData
  }

  const sendMessage = async () => {
    const attachment = attachedFile
    const message = draft.trim() || (attachment ? t('chat.photoReply') : '')
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
      const referencedItemName = resolveOrderItem(message, selectableOrderItems)
      const itemBelongsToOrder = referencedItemName
        ? orderItems.some((item) => item.name === referencedItemName)
        : true

      if (referencedItemName && !itemBelongsToOrder) {
        appendMessages({
          id: `order-mismatch-${Date.now()}`,
          role: 'agent',
          content: t('chat.itemNotInOrder', {
            orderId: selectedOrderId,
            itemName: referencedItemName,
            orderItems: orderItems.map((item) => item.name).join(', '),
          }),
        })
        if (mounted.current) {
          setDraft(message)
          setAttachedFile(attachment)
          setCaseState('waiting')
          setHasStarted(false)
          setFocusRequest((request) => request + 1)
        }
        return
      }

      let currentCase: CsCase
      if (!activeCaseId.current) {
        const ruleUnderstanding = understandCustomerMessage(message, orderItems)
        const remoteUnderstanding = ruleUnderstanding.issueType === 'other'
          ? await understandWithOpenAI(message, orderItems, null)
          : null
        const firstPass = remoteUnderstanding ?? ruleUnderstanding
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
          })
          appendMessages({
            id: `issue-conflict-${Date.now()}`,
            role: 'agent',
            content: t('chat.issueConflict', {
              selected: t(`issues.${issue}.short`),
              detected: t(`issues.${inferredIssue}.short`),
            }),
          })
          setActions([
            {
              id: 'confirmDetectedIssue',
              labelKey: 'agent.actions.confirmDetectedIssue',
              label: t('agent.actions.confirmDetectedIssue', {
                issue: t(`issues.${inferredIssue}.short`),
              }),
              primary: true,
            },
            {
              id: 'keepSelectedIssue',
              labelKey: 'agent.actions.keepSelectedIssue',
              label: t('agent.actions.keepSelectedIssue', {
                issue: t(`issues.${issue}.short`),
              }),
            },
          ])
          if (mounted.current) {
            setCaseState('waiting')
            setHasStarted(true)
          }
          return
        }

        currentCase = createCaseForIssue(message, attachment, issue ?? inferredIssue)
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
            currentCase = caseStore.appendConversation(
              currentCase.caseId,
              'agent',
              '첨부한 사진과 메시지를 매장에 전달했습니다. 매장 답변이 오면 이 대화에서 바로 알려드릴게요.',
            )
            if (mounted.current) {
              setMessages(conversationToMessages(currentCase))
              setCaseState(toCustomerUiState(currentCase))
              setActions(actionsForCase(currentCase))
              setHasStarted(true)
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
                '매장에서 요청한 사진을 첨부해 보내주세요. 사진 제공이 어렵거나 직접 도움을 원하시면 “고객센터 연결”을 선택할 수 있어요.',
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
      (action.id === 'confirmDetectedIssue' || action.id === 'keepSelectedIssue')
      && pendingIssueConflict
      && !isThinking
    ) {
      const confirmedIssue = action.id === 'confirmDetectedIssue'
        ? pendingIssueConflict.detectedIssue
        : pendingIssueConflict.selectedIssue
      setActions([])
      setIsThinking(true)
      setCaseState('working')
      try {
        const created = createCaseForIssue(
          pendingIssueConflict.message,
          pendingIssueConflict.attachment,
          confirmedIssue,
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

    if (action.id === 'checkCompensation' || action.id === 'confirmCoupon') {
      const compensation = currentCase
        ? evaluateDelayCompensation(currentCase)
        : null
      const resultKey = compensation?.reason === 'already_issued'
        ? 'agent.results.compensationAlreadyIssued'
        : compensation?.reason === 'insufficient_delay'
          ? 'agent.results.compensationNotEligible'
          : compensation?.reason === 'missing_delivery' || !compensation
            ? 'agent.results.compensationNeedsData'
            : action.id === 'confirmCoupon'
              ? 'agent.results.couponDone'
              : 'agent.results.compensationOffer'
      const content = t(resultKey, {
        delayMinutes: compensation?.delayMinutes ?? 0,
        minimumMinutes: compensation?.minimumMinutes ?? 30,
        amount: (compensation?.amount ?? 3_000).toLocaleString('ko-KR'),
      })

      if (action.id === 'confirmCoupon' && compensation?.eligible && currentCase) {
        caseStore.updateCase(currentCase.caseId, { finalAction: 'mock_coupon' })
      }
      appendAgentContent(content)

      if (action.id === 'checkCompensation' && compensation?.eligible) {
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

  return (
    <div className="customer-page">
      <CustomerHeader />
      <main className="customer-shell customer-main">
        <section className="customer-welcome"><span>{t('welcome.eyebrow')}</span><h1>{t('welcome.title')}</h1><p>{t('welcome.description')}</p></section>
        <div className="customer-layout">
          <div className="customer-layout__left"><OrderSummaryCard orderId={selectedOrderId} locked={hasStarted || isThinking} onOrderChange={setSelectedOrderId} /><IssueSelector selected={issue} onSelect={selectIssue} /><TrustPanel /></div>
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
              onDraftChange={setDraft}
              onAttach={setAttachedFile}
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
