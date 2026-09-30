import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentWorkspace } from '../components/customer/AgentWorkspace'
import { CustomerBottomNav } from '../components/customer/CustomerBottomNav'
import { CustomerHeader } from '../components/customer/CustomerHeader'
import { IssueSelector } from '../components/customer/IssueSelector'
import { OrderSummaryCard } from '../components/customer/OrderSummaryCard'
import { TrustPanel } from '../components/customer/TrustPanel'
import type { AgentAction, AgentActionId, AgentCaseState, ChatMessage, CustomerIssue } from '../types/customer'
import '../styles/customer.css'

const initialMessages: ChatMessage[] = [
  { id: 'intro', role: 'agent', content: 'chat.intro', translate: true },
]

const initialActions: Record<CustomerIssue, AgentAction[]> = {
  delay: [
    { id: 'trackDelivery', labelKey: 'agent.actions.trackDelivery', primary: true },
    { id: 'checkCompensation', labelKey: 'agent.actions.checkCompensation' },
  ],
  missing: [
    { id: 'checkRefund', labelKey: 'agent.actions.checkRefund', primary: true },
    { id: 'requestMerchant', labelKey: 'agent.actions.requestMerchant' },
  ],
  wrong: [
    { id: 'requestRedelivery', labelKey: 'agent.actions.requestRedelivery', primary: true },
    { id: 'escalateHuman', labelKey: 'agent.actions.escalateHuman' },
  ],
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

export function CustomerPage() {
  const { t } = useTranslation('customer')
  const [issue, setIssue] = useState<CustomerIssue | null>(null)
  const [draft, setDraft] = useState('')
  const [attachedFile, setAttachedFile] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [actions, setActions] = useState<AgentAction[]>([])
  const [caseState, setCaseState] = useState<AgentCaseState>('ready')
  const [isThinking, setIsThinking] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
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
    setActions([])
    setHasStarted(false)
    setCaseState('ready')
    setFocusRequest((request) => request + 1)
  }

  const finishThinking = () => {
    if (mounted.current) setIsThinking(false)
  }

  const runInitialAgentTurn = async (currentIssue: CustomerIssue) => {
    setCaseState('working')
    setIsThinking(true)
    await wait(650)
    appendMessages({ id: `tool-order-${Date.now()}`, role: 'tool', content: `agent.tools.${currentIssue}`, translate: true })
    await wait(650)
    appendMessages({ id: `analysis-${Date.now()}`, role: 'agent', content: `agent.analysis.${currentIssue}`, translate: true })
    if (mounted.current) {
      setActions(initialActions[currentIssue])
      setCaseState('waiting')
      setHasStarted(true)
    }
    finishThinking()
  }

  const sendMessage = async () => {
    const message = draft.trim()
    if (!message || isThinking) return
    if (issue === 'wrong' && !attachedFile && !hasStarted) return

    appendMessages({ id: `user-${Date.now()}`, role: 'user', content: message, attachment: attachedFile })
    setDraft('')
    setAttachedFile(null)
    setActions([])

    if (issue && !hasStarted) {
      await runInitialAgentTurn(issue)
      return
    }

    setCaseState('working')
    setIsThinking(true)
    await wait(700)
    appendMessages({ id: `followup-${Date.now()}`, role: 'agent', content: 'agent.followUp', translate: true })
    if (mounted.current) setCaseState('waiting')
    finishThinking()
  }

  const completeAction = async (toolKey: string, responseKey: string, nextActions: AgentAction[] = [], nextState: AgentCaseState = 'resolved') => {
    await wait(550)
    appendMessages({ id: `tool-${Date.now()}`, role: 'tool', content: toolKey, translate: true })
    await wait(550)
    appendMessages({ id: `agent-${Date.now()}`, role: 'agent', content: responseKey, translate: true })
    if (mounted.current) {
      setActions(nextActions)
      setCaseState(nextState)
      setIsThinking(false)
    }
  }

  const chooseAction = async (action: AgentAction) => {
    if (isThinking) return
    appendMessages({ id: `action-${Date.now()}`, role: 'user', content: action.labelKey, translate: true })
    setActions([])
    setCaseState('working')
    setIsThinking(true)

    const flows: Record<AgentActionId, () => Promise<void>> = {
      trackDelivery: () => completeAction('agent.tools.trackingEnabled', 'agent.results.trackingDone'),
      checkCompensation: () => completeAction('agent.tools.policyChecked', 'agent.results.compensationOffer', [
        { id: 'confirmCoupon', labelKey: 'agent.actions.confirmCoupon', primary: true },
        { id: 'cancelAction', labelKey: 'agent.actions.cancelAction' },
      ], 'waiting'),
      checkRefund: () => completeAction('agent.tools.refundPolicyChecked', 'agent.results.refundOffer', [
        { id: 'confirmRefund', labelKey: 'agent.actions.confirmRefund', primary: true },
        { id: 'requestMerchant', labelKey: 'agent.actions.requestMerchant' },
      ], 'waiting'),
      requestMerchant: () => completeAction('agent.tools.merchantRequested', 'agent.results.merchantPending', [], 'waiting'),
      requestRedelivery: () => completeAction('agent.tools.redeliveryCreated', 'agent.results.redeliveryDone'),
      escalateHuman: () => completeAction('agent.tools.escalationCreated', 'agent.results.escalationDone', [], 'waiting'),
      confirmCoupon: () => completeAction('agent.tools.couponIssued', 'agent.results.couponDone'),
      confirmRefund: () => completeAction('agent.tools.refundExecuted', 'agent.results.refundDone'),
      cancelAction: () => completeAction('agent.tools.noAction', 'agent.results.noAction'),
    }

    await flows[action.id]()
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
  }

  return (
    <div className="customer-page">
      <CustomerHeader />
      <main className="customer-shell customer-main">
        <section className="customer-welcome"><span>{t('welcome.eyebrow')}</span><h1>{t('welcome.title')}</h1><p>{t('welcome.description')}</p></section>
        <div className="customer-layout">
          <div className="customer-layout__left"><OrderSummaryCard /><IssueSelector selected={issue} onSelect={selectIssue} /><TrustPanel /></div>
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
              onAction={chooseAction}
              onReset={resetConversation}
            />
          </div>
        </div>
      </main>
      <CustomerBottomNav />
    </div>
  )
}
