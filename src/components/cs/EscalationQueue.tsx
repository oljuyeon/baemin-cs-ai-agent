import { useTranslation } from 'react-i18next'
import { findMerchant, type CsCase } from '../../features/cs'
import { isCsInProgress, isOverdueEscalation } from '../../features/csDesk/desk'
import { queueTagForCase, type EscalationSample } from '../../features/csDesk/sampleEscalation'

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
  const pendingSamples = samples.filter((sample) => !waiting.has(sample.id))
  return (
    <section className="cs-panel">
      <div className="cs-panel__title">
        <div>
          <h2>{t('queue.title')}</h2>
          <span>{t('queue.count', { count: cases.length })}</span>
        </div>
        {pendingSamples.length > 0 && (
          <button
            className="cs-sample"
            type="button"
            disabled={creating}
            onClick={onCreateAll}
          >
            {t('queue.sampleAll')}
          </button>
        )}
      </div>
      {pendingSamples.length > 0 && (
        <div className="cs-samples">
          <span>{t('queue.sampleHint')}</span>
          {pendingSamples.map((sample) => (
            <button
              key={sample.id}
              type="button"
              disabled={creating}
              onClick={() => onCreateSample(sample.id)}
            >
              {t(`samples.${sample.id}`)}
            </button>
          ))}
        </div>
      )}
      {cases.length === 0 ? (
        <div className="cs-empty">
          <strong>{t('queue.emptyTitle')}</strong>
          <p>{t('queue.emptyBody')}</p>
        </div>
      ) : (
        <ul className="cs-list">
          {cases.map((caseData) => {
            const inProgress = isCsInProgress(caseData.caseId)
            const overdue = !inProgress && isOverdueEscalation(caseData, now)
            const store = findMerchant(caseData.storeId)
            const tag = queueTagForCase(caseData)
            return (
              <li key={caseData.caseId}>
                <button
                  type="button"
                  className={['cs-queue-item', caseData.caseId === selectedId && 'is-selected', overdue && 'is-overdue'].filter(Boolean).join(' ')}
                  onClick={() => onSelect(caseData.caseId)}
                >
                  <span className="cs-list__main">
                    <strong>#{caseData.orderId}</strong>
                    <em>
                      {t(`issue.${caseData.issueType}`)}
                      {store ? ` · ${store.storeName}` : ''}
                      {inProgress && <> · <b className="cs-queue-state cs-queue-state--progress">{t('queue.inProgress')}</b></>}
                      {overdue && <> · <b className="cs-queue-state cs-queue-state--overdue">{t('queue.overdue')}</b></>}
                    </em>
                    <em>{caseData.customerClaim}</em>
                  </span>
                  <span className="cs-list__side">
                    <small>{formatWhen(caseData.updatedAt, i18n.language)}</small>
                    {tag && <b className="cs-queue-tag">{t(`queueTag.${tag}`)}</b>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
