import { useTranslation } from 'react-i18next'
import type { CustomerIssue } from '../../types/customer'
import { ChevronIcon, IssueMiniIcon } from './CustomerIcons'

const issueTypes: CustomerIssue[] = ['delay', 'missing', 'wrong']

export function IssueSelector({ selected, onSelect }: { selected: CustomerIssue | null; onSelect: (issue: CustomerIssue) => void }) {
  const { t } = useTranslation('customer')
  return (
    <section className="issue-selector">
      <div className="customer-section-title customer-section-title--stacked"><h2>{t('issues.sectionTitle')}</h2><p>{t('issues.description')}</p></div>
      <div className="issue-selector__grid">
        {issueTypes.map((issue) => (
          <button className={selected === issue ? 'is-selected' : ''} type="button" onClick={() => onSelect(issue)} key={issue}>
            <span><IssueMiniIcon type={issue} /></span>
            <strong>{t(`issues.${issue}.title`)}</strong>
            <ChevronIcon />
          </button>
        ))}
      </div>
    </section>
  )
}
