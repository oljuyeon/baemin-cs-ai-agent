import { useTranslation } from 'react-i18next'
import { CheckIcon, SparkIcon } from '../common/icons'

const steps = ['inquiry', 'data', 'policy', 'result'] as const

export function ProcessSection() {
  const { t } = useTranslation('main')
  return (
    <section className="section process-section">
      <div className="shell process-layout">
        <div className="process-card" aria-hidden="true">
          <div className="process-card__agent"><SparkIcon /><span>{t('process.agentLabel')}</span></div>
          <div className="process-card__steps">
            {steps.map((step, index) => (
              <div className="process-step" key={step}>
                <span className={index === steps.length - 1 ? 'is-active' : ''}><CheckIcon /></span>
                <strong>{t(`process.steps.${step}`)}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="section-heading process-section__heading">
          <span className="eyebrow">{t('process.eyebrow')}</span>
          <h2>{t('process.title')}</h2>
          <div className="process-badge"><CheckIcon />{t('process.badge')}</div>
        </div>
      </div>
    </section>
  )
}
