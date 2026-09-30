import { useTranslation } from 'react-i18next'
import { IssueIcon } from '../common/icons'

const issues = ['delay', 'missing', 'wrong'] as const

export function IssueSection() {
  const { t } = useTranslation('main')
  return (
    <section className="section issue-section">
      <div className="shell issue-card">
        <div className="section-heading section-heading--center">
          <span className="eyebrow">{t('issues.eyebrow')}</span>
          <h2>{t('issues.title')}</h2>
        </div>
        <div className="issue-list">
          {issues.map((issue) => <div className="issue-item" key={issue}><IssueIcon type={issue}/><strong>{t(`issues.${issue}`)}</strong></div>)}
        </div>
        <p className="issue-card__note">{t('issues.note')}</p>
      </div>
    </section>
  )
}
