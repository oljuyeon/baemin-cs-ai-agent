import { useTranslation } from 'react-i18next'
import type { CsCase } from '../../features/cs'

const formatWhen = (value: string | undefined, language: string) => {
  if (!value) return ''
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function ResponseHistory({
  cases,
  selectedId,
  onSelect,
}: {
  cases: CsCase[]
  selectedId: string | null
  onSelect: (caseId: string) => void
}) {
  const { t, i18n } = useTranslation('merchant')
  return (
    <section className="merchant-panel">
      <div className="merchant-panel__title">
        <h2>{t('history.title')}</h2>
      </div>
      {cases.length === 0 ? (
        <div className="merchant-empty">
          <strong>{t('history.empty')}</strong>
        </div>
      ) : (
        <ul className="merchant-list">
          {cases.map((caseData) => {
            const confirmation = caseData.merchantConfirmation
            return (
              <li key={caseData.caseId}>
                <button
                  type="button"
                  className={caseData.caseId === selectedId ? 'is-selected' : undefined}
                  onClick={() => onSelect(caseData.caseId)}
                >
                  <span>
                    <strong>#{caseData.orderId}</strong>
                    <small>
                      {confirmation?.response
                        ? t(
                            `issueResponses.${caseData.issueType}.${confirmation.response}`,
                            { defaultValue: t(`responses.${confirmation.response}`) },
                          )
                        : ''}
                    </small>
                  </span>
                  <em>
                    {confirmation?.conversation?.at(-1)?.content
                      || confirmation?.comment
                      || t('history.noComment')}
                  </em>
                  <small>
                    {formatWhen(confirmation?.respondedAt, i18n.language)}
                    {' · '}
                    {t(`status.${caseData.status}`)}
                    {' · '}
                    {caseData.finalAction ? t(`finalAction.${caseData.finalAction}`) : t('history.noFinal')}
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
