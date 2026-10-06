import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentWorkspace } from '../components/customer/AgentWorkspace'
import { CustomerBottomNav } from '../components/customer/CustomerBottomNav'
import { CustomerHeader } from '../components/customer/CustomerHeader'
import { IssueSelector } from '../components/customer/IssueSelector'
import { OrderSummaryCard } from '../components/customer/OrderSummaryCard'
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

const mockCaseInput = (
  issue: CustomerIssue,
  customerClaim: string,
  evidenceUrls: string[],
): CreateCaseInput => {
  const shared = { customerClaim, evidenceUrls }

  if (issue === 'delay') {
    return {
      customerId: 'C001',
      orderId: 'A1001',
      storeId: 'S001',
      issueType: 'delivery_delay',
      ...shared,
    }
  }

  if (issue === 'missing') {
    return {
      customerId: 'C002',
      orderId: 'A1002',
      storeId: 'S002',
      issueType: 'missing_item',
      ...shared,
    }
  }

  return {
    customerId: 'C005',
    orderId: 'A1005',
    storeId: 'S002',
    issueType: 'wrong_delivery',
    ...shared,
  }
}

const customerIssueForType = (issueType: CsCase['issueType']): CustomerIssue | null => {
  if (issueType === 'delivery_delay') return 'delay'
  if (issueType === 'missing_item') return 'missing'
  if (issueType === 'wrong_delivery') return 'wrong'
  return null
}

const toCustomerUiState = (caseData: CsCase) => {
  if (caseData.status === 'AUTO_RESOLVED' || caseData.status === 'CLOSED') return 'resolved' as const
  if (
    caseData.status === 'COLLECTING_INFO'
    || caseData.status === 'WAITING_EVIDENCE'
    || caseData.status === 'WAITING_MERCHANT'
    || caseData.status === 'ESCALATED'
  ) return 'waiting' as const
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
    caseData.status === 'COLLECTING_INFO'
    && caseData.issueType === 'missing_item'
    && caseData.claimedItemName
    && caseData.order
    && !caseData.toolHistory.some((tool) => tool.toolName === 'refund')
  ) {
    const policy = evaluatePolicy(caseData)
    const risk = assessRisk(caseData)
    const item = caseData.order.items.find((candidate) =>
      candidate.name === caseData.claimedItemName,
    )
    if (
      item
      && policy.allowedActions.includes('mock_refund')
      && !risk.blockedActions.includes('mock_refund')
    ) {
      return [
        {
          id: 'confirmRefund',
          labelKey: 'agent.actions.confirmRefund',
          label: `${item.name} ${item.price.toLocaleString('ko-KR')}원 환불하기`,
          primary: true,
        },
        { id: 'requestMerchant', labelKey: 'agent.actions.requestMerchant' },
        { id: 'cancelAction', labelKey: 'agent.actions.cancelAction' },
      ]
    }
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

export function CustomerPage() {
  const { t } = useTranslation('customer')
  const [issue, setIssue] = useState<CustomerIssue | null>(null)
  const [draft, setDraft] = useState('')
  const [attachedFile, setAttachedFile] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [actions, setActions] = useState<CustomerAgentAction[]>([])
  const [caseState, setCaseState] = useState<'ready' | 'working' | 'waiting' | 'resolved'>('ready')
  const [isThinking, setIsThinking] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const activeCaseId = useRef<string | null>(null)
  const sendingRef = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const appendMessages = (...nextMessages: ChatMessage[]) => {
    if (mounted.current) setMessages((current) => [...current, ...nextMessages])
  }

  const selectIssue = (nextIssue: CustomerIssue) => {
    setIssue(nextIssue)
    setDraft(t(`chat.quickDraft.${nextIssue}`))
    setAttachedFile(null)
    setHasStarted(false)
    setCaseState('ready')
    activeCaseId.current = null
    setFocusRequest((request) => request + 1)
  }

  const sendMessage = async () => {
    const message = draft.trim()
    if (!message || isThinking || sendingRef.current) return
    sendingRef.current = true
    setActions([])

    const attachment = attachedFile
    appendMessages({
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      attachment,
    })
    setDraft('')
    setAttachedFile(null)

    try {
      let currentCase: CsCase
      if (!activeCaseId.current) {
        const firstPass = await understandWithOpenAI(message, [], issue)
          ?? understandCustomerMessage(message, [], issue)
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

        const baseInput = mockCaseInput(
          inferredIssue,
          message,
          attachment ? [attachment] : [],
        )
        const orderItems = findOrder(baseInput.orderId)?.items ?? []
        const claimedItemName = firstPass.issueType === 'missing_item'
          ? resolveOrderItem(message, orderItems)
          : undefined
        if (mounted.current) setIssue(inferredIssue)
        const caseData = caseStore.createCase(
          {
            ...baseInput,
            claimedItemName,
          },
        )
        activeCaseId.current = caseData.caseId
        currentCase = caseData
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
    setCaseState('ready')
    setIsThinking(false)
    setHasStarted(false)
    activeCaseId.current = null
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

    if (action.id === 'confirmRefund' && currentCase) {
      const item = currentCase.order?.items.find((candidate) =>
        candidate.name === currentCase.claimedItemName,
      )
      if (!item || isThinking) return

      setActions([])
      setIsThinking(true)
      setCaseState('working')
      try {
        await executeTool(currentCase.caseId, {
          type: 'CALL_TOOL',
          toolName: 'refund',
          input: {
            caseId: currentCase.caseId,
            orderId: currentCase.orderId,
            itemName: item.name,
            amount: item.price,
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
      requestRedelivery: 'agent.results.redeliveryDone',
      escalateHuman: 'agent.results.escalationDone',
    }
    const resultKey = resultKeyByAction[action.id]
    if (!resultKey) return

    const content = t(resultKey)
    appendAgentContent(content)

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
          <div className="customer-layout__left"><OrderSummaryCard issue={issue} /><IssueSelector selected={issue} onSelect={selectIssue} /><TrustPanel /></div>
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
