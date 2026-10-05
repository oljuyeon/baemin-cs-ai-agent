import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentWorkspace } from '../components/customer/AgentWorkspace'
import { CustomerBottomNav } from '../components/customer/CustomerBottomNav'
import { CustomerHeader } from '../components/customer/CustomerHeader'
import { IssueSelector } from '../components/customer/IssueSelector'
import { OrderSummaryCard } from '../components/customer/OrderSummaryCard'
import { TrustPanel } from '../components/customer/TrustPanel'
import {
  caseStore,
  type CsCase,
  type CreateCaseInput,
} from '../features/cs'
import { agentController } from '../features/agent'
import type { ChatMessage, CustomerIssue } from '../types/customer'
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

const conversationToMessages = (caseData: CsCase): ChatMessage[] => [
  ...initialMessages,
  ...caseData.conversation.map((message, index) => ({
    id: `${message.role}-${message.createdAt}-${index}`,
    role: message.role === 'customer' ? 'user' as const : 'agent' as const,
    content: message.content,
  })),
]

export function CustomerPage() {
  const { t } = useTranslation('customer')
  const [issue, setIssue] = useState<CustomerIssue | null>(null)
  const [draft, setDraft] = useState('')
  const [attachedFile, setAttachedFile] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [caseState, setCaseState] = useState<'ready' | 'working' | 'waiting' | 'resolved'>('ready')
  const [isThinking, setIsThinking] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const activeCaseId = useRef<string | null>(null)
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
    if (!message || isThinking || !issue) return
    if (issue === 'wrong' && !attachedFile && !hasStarted) return

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
        const caseData = caseStore.createCase(
          mockCaseInput(issue, message, attachment ? [attachment] : []),
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
      }

      if (currentCase.issueType === 'missing_item') {
        if (mounted.current) {
          setIsThinking(true)
          setCaseState('working')
        }
        const completed = await agentController.runNextStep(currentCase.caseId)
        if (mounted.current) {
          setMessages(conversationToMessages(completed))
          setCaseState(toCustomerUiState(completed))
        }
      } else {
        appendMessages({
          id: `notice-${Date.now()}`,
          role: 'agent',
          content: 'chat.savedWithoutAgent',
          translate: true,
        })
        if (mounted.current) setCaseState('waiting')
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
      if (mounted.current) setIsThinking(false)
    }
  }

  const resetConversation = () => {
    setIssue(null)
    setDraft('')
    setAttachedFile(null)
    setMessages(initialMessages)
    setCaseState('ready')
    setIsThinking(false)
    setHasStarted(false)
    activeCaseId.current = null
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
              actions={[]}
              draft={draft}
              attachedFile={attachedFile}
              caseState={caseState}
              isThinking={isThinking}
              focusRequest={focusRequest}
              hasStarted={hasStarted}
              onDraftChange={setDraft}
              onAttach={setAttachedFile}
              onSend={sendMessage}
              onAction={() => undefined}
              onReset={resetConversation}
            />
          </div>
        </div>
      </main>
      <CustomerBottomNav />
    </div>
  )
}
