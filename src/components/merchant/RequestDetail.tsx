import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  agentTools,
  caseStore,
  type CsCase,
  type MerchantResponse,
  type OrderData,
} from '../../features/cs'
import { summarizeMerchantClaimWithOpenAI } from '../../features/agent'
import { BackIcon } from '../customer/CustomerIcons'

const responses: MerchantResponse[] = [
  'CONFIRMED',
  'DENIED',
  'POSSIBLE',
  'UNKNOWN',
]

const formatWhen = (value: string | undefined, language: string) => {
  if (!value) return ''
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const formatPrice = (price: number, language: string) =>
  new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ko-KR').format(price)

const progressKey = (caseData: CsCase) => {
  switch (caseData.status) {
    case 'COLLECTING_INFO': return 'history.waitingCustomer'
    case 'WAITING_EVIDENCE': return 'history.waitingEvidence'
    case 'WAITING_MERCHANT': return 'history.waitingMerchant'
    case 'CHECKING_DATA':
    case 'POLICY_CHECK':
    case 'RISK_CHECK':
      return 'history.agentProcessing'
    default:
      return `status.${caseData.status}`
  }
}

const pendingActionKey = (caseData: CsCase) => {
  switch (caseData.status) {
    case 'COLLECTING_INFO': return 'history.afterCustomerReply'
    case 'WAITING_EVIDENCE': return 'history.afterEvidence'
    case 'WAITING_MERCHANT': return 'history.afterMerchantReply'
    case 'CHECKING_DATA':
    case 'POLICY_CHECK':
    case 'RISK_CHECK':
      return 'history.agentReviewing'
    default:
      return 'history.noFinal'
  }
}

function EvidenceCard({ url }: { url: string }) {
  const { t } = useTranslation('merchant')
  const displayable = /^(https?:|blob:|data:)/.test(url)
  if (displayable) {
    return (
      <figure className="merchant-evidence">
        <img src={url} alt={t('detail.photoCaption')} />
      </figure>
    )
  }
  const label = url.split('/').pop() ?? url
  return (
    <figure className="merchant-evidence merchant-evidence--mock">
      <span aria-hidden="true" />
      <figcaption>
        <strong>{t('detail.photoCaption')}</strong>
        <small>{label}</small>
      </figcaption>
    </figure>
  )
}

export function RequestDetail({
  caseData,
  showBack,
  onBack,
  onSaved,
  onError,
  onMerchantReply,
}: {
  caseData: CsCase | null
  showBack: boolean
  onBack: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
  onMerchantReply: (caseId: string) => Promise<'completed' | 'follow_up' | 'customer_input'>
}) {
  const { t, i18n } = useTranslation('merchant')
  const [order, setOrder] = useState<OrderData | null>(caseData?.order ?? null)
  const [draft, setDraft] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submittingToAgent, setSubmittingToAgent] = useState(false)
  const [claimSummary, setClaimSummary] = useState<string>()
  const [claimSummaryState, setClaimSummaryState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const submittingRef = useRef(false)

  const caseId = caseData?.caseId
  const orderId = caseData?.orderId
  const storedOrder = caseData?.order
  const caseUpdatedAt = caseData?.updatedAt
  const summaryLanguage = i18n.resolvedLanguage || i18n.language || 'ko'

  useEffect(() => {
    setDraft('')
    setFormError(null)
    setSubmittingToAgent(false)
    submittingRef.current = false
    if (!caseId || !orderId) {
      setOrder(null)
      return
    }
    if (storedOrder) {
      setOrder(storedOrder)
      return
    }
    let cancelled = false
    agentTools.getOrder({ orderId }).then((result) => {
      if (cancelled) return
      setOrder(result.status === 'success' ? result.data : null)
    })
    return () => {
      cancelled = true
    }
  }, [caseId, orderId])

  useEffect(() => {
    if (!caseData) {
      setClaimSummary(undefined)
      setClaimSummaryState('idle')
      return
    }

    let cancelled = false
    const current = caseData
    setClaimSummary(undefined)
    setClaimSummaryState('loading')
    void summarizeMerchantClaimWithOpenAI(current, summaryLanguage)
      .then((summary) => {
        if (cancelled) return
        setClaimSummary(summary)
        setClaimSummaryState('ready')
      })
      .catch((summaryError) => {
        if (cancelled) return
        console.warn('사장님 화면의 고객 주장 요약을 생성하지 못했습니다.', summaryError)
        setClaimSummaryState('error')
      })

    return () => {
      cancelled = true
    }
  }, [caseId, caseUpdatedAt, summaryLanguage])

  if (!caseData) {
    return (
      <section className="merchant-detail merchant-detail--empty">
        <h2>{t('detail.emptyTitle')}</h2>
        <p>{t('detail.emptyBody')}</p>
      </section>
    )
  }

  const waiting = caseData.status === 'WAITING_MERCHANT'
  const confirmation = caseData.merchantConfirmation
  const photos = caseData.evidenceUrls.length > 0
    ? caseData.evidenceUrls
    : confirmation?.evidenceUrl
      ? [confirmation.evidenceUrl]
      : []

  const messages = confirmation?.conversation ?? []
  const selectedResponse = confirmation?.response
  const responseLabel = (response: MerchantResponse) => t(
    `issueResponses.${caseData.issueType}.${response}`,
    { defaultValue: t(`responses.${response}`) },
  )
  const timeline = [
    ...messages.map((message) => ({ ...message, kind: 'message' as const })),
    ...(selectedResponse
      ? [{
          kind: 'choice' as const,
          role: 'merchant' as const,
          content: responseLabel(selectedResponse),
          createdAt: confirmation?.respondedAt ?? confirmation?.requestedAt ?? '',
        }]
      : []),
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  const continueWithAgent = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmittingToAgent(true)
    setFormError(null)
    try {
      const outcome = await onMerchantReply(caseData.caseId)
      onSaved(t(
        outcome === 'completed'
          ? 'detail.agentCompleted'
          : outcome === 'customer_input'
            ? 'detail.customerInputRequested'
            : 'detail.agentFollowUp',
      ))
    } catch {
      const message = t('detail.agentSubmitError')
      setFormError(message)
      onError(message)
    } finally {
      submittingRef.current = false
      setSubmittingToAgent(false)
    }
  }

  const choose = async (choice: MerchantResponse) => {
    if (submittingRef.current) return
    try {
      caseStore.recordMerchantResponse(caseData.caseId, choice)
      setFormError(null)
      onSaved(t('detail.choiceSaved'))
      await continueWithAgent()
    } catch {
      const message = t('detail.error')
      setFormError(message)
      onError(message)
    }
  }

  const sendMessage = async () => {
    const content = draft.trim()
    if (!content || submittingRef.current) return
    try {
      caseStore.appendMerchantConversation(caseData.caseId, 'merchant', content)
      setDraft('')
      setFormError(null)
      onSaved(t('detail.messageSaved'))
      await continueWithAgent()
    } catch {
      const message = t('detail.error')
      setFormError(message)
      onError(message)
    }
  }

  return (
    <section className="merchant-detail">
      {showBack && (
        <button type="button" className="merchant-detail__back" onClick={onBack}>
          <BackIcon />
          {t('detail.back')}
        </button>
      )}
      <div className="merchant-detail__heading">
        <span>{t(`issue.${caseData.issueType}`)}</span>
        <h2>#{caseData.orderId}</h2>
      </div>
      <dl className="merchant-facts">
        <div>
          <dt>{t('detail.orderId')}</dt>
          <dd>{caseData.orderId}</dd>
        </div>
        <div>
          <dt>{t('detail.orderedAt')}</dt>
          <dd>{formatWhen(order?.orderedAt, i18n.language)}</dd>
        </div>
      </dl>
      <h3>{t('detail.items')}</h3>
      <ul className="merchant-items">
        {(order?.items ?? []).map((item) => (
          <li key={item.itemId}>
            <span>{item.name}</span>
            <strong>{formatPrice(item.price, i18n.language)}</strong>
          </li>
        ))}
      </ul>
      {confirmation?.itemName && (
        <p className="merchant-claim-item"><span>{t('detail.item')}</span>{confirmation.itemName}</p>
      )}
      <h3>{t('detail.claim')}</h3>
      <p className="merchant-customer-summary" aria-live="polite">
        {claimSummary
          ?? (claimSummaryState === 'loading'
            ? t('detail.claimSummaryLoading')
            : caseData.customerClaim)}
      </p>
      {caseData.conversation.length > 0 && (
        <details className="merchant-customer-conversation">
          <summary>{t('detail.customerConversation')}</summary>
          <div className="merchant-customer-conversation__thread">
            {caseData.conversation.map((message, index) => (
              <article
                key={`${message.createdAt}-${message.role}-${index}`}
                className={`merchant-customer-conversation__message is-${message.role}`}
              >
                <strong>{t(message.role === 'customer' ? 'detail.customerName' : 'detail.agentName')}</strong>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
        </details>
      )}
      <h3>{t('detail.photos')}</h3>
      {photos.length === 0 ? (
        <p className="merchant-muted">{t('detail.noPhoto')}</p>
      ) : (
        <div className="merchant-evidence-row">
          {photos.map((url) => <EvidenceCard key={url} url={url} />)}
        </div>
      )}
      <h3>{t('detail.question')}</h3>
      <div className="merchant-chat">
        <div className="merchant-chat__messages" role="log" aria-live="polite">
          <p className="merchant-chat__message merchant-chat__message--agent">
            <small>{t('detail.agentName')}</small>
            {t('detail.opening')}
          </p>
          {timeline.map((message) => (
            <p
              key={`${message.kind}-${message.createdAt}-${message.role}-${message.content}`}
              className={[
                'merchant-chat__message',
                `merchant-chat__message--${message.role}`,
                message.kind === 'choice' && 'merchant-chat__message--choice',
              ].filter(Boolean).join(' ')}
            >
              <small>
                {message.kind === 'choice'
                  ? t('detail.choiceMessageLabel')
                  : t(message.role === 'agent' ? 'detail.agentName' : 'detail.merchantName')}
              </small>
              {message.content}
            </p>
          ))}
        </div>
        {waiting && confirmation?.status !== 'completed' ? (
          <form
            className="merchant-response merchant-response--chat"
            onSubmit={(event) => {
              event.preventDefault()
              void sendMessage()
            }}
          >
            <div
              className="merchant-response__choices"
              role="group"
              aria-label={t('detail.choiceLabel')}
            >
              {responses.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={selectedResponse === choice ? 'is-selected' : undefined}
                  title={responseLabel(choice)}
                  disabled={submittingToAgent}
                  onClick={() => { void choose(choice) }}
                >
                  {responseLabel(choice)}
                </button>
              ))}
            </div>
            <p className="merchant-choice-note">
              {t(selectedResponse ? 'detail.choiceReceived' : 'detail.choiceHint')}
            </p>
            <label className="merchant-chat__composer">
              {t(selectedResponse ? 'detail.correctionLabel' : 'detail.messageLabel')}
              <span className="merchant-chat__send">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter'
                      && !event.shiftKey
                      && !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault()
                      void sendMessage()
                    }
                  }}
                  disabled={submittingToAgent}
                  placeholder={t(
                    selectedResponse
                      ? `detail.responsePlaceholder.${caseData.issueType}.${selectedResponse}`
                      : 'detail.messagePlaceholder',
                    selectedResponse
                      ? {
                          defaultValue: t(
                            `detail.responsePlaceholder.default.${selectedResponse}`,
                          ),
                        }
                      : undefined,
                  )}
                />
                <button type="submit" className="merchant-submit" disabled={submittingToAgent || !draft.trim()}>
                  {t(submittingToAgent ? 'detail.submittingToAgent' : 'detail.send')}
                </button>
              </span>
            </label>
            {formError && <p className="merchant-form-error">{formError}</p>}
            <p className="merchant-follow-up">{t('detail.followUpNote')}</p>
          </form>
        ) : (
          <div className="merchant-response merchant-response--saved">
            <h3>{t('history.responded')}</h3>
            <p>{selectedResponse ? responseLabel(selectedResponse) : ''}</p>
            <h3>{t('history.status')}</h3>
            <p>{t(progressKey(caseData))}</p>
            <h3>{t('history.finalAction')}</h3>
            <p>
              {caseData.finalAction
                ? t(`finalAction.${caseData.finalAction}`)
                : t(pendingActionKey(caseData))}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
