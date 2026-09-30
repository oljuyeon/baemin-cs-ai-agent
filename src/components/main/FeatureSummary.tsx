import { useTranslation } from 'react-i18next'

const featureKeys = ['understand', 'check', 'resolve'] as const

export function FeatureSummary() {
  const { t } = useTranslation('main')
  return (
    <section className="section feature-section" id="service">
      <div className="shell feature-layout">
        <div className="section-heading feature-section__heading">
          <span className="eyebrow">{t('features.eyebrow')}</span>
          <h2>{t('features.title')}</h2>
          <p>{t('features.description')}</p>
        </div>
        <div className="feature-list">
          {featureKeys.map((key) => (
            <article className="feature-row" key={key}>
              <span>{t(`features.items.${key}.number`)}</span>
              <div><h3>{t(`features.items.${key}.title`)}</h3><p>{t(`features.items.${key}.description`)}</p></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
