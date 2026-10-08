import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  agentTools,
  caseStore,
  findCustomer,
  findMerchant,
  type CsCase,
  type DeliveryData,
  type HumanCsAction,
  type OrderData,
} from '../../features/cs'
import {
  getHumanHandoffSourceFingerprint,
  summarizeHumanHandoffWithOpenAI,
} from '../../features/agent'
import { CS_AGENT_ID } from '../../features/csDesk/desk'
import { BackIcon } from '../customer/CustomerIcons'
import { AgentReviewTrace, HumanReviewGuidanceCard } from './AgentReviewTrace'

type ConversationEntry = {
  role: 'customer' | 'merchant' | 'agent'
  content: string
  createdAt: string
}

const actions: HumanCsAction[] = [
  'request_more_info',
  'request_additional_confirmation',
]

interface Props {
  caseData: CsCase | null
  showBack: boolean
  onBack: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}

const formatMoney = (amount: number, language: string) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(amount)

const formatWhen = (value: string, language: string) =>
  new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))

const formatTime = (value: string, language: string) =>
  new Intl.DateTimeFormat(language, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))

function EvidenceCard({ url, caption }: { url: string; caption?: string }) {
  const { t } = useTranslation('cs')
  const isMock = url.startsWith('mock://')
  return (
    <figure className={isMock ? 'cs-evidence cs-evidence--mock' : 'cs-evidence'}>
      {isMock ? <span aria-hidden="true" /> : <img src={url} alt="" />}
      <figcaption>
        <strong>{isMock ? t('detail.photoMock') : t('detail.photo')}</strong>
        <small>{caption || url}</small>
      </figcaption>
    </figure>
  )
}

function ConversationToggle({
  messages,
  toggleLabel,
  participantLabel,
}: {
  messages: ConversationEntry[]
  toggleLabel: string
  participantLabel: string
}) {
  const { t, i18n } = useTranslation('cs')
  if (messages.length === 0) return null

  return (
    <details className="cs-conversation">
      <summary>{toggleLabel}</summary>
      <div className="cs-conversation__thread">
        {messages.map((message) => {
          const isAgent = message.role === 'agent'
          return (
            <article
              key={`${message.createdAt}-${message.role}-${message.content}`}
              className={`cs-conversation__bubble ${isAgent ? 'is-agent' : 'is-participant'}`}
            >
              <header>
                <strong>{isAgent ? t('detail.agentName') : participantLabel}</strong>
                <time dateTime={message.createdAt}>{formatWhen(message.createdAt, i18n.language)}</time>
              </header>
              <p>{message.content}</p>
            </article>
          )
        })}
      </div>
    </details>
  )
}

