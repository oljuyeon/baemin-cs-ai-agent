import { useTranslation } from 'react-i18next'
import { findMerchant, type CsCase } from '../../features/cs'
import { isOverdueEscalation } from '../../features/csDesk/desk'
import type { EscalationSample } from '../../features/csDesk/sampleEscalation'

interface Props {
  cases: CsCase[]
  samples: EscalationSample[]
  waitingSampleIds: string[]
  selectedId: string | null
  now: number
  creating: boolean
  onSelect: (caseId: string) => void
  onCreateSample: (sampleId: string) => void
  onCreateAll: () => void
}

const formatWhen = (value: string, language: string) =>
  new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))

export function EscalationQueue({
  cases,
  samples,
  waitingSampleIds,
  selectedId,
  now,
  creating,
  onSelect,
  onCreateSample,
  onCreateAll,
}: Props) {
  const { t, i18n } = useTranslation('cs')
  const waiting = new Set(waitingSampleIds)
  return (
    <section className="cs-panel">
      <div className="cs-panel__title">
        <div>
          <h2>{t('queue.title')}</h2>
          <span>{t('queue.count', { count: cases.length })}</span>
        </div>
        <button
          className="cs-sample"
          type="button"
          disabled={creating || samples.every((sample) => waiting.has(sample.id))}
          onClick={onCreateAll}
        >
          {t('queue.sampleAll')}
        </button>
      </div>
      <div className="cs-samples">
        <span>{t('queue.sampleHint')}</span>
        {samples.map((sample) => {
          const isWaiting = waiting.has(sample.id)
          return (
            <button
              key={sample.id}
              type="button"
              disabled={creating || isWaiting}
              onClick={() => onCreateSample(sample.id)}
            >
              {t(`samples.${sample.id}`)}
              {isWaiting ? ` · ${t('queue.sampleWaiting')}` : ''}
            </button>
          )
        })}
      </div>
      {cases.length === 0 ? (
        <div className="cs-empty">
          <strong>{t('queue.emptyTitle')}</strong>
          <p>{t('queue.emptyBody')}</p>
        </div>
      ) : (
        <ul className="cs-list">
          {cases.map((caseData) => {
            const overdue = isOverdueEscalation(caseData, now)
            const store = findMerchant(caseData.storeId)
            return (
              <li key={caseData.caseId}>
                <button
                  type="button"
                  className={caseData.caseId === selectedId ? 'is-selected' : undefined}
                  onClick={() => onSelect(caseData.caseId)}
                >
                  <span>
                    <strong>#{caseData.orderId}</strong>
                    <small>{formatWhen(caseData.updatedAt, i18n.language)}</small>
                  </span>
                  <em>
                    {t(`issue.${caseData.issueType}`)}
                    {store ? ` · ${store.storeName}` : ''}
                    {overdue ? ` · ${t('queue.overdue')}` : ''}
                  </em>
                  <em>{caseData.customerClaim}</em>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
