import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  agentTools,
  caseStore,
  findCustomer,
  findMerchant,
  type CsCase,
  type HumanCsAction,
  type OrderData,
  type PolicyResult,
} from '../../features/cs'
import { CS_AGENT_ID } from '../../features/csDesk/desk'
import { BackIcon } from '../customer/CustomerIcons'

const actions: HumanCsAction[] = [
  'approve_refund',
  'reject_refund',
  'approve_redelivery',
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
  new Intl.NumberFormat(language, { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount)

const formatWhen = (value: string, language: string) =>
  new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
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

export function EscalationDetail({ caseData, showBack, onBack, onSaved, onError }: Props) {
  const { t, i18n } = useTranslation('cs')
  const [action, setAction] = useState<HumanCsAction | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<OrderData | null>(null)
  const [policy, setPolicy] = useState<PolicyResult | null>(null)
  const caseId = caseData?.caseId
  const updatedAt = caseData?.updatedAt

  useEffect(() => {
    setAction(null)
    setComment('')
    setError(null)
  }, [caseId])

  useEffect(() => {
    if (!caseData) {
      setOrder(null)
      setPolicy(null)
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
      const policyResult = await agentTools.getPolicy({ caseData: current })
      if (!cancelled && policyResult.status === 'success') setPolicy(policyResult.data)
    })()
    return () => {
      cancelled = true
    }
  }, [caseId, updatedAt, caseData])

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
        <span>{customer?.name ?? caseData.customerId}</span>
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
          <dt>{t('detail.customer')}</dt>
          <dd>
            {customer
              ? t('detail.customerMeta', { orders: customer.recentOrderCount, refunds: customer.refundCount30d })
              : caseData.customerId}
          </dd>
        </div>
        <div>
          <dt>{t('detail.delivery')}</dt>
          <dd>
            {caseData.delivery
              ? t('detail.delay', { minutes: caseData.delivery.delayMinutes })
              : t('detail.noDelivery')}
          </dd>
        </div>
      </dl>

      <h3>{t('detail.claim')}</h3>
      <blockquote>{caseData.customerClaim}</blockquote>
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
      {merchant?.response ? (
        <blockquote>
          {t(`merchantResponse.${merchant.response}`)}
          {merchant.comment ? ` — ${merchant.comment}` : ''}
        </blockquote>
      ) : (
        <p className="cs-muted">{t('merchantResponse.none')}</p>
      )}

      <h3>{t('detail.handoff')}</h3>
      <blockquote>{caseData.escalationReason || t('detail.noReason')}</blockquote>
      {caseData.agentSummary && <p className="cs-muted">{caseData.agentSummary}</p>}
      <p className="cs-muted">
        {t('detail.policy')} {caseData.appliedPolicy ? t(`policy.${caseData.appliedPolicy}`, { defaultValue: caseData.appliedPolicy }) : t('detail.none')}
        {policy?.reason ? ` — ${policy.reason}` : ''}
      </p>
      <div className="cs-samples">
        {caseData.riskFlags.length === 0
          ? <span>{t('detail.noRisk')}</span>
          : caseData.riskFlags.map((flag) => <button key={flag} type="button" disabled>{t(`risk.${flag}`)}</button>)}
      </div>

      {caseData.toolHistory.length > 0 && (
        <details className="cs-trace">
          <summary>{t('detail.trace', { count: caseData.toolHistory.length })}</summary>
          <ul>
            {caseData.toolHistory.map((log) => (
              <li key={log.id}>{log.toolName} · {log.result.status === 'success' ? t('detail.traceOk') : t('detail.traceError')}</li>
            ))}
          </ul>
        </details>
      )}

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
