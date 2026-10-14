import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  agentTools,
  caseStore,
  findCustomer,
  findMerchant,
  isMerchantTimeoutEscalation,
  resolvePersistedEvidenceUrl,
  type CsCase,
  type DeliveryData,
  type HumanCsAction,
  type HumanHandoffSummary,
  type OrderData,
} from '../../features/cs'
import {
  executeTool,
  getHumanHandoffSourceFingerprint,
  summarizeHumanHandoffWithOpenAI,
} from '../../features/agent'
import { CS_AGENT_ID } from '../../features/csDesk/desk'
import { BackIcon } from '../customer/CustomerIcons'
import { AgentReviewTrace, HumanReviewGuidanceCard } from './AgentReviewTrace'

type ConversationEntry = {
  role: 'customer' | 'merchant' | 'agent' | 'human_cs'
  content: string
  createdAt: string
}

const merchantTimeoutActions: HumanCsAction[] = [
  'approve_refund',
  'reject_refund',
]

const resolutionActionsForCase = (caseData: CsCase): HumanCsAction[] => {
  if (caseData.issueType === 'missing_item' || caseData.issueType === 'wrong_delivery') {
    return [
      'approve_refund',
      'approve_redelivery',
      'reject_refund',
      'request_additional_confirmation',
    ]
  }

  if (caseData.issueType === 'delivery_delay') {
    return [
      'approve_refund',
      'reject_refund',
      'request_additional_confirmation',
    ]
  }

  return [
    'reject_refund',
    'request_additional_confirmation',
  ]
}

