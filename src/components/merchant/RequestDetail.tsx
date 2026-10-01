import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  agentTools,
  caseStore,
  type CsCase,
  type MerchantResponse,
  type OrderData,
} from '../../features/cs'
import { BackIcon } from '../customer/CustomerIcons'

const responses: MerchantResponse[] = [
  'ADMITTED_MISSING',
  'CLAIMS_PACKED',
  'POSSIBLE_MISSING',
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
}: {
  caseData: CsCase | null
  showBack: boolean
  onBack: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const { t, i18n } = useTranslation('merchant')
  const [order, setOrder] = useState<OrderData | null>(caseData?.order ?? null)
  const [draft, setDraft] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const caseId = caseData?.caseId
  const orderId = caseData?.orderId
  const storedOrder = caseData?.order

  useEffect(() => {
    setDraft('')
    setFormError(null)
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

  const choose = (choice: MerchantResponse) => {
    if (choice === selectedResponse) return
    try {
      caseStore.recordMerchantResponse(caseData.caseId, choice)
      setFormError(null)
      onSaved(t('detail.choiceSaved'))
    } catch {
      const message = t('detail.error')
      setFormError(message)
      onError(message)
    }
  }

  const sendMessage = () => {
    const content = draft.trim()
    if (!content) return
    try {
      caseStore.appendMerchantConversation(caseData.caseId, 'merchant', content)
      setDraft('')
      setFormError(null)
      onSaved(t('detail.messageSaved'))
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
      <blockquote>{caseData.customerClaim}</blockquote>
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
        <p className="merchant-chat__message merchant-chat__message--agent">
          <small>{t('detail.agentName')}</small>
          {t('detail.opening')}
        </p>
        {messages.map((message) => (
          <p
            key={`${message.createdAt}-${message.role}-${message.content}`}
            className={`merchant-chat__message merchant-chat__message--${message.role}`}
          >
            <small>{t(message.role === 'agent' ? 'detail.agentName' : 'detail.merchantName')}</small>
            {message.content}
          </p>
        ))}
      </div>
      {waiting && confirmation?.status !== 'completed' ? (
        <form
          className="merchant-response"
          onSubmit={(event) => {
            event.preventDefault()
            sendMessage()
          }}
        >
          <div className="merchant-response__choices">
            {responses.map((choice) => (
              <button
                key={choice}
                type="button"
                className={selectedResponse === choice ? 'is-selected' : undefined}
                aria-pressed={selectedResponse === choice}
                onClick={() => choose(choice)}
              >
                {t(`responses.${choice}`)}
              </button>
            ))}
          </div>
          <label className="merchant-chat__composer">
            {t('detail.messageLabel')}
            <span className="merchant-chat__send">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('detail.messagePlaceholder')}
              />
              <button type="submit" className="merchant-submit">{t('detail.send')}</button>
            </span>
          </label>
          {formError && <p className="merchant-form-error">{formError}</p>}
          <p className="merchant-follow-up">{t('detail.followUpNote')}</p>
        </form>
      ) : (
        <div className="merchant-response merchant-response--saved">
          <h3>{t('history.responded')}</h3>
          <p>{selectedResponse ? t(`responses.${selectedResponse}`) : ''}</p>
          <h3>{t('history.status')}</h3>
          <p>{t(`status.${caseData.status}`)}</p>
          <h3>{t('history.finalAction')}</h3>
          <p>{caseData.finalAction ? t(`finalAction.${caseData.finalAction}`) : t('history.noFinal')}</p>
        </div>
      )}
    </section>
  )
}
