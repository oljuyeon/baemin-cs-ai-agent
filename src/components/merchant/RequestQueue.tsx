import { useTranslation } from 'react-i18next'
import type { CsCase } from '../../features/cs'
import { isAwaitingMerchantReply, isOverdueRequest } from '../../features/merchant/desk'

const formatWhen = (value: string | undefined, language: string) => {
  if (!value) return ''
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function RequestQueue({
  cases,
  selectedId,
  now,
  onSelect,
}: {
  cases: CsCase[]
  selectedId: string | null
  now: number
  onSelect: (caseId: string) => void
}) {
  const { t, i18n } = useTranslation('merchant')
  return (
    <section className="merchant-panel">
      <div className="merchant-panel__title">
        <div>
          <h2>{t('queue.title')}</h2>
          <span>{t('queue.count', { count: cases.length })}</span>
        </div>
      </div>
      {cases.length === 0 ? (
        <div className="merchant-empty">
          <strong>{t('queue.empty')}</strong>
          <p>{t('queue.emptyHint')}</p>
        </div>
      ) : (
        <ul className="merchant-list">
          {cases.map((caseData) => {
            const overdue = isOverdueRequest(caseData, now)
            const answered = !isAwaitingMerchantReply(caseData)
            return (
              <li key={caseData.caseId}>
                <button
                  type="button"
                  className={[
                    caseData.caseId === selectedId && 'is-selected',
                    overdue && 'is-overdue',
                  ].filter(Boolean).join(' ') || undefined}
                  onClick={() => onSelect(caseData.caseId)}
                >
                  <span>
                    <strong>#{caseData.orderId}</strong>
                    <small>{t(`issue.${caseData.issueType}`)}</small>
                  </span>
                  <em>{caseData.customerClaim}</em>
                  <small>
                    {formatWhen(caseData.merchantConfirmation?.requestedAt, i18n.language)}
                    {answered ? ` · ${t('queue.responseReceived')}` : ''}
                    {overdue && (
                      <>
                        {' · '}
                        <b className="merchant-list__overdue">{t('queue.overdue')}</b>
                      </>
                    )}
                  </small>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