export function EscalationDetail({ caseData, showBack, onBack, onSaved, onError }: Props) {
  const { t, i18n } = useTranslation('cs')
  const [action, setAction] = useState<HumanCsAction | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<OrderData | null>(null)
  const [delivery, setDelivery] = useState<DeliveryData | null>(null)
  const [summaryState, setSummaryState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const caseId = caseData?.caseId
  const updatedAt = caseData?.updatedAt

  useEffect(() => {
    setAction(null)
    setComment('')
    setError(null)
    setSummaryState('idle')
  }, [caseId])

  useEffect(() => {
    if (!caseData) {
      setOrder(null)
      return
    }
    let cancelled = false
    const current = caseData
    void (async () => {
      if (current.order) setOrder(current.order)
      else {
        const result = await agentTools.getOrder({ orderId: current.orderId })
        if (!cancelled && result.status === 'success') setOrder(result.data)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [caseId, updatedAt, caseData])

  useEffect(() => {
    if (!caseData) {
      setDelivery(null)
      return
    }
    if (caseData.delivery) {
      setDelivery(caseData.delivery)
      return
    }

    let cancelled = false
    setDelivery(null)
    void agentTools.getDelivery({ orderId: caseData.orderId }).then((result) => {
      if (!cancelled && result.status === 'success') setDelivery(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [caseId, updatedAt, caseData])

  useEffect(() => {
    if (!caseData || (caseData.status !== 'ESCALATED' && caseData.status !== 'CLOSED')) return

    const language = i18n.resolvedLanguage || i18n.language || 'ko'
    const sourceFingerprint = getHumanHandoffSourceFingerprint(caseData)
    const stored = caseData.humanHandoffSummary
    if (stored?.sourceFingerprint === sourceFingerprint && stored.language === language) {
      setSummaryState('ready')
      return
    }

    let cancelled = false
    setSummaryState('loading')
    void summarizeHumanHandoffWithOpenAI(caseData, language)
      .then((summary) => {
        if (cancelled) return
        caseStore.updateCase(caseData.caseId, { humanHandoffSummary: summary })
        setSummaryState('ready')
      })
      .catch((summaryError) => {
        if (cancelled) return
        console.warn('Human CS 인수인계 요약을 생성하지 못했습니다.', summaryError)
        setSummaryState('error')
      })

    return () => {
      cancelled = true
    }
  }, [caseId, updatedAt, caseData, i18n.language, i18n.resolvedLanguage])

  if (!caseData) {
    return (
      <section className="cs-detail cs-detail--empty">
        <h2>{t('detail.emptyTitle')}</h2>
        <p>{t('detail.emptyBody')}</p>
      </section>
    )
  }

  const store = findMerchant(caseData.storeId)
  const customer = findCustomer(caseData.customerId)
  const resolution = caseData.humanCsResolution
  const merchant = caseData.merchantConfirmation
  const summaryLanguage = i18n.resolvedLanguage || i18n.language || 'ko'
  const summaryFingerprint = getHumanHandoffSourceFingerprint(caseData)
  const handoffSummary = caseData.humanHandoffSummary?.sourceFingerprint === summaryFingerprint
    && caseData.humanHandoffSummary.language === summaryLanguage
    ? caseData.humanHandoffSummary
    : undefined
  const summaryFallback = summaryState === 'error'
    ? t('detail.summaryUnavailable')
    : t('detail.summaryGenerating')

  const submit = () => {
    if (!action) {
      setError(t('detail.needAction'))
      return
    }
    try {
      caseStore.recordHumanCsResolution(caseData.caseId, action, CS_AGENT_ID, comment.trim() || undefined)
      onSaved(t('alerts.saved'))
    } catch {
      onError(t('alerts.saveFailed'))
    }
  }

  return (
    <section className="cs-detail">
      {showBack && (
        <button className="cs-detail__back" type="button" onClick={onBack}>
          <BackIcon />
          {t('detail.back')}
        </button>
      )}
      <div className="cs-detail__heading">
        <div>
          <h2>#{caseData.orderId}</h2>
          <p className="cs-muted">{t(`issue.${caseData.issueType}`)} · {t(`status.${caseData.status}`)}</p>
        </div>
        <span className="cs-customer-name">
          {customer?.name ?? caseData.customerId}
          {caseData.riskFlags.includes('frequent_refund') && (
            <i className="cs-red-flag" title={t('risk.frequent_refund')} aria-label={t('risk.frequent_refund')}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 3v18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M6 4h12l-3.2 4L18 12H6" fill="currentColor" />
              </svg>
            </i>
          )}
        </span>
      </div>

      <dl className="cs-facts">
        <div>
          <dt>{t('detail.store')}</dt>
          <dd>{store ? `${store.storeName} · ${store.storeId}` : caseData.storeId}</dd>
        </div>
        <div>
          <dt>{t('detail.total')}</dt>
          <dd>{order ? formatMoney(order.totalAmount, i18n.language) : t('detail.loading')}</dd>
        </div>
        <div>
          <dt>{t('detail.delivery')}</dt>
          <dd className="cs-status-value">
            <span>
              {delivery
                ? t(`orderStatus.${delivery.deliveryStatus}`, { defaultValue: delivery.deliveryStatus })
                : t('detail.noDelivery')}
            </span>
            {delivery?.deliveryStatus === 'delivered' && delivery.deliveredAt && (
              <small>{t('detail.deliveredAt', { time: formatTime(delivery.deliveredAt, i18n.language) })}</small>
            )}
            {delivery?.deliveryStatus !== 'delivered' && delivery?.pickedUpAt && (
              <small>{t('detail.pickedUpAt', { time: formatTime(delivery.pickedUpAt, i18n.language) })}</small>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('detail.orderStatus')}</dt>
          <dd className="cs-status-value">
            <span>
              {order
                ? t(`orderStatus.${order.orderStatus}`, { defaultValue: order.orderStatus })
                : t('detail.loading')}
            </span>
            {order?.orderStatus === 'delivering' && delivery?.expectedAt && (
              <small>
                {t('detail.expectedAt', { time: formatTime(delivery.expectedAt, i18n.language) })}
                {delivery.delayMinutes > 0 && (
                  <span className="cs-status-delay">
                    {t('detail.overdueBy', { minutes: delivery.delayMinutes })}
                  </span>
                )}
              </small>
            )}
          </dd>
        </div>
        <div className="cs-facts__customer">
          <dt>{t('detail.customer')}</dt>
          <dd>
            {customer ? (
              <>
                <span className="cs-customer-refund">
                  {t('detail.refunds30d')}
                  <strong>{t('detail.refundCount', { count: customer.refundCount30d })}</strong>
                </span>
                <span className="cs-customer-orders">
                  {t('detail.recentOrders', { count: customer.recentOrderCount })}
                </span>
              </>
            ) : caseData.customerId}
          </dd>
        </div>
      </dl>

      <h3>{t('detail.claim')}</h3>
      <blockquote>{handoffSummary?.customerClaimSummary || summaryFallback}</blockquote>
      <ConversationToggle
        messages={caseData.conversation}
        participantLabel={t('detail.customerName')}
        toggleLabel={t('detail.customerConversation', { count: caseData.conversation.length })}
      />
      {caseData.claimedItemName && (
        <p className="cs-claim-item"><span>{t('detail.item')}</span>{caseData.claimedItemName}</p>
      )}

      {order && (
        <>
          <h3>{t('detail.order')}</h3>
          <ul className="cs-items">
            {order.items.map((item) => (
              <li key={item.itemId}>
                <span>{item.name}</span>
                <span>{formatMoney(item.price, i18n.language)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {caseData.evidenceUrls.length > 0 && (
        <>
          <h3>{t('detail.evidence')}</h3>
          <div className="cs-evidence-row">
            {caseData.evidenceUrls.map((url) => {
              const analysis = caseData.evidenceAnalysis?.find((item) => item.evidenceUrl === url)
              return <EvidenceCard key={url} url={url} caption={analysis?.observation} />
            })}
          </div>
        </>
      )}

      <h3>{t('detail.merchant')}</h3>
      <blockquote>{handoffSummary?.merchantResponseSummary || summaryFallback}</blockquote>
      <ConversationToggle
        messages={merchant?.conversation ?? []}
        participantLabel={t('detail.merchantName')}
        toggleLabel={t('detail.merchantConversation', { count: merchant?.conversation.length ?? 0 })}
      />

      <h3>{t('detail.handoff')}</h3>
      <blockquote>{handoffSummary?.escalationReasonSummary || summaryFallback}</blockquote>

      <HumanReviewGuidanceCard
        guidance={handoffSummary?.reviewGuidance}
        isLoading={summaryState === 'idle' || summaryState === 'loading'}
        hasError={summaryState === 'error'}
      />

      <Link className="cs-policy-link" to={`/cs/cases/${caseData.caseId}/policy`}>{t('detail.openPolicy')}</Link>

      <AgentReviewTrace caseData={caseData} />

      {resolution ? (
        <div className="cs-response cs-response--saved">
          <h3>{t('detail.resolution')}</h3>
          <p>{t(`actions.${resolution.action}`)}</p>
          <p>{resolution.comment || t('history.noComment')}</p>
          <p className="cs-muted">
            {resolution.handledBy} · {formatWhen(resolution.handledAt, i18n.language)}
            {caseData.finalAction ? ` · ${t(`finalAction.${caseData.finalAction}`)}` : ''}
          </p>
          <p className="cs-muted">{t('detail.mockNote')}</p>
        </div>
      ) : (
        <div className="cs-response">
          <h3>{t('detail.decide')}</h3>
          <p className="cs-muted">{t('detail.mockNote')}</p>
          <div className="cs-response__choices">
            {actions.map((item) => (
              <button
                key={item}
                type="button"
                className={action === item ? 'is-selected' : undefined}
                onClick={() => {
                  setAction(item)
                  setError(null)
                }}
              >
                {t(`actions.${item}`)}
              </button>
            ))}
          </div>
          <label>
            {t('detail.comment')}
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} />
          </label>
          {error && <p className="cs-form-error">{error}</p>}
          <button className="cs-submit" type="button" onClick={submit}>{t('detail.submit')}</button>
        </div>
      )}
    </section>
  )
}
