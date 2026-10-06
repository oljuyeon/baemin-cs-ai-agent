import { useTranslation } from 'react-i18next'
import { Button } from '../common/Button'
import { ArrowIcon, SparkIcon } from '../common/icons'

export function FinalCta() {
  const { t } = useTranslation('main')
  return (
    <section className="section final-cta-section">
      <div className="shell final-cta">
        <span className="final-cta__spark"><SparkIcon /></span>
        <h2>{t('finalCta.title')}</h2>
        <p>{t('finalCta.description')}</p>
        <Button to="/login" variant="secondary">{t('finalCta.button')}<ArrowIcon /></Button>
      </div>
    </section>
  )
}
