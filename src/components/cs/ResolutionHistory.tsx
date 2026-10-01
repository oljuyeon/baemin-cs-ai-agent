import { useTranslation } from 'react-i18next'
import type { CsCase } from '../../features/cs'

interface Props {
  cases: CsCase[]
  selectedId: string | null
  onSelect: (caseId: string) => void
}

const formatWhen = (value: string, language: string) =>
  new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))

export function ResolutionHistory({ cases, selectedId, onSelect }: Props) {
  const { t, i18n } = useTranslation('cs')
  return (
    <section className="cs-panel">
      <div className="cs-panel__title">
        <div>
          <h2>{t('history.title')}</h2>
          <span>{t('queue.count', { count: cases.length })}</span>
        </div>
      </div>
      {cases.length === 0 ? (
        <div className="cs-empty">
          <strong>{t('history.emptyTitle')}</strong>
          <p>{t('history.emptyBody')}</p>
        </div>
      ) : (
        <ul className="cs-list">
          {cases.map((caseData) => {
            const resolution = caseData.humanCsResolution
            return (
              <li key={caseData.caseId}>
                <button
                  type="button"
                  className={caseData.caseId === selectedId ? 'is-selected' : undefined}
                  onClick={() => onSelect(caseData.caseId)}
                >
                  <span>
                    <strong>#{caseData.orderId}</strong>
                    <small>{resolution ? formatWhen(resolution.handledAt, i18n.language) : ''}</small>
                  </span>
                  <em>{resolution ? t(`actions.${resolution.action}`) : t('history.closed')}</em>
                  <em>{resolution?.comment || t('history.noComment')}</em>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