interface Props {
  caseData: CsCase | null
  showBack: boolean
  onBack: () => void
  onSaved: (message: string, destination?: 'queue' | 'history') => void
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

const sourceFallbackSummary = (
  caseData: CsCase,
  language: string,
): Pick<HumanHandoffSummary, 'customerClaimSummary' | 'merchantResponseSummary' | 'escalationReasonSummary' | 'reviewGuidance'> => {
  const isEnglish = language.startsWith('en')
  const itemNames = caseData.order?.items.map((item) => item.name).join(', ')
  const merchantMessages = caseData.merchantConfirmation?.conversation
    .filter((message) => message.role === 'merchant') ?? []
  const merchantStatement = caseData.merchantConfirmation?.comment
    || merchantMessages.at(-1)?.content
  const frequentRefund = caseData.riskFlags.includes('frequent_refund')
  const merchantConflict = caseData.merchantConfirmation?.response === 'DENIED'
  const merchantTimeout = isMerchantTimeoutEscalation(caseData)

  if (isEnglish) {
    return {
      customerClaimSummary: `The customer states that ${caseData.customerClaim}${itemNames ? ` The confirmed order contains ${itemNames}.` : ''}`,
      merchantResponseSummary: merchantStatement
        ? `The store states that ${merchantStatement}`
        : 'The store has not provided a confirmation yet.',
      escalationReasonSummary: merchantTimeout
        ? 'The store did not respond within the confirmation window, so automated processing stopped and the case was handed to a support agent.'
        : frequentRefund
          ? 'Automatic refund and redelivery are restricted due to the recent repeat-refund history, so the case was handed to a support agent.'
          : merchantConflict
            ? 'The customer and store statements do not agree, so automated processing stopped and the case was handed to a support agent.'
            : `${caseData.escalationReason || 'The available information was not sufficient for automated processing'}, so the case was handed to a support agent.`,
      reviewGuidance: {
        caution: frequentRefund
          ? 'Automatic refund and redelivery are restricted because the recent repeat-refund threshold was exceeded. This alone does not establish customer misconduct.'
          : merchantConflict
            ? 'The customer and store statements conflict; neither statement has been treated as a confirmed fact.'
            : 'Unverified statements and system-confirmed information must remain separate.',
        verification: merchantStatement
          ? 'Review the customer statement, the store response, and any available evidence for unresolved differences.'
          : 'The store has not confirmed the packing and handoff details yet.',
        nextAction: 'Decide the appropriate refund, redelivery, or additional verification only after the unresolved facts are checked.',
      },
    }
  }

  return {
    customerClaimSummary: `고객은 “${caseData.customerClaim}”라고 주장하고 있습니다.${itemNames ? ` 확인된 주문 내역에는 ${itemNames}이(가) 포함되어 있습니다.` : ''}`,
    merchantResponseSummary: merchantStatement
      ? `매장은 “${merchantStatement}”라고 답변했습니다.`
      : '아직 매장 확인이 이루어지지 않았습니다.',
    escalationReasonSummary: merchantTimeout
      ? '매장 확인 기한 내에 답변이 없어 자동 처리를 종료하고 상담원에게 이관되었습니다.'
      : frequentRefund
        ? '최근 30일 기준을 초과한 반복 환불 이력으로 자동 환불과 재배달이 제한되어 상담원에게 이관되었습니다.'
        : merchantConflict
          ? '고객과 매장의 진술이 일치하지 않아 자동 처리를 종료하고 상담원에게 이관되었습니다.'
          : `${caseData.escalationReason || '현재 정보만으로 자동 처리하기 어려워'} 상담원에게 이관되었습니다.`,
    reviewGuidance: {
      caution: frequentRefund
        ? '최근 30일 기준을 초과한 반복 환불 이력으로 자동 환불과 재배달이 제한됩니다. 이 이력만으로 고객의 부정행위를 단정할 수는 없습니다.'
        : merchantConflict
          ? '고객과 매장의 진술이 충돌하며, 어느 한쪽도 확인된 사실로 처리되지 않았습니다.'
          : '확인되지 않은 진술과 시스템으로 확인된 정보를 구분해야 합니다.',
      verification: merchantStatement
        ? '고객 주장, 매장 답변, 제공된 증빙 사이의 남은 차이를 확인해야 합니다.'
        : '매장의 포장·전달 내용은 아직 확인되지 않았습니다.',
      nextAction: '남은 사실관계를 확인한 후 환불, 재배달 또는 추가 확인 여부를 결정해 주세요.',
    },
  }
}

function EvidenceCard({ url, caption }: { url: string; caption?: string }) {
  const { t } = useTranslation('cs')
  const [resolvedUrl, setResolvedUrl] = useState(url)
  useEffect(() => {
    let cancelled = false
    void resolvePersistedEvidenceUrl(url).then((value) => {
      if (!cancelled) setResolvedUrl(value)
    })
    return () => { cancelled = true }
  }, [url])
  const displayable = /^(https?:|blob:|data:)/.test(resolvedUrl)
  return (
    <figure className={displayable ? 'cs-evidence' : 'cs-evidence cs-evidence--mock'}>
      {displayable ? <img src={resolvedUrl} alt="" /> : <span aria-hidden="true" />}
      <figcaption>
        <strong>{displayable ? t('detail.photo') : t('detail.photoMock')}</strong>
        <small>{caption || (resolvedUrl.startsWith('saved-image://')
          ? t('detail.photoReloadUnavailable')
          : resolvedUrl)}</small>
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
          const isAgent = message.role === 'agent' || message.role === 'human_cs'
          return (
            <article
              key={`${message.createdAt}-${message.role}-${message.content}`}
              className={`cs-conversation__bubble ${isAgent ? 'is-agent' : 'is-participant'}`}
            >
              <header>
                <strong>{message.role === 'human_cs'
                  ? t('detail.humanCsName')
                  : isAgent
                    ? t('detail.agentName')
                    : participantLabel}</strong>
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
  const [summaryRetry, setSummaryRetry] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const caseId = caseData?.caseId
  const updatedAt = caseData?.updatedAt

  useEffect(() => {
    setAction(null)
    setComment('')
    setError(null)
    setIsSubmitting(false)
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
  }, [caseId, updatedAt, caseData, i18n.language, i18n.resolvedLanguage, summaryRetry])

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
  const merchantTimedOut = isMerchantTimeoutEscalation(caseData)
  const availableActions = merchantTimedOut
    ? merchantTimeoutActions
    : resolutionActionsForCase(caseData)
  const summaryLanguage = i18n.resolvedLanguage || i18n.language || 'ko'
  const summaryFingerprint = getHumanHandoffSourceFingerprint(caseData)
  const handoffSummary = caseData.humanHandoffSummary?.sourceFingerprint === summaryFingerprint
    && caseData.humanHandoffSummary.language === summaryLanguage
    ? caseData.humanHandoffSummary
    : undefined
  const fallbackSummary = sourceFallbackSummary(caseData, summaryLanguage)
  const summaryFallback = summaryState === 'error' ? fallbackSummary : undefined
  const summaryLoading = t('detail.summaryGenerating')

  const submit = async () => {
    if (!action) {
      setError(t('detail.needAction'))
      return
    }
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      if (action === 'approve_refund') {
        const targetOrder = caseData.order ?? order
        const item = targetOrder?.items.find(
          (candidate) => candidate.name === caseData.claimedItemName,
        )
        const amount = caseData.issueType === 'missing_item'
          ? item?.price
          : targetOrder?.totalAmount
        if (!amount) throw new Error(t('detail.refundAmountMissing'))

        const updated = await executeTool(caseData.caseId, {
          type: 'CALL_TOOL',
          toolName: 'refund',
          input: {
            caseId: caseData.caseId,
            orderId: caseData.orderId,
            itemName: item?.name,
            amount,
          },
        })
        if (updated.finalActionResult?.action !== 'mock_refund') {
          throw new Error(t('detail.refundFailed'))
        }
      }

      if (action === 'approve_redelivery') {
        const updated = await executeTool(caseData.caseId, {
          type: 'CALL_TOOL',
          toolName: 'redelivery',
          input: {
            caseId: caseData.caseId,
            orderId: caseData.orderId,
          },
        })
        if (updated.finalActionResult?.action !== 'mock_redelivery') {
          throw new Error(t('detail.redeliveryFailed'))
        }
      }

      caseStore.recordHumanCsResolution(caseData.caseId, action, CS_AGENT_ID, comment.trim() || undefined)
      onSaved(
        action === 'request_additional_confirmation'
          ? t('alerts.merchantRequested')
          : t('alerts.saved'),
        action === 'request_additional_confirmation' ? 'queue' : 'history',
      )
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('alerts.saveFailed'))
      onError(t('alerts.saveFailed'))
    } finally {
      setIsSubmitting(false)
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
      {summaryState === 'error' && (
        <div className="cs-summary-alert" role="status">
          <span>{t('detail.summaryFallbackNotice')}</span>
          <button type="button" onClick={() => setSummaryRetry((value) => value + 1)}>
            {t('detail.summaryRetry')}
          </button>
        </div>
      )}
      <blockquote>{handoffSummary?.customerClaimSummary || summaryFallback?.customerClaimSummary || summaryLoading}</blockquote>
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
            {caseData.evidenceUrls.map((url) => (
              <article className="cs-evidence-case" key={url}>
                <EvidenceCard url={url} />
              </article>
            ))}
          </div>
        </>
      )}

      <h3>{t('detail.merchant')}</h3>
      <blockquote>{handoffSummary?.merchantResponseSummary || summaryFallback?.merchantResponseSummary || summaryLoading}</blockquote>
      <ConversationToggle
        messages={merchant?.conversation ?? []}
        participantLabel={t('detail.merchantName')}
        toggleLabel={t('detail.merchantConversation', { count: merchant?.conversation.length ?? 0 })}
      />

      <h3>{t('detail.handoff')}</h3>
      <blockquote>{handoffSummary?.escalationReasonSummary || summaryFallback?.escalationReasonSummary || summaryLoading}</blockquote>

      <HumanReviewGuidanceCard
        guidance={handoffSummary?.reviewGuidance || summaryFallback?.reviewGuidance}
        isLoading={summaryState === 'idle' || summaryState === 'loading'}
        hasError={false}
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
          <p className="cs-muted">{t('detail.completionNote')}</p>
        </div>
      ) : (
        <div className="cs-response">
          <h3>{t('detail.decide')}</h3>
          <p className="cs-muted">
            {merchantTimedOut ? t('detail.timeoutDecisionNote') : t('detail.mockNote')}
          </p>
          <div className="cs-response__choices">
            {availableActions.map((item) => (
              <button
                key={item}
                type="button"
                className={action === item ? 'is-selected' : undefined}
                onClick={() => {
                  setAction(item)
                  setError(null)
                }}
              >
                {merchantTimedOut
                  ? t(`actions.timeout_${item}`, { defaultValue: t(`actions.${item}`) })
                  : t(`actions.${item}`)}
              </button>
            ))}
          </div>
          <label>
            {t('detail.comment')}
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} />
          </label>
          {error && <p className="cs-form-error">{error}</p>}
          <button className="cs-submit" type="button" onClick={submit} disabled={isSubmitting}>
            {isSubmitting ? t('detail.submitting') : t('detail.submit')}
          </button>
        </div>
      )}
    </section>
  )
}
