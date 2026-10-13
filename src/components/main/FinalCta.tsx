import { useTranslation } from 'react-i18next'
import { Button } from '../common/Button'
import { ArrowIcon, SparkIcon } from '../common/icons'

export function FinalCta() {
  const { t } = useTranslation('main')
  return (
    <section className="section final-cta-section">
      <div className="shell final-cta">
        <div className="final-cta__copy">
          <span className="final-cta__spark"><SparkIcon /></span>
          <h2>{t('finalCta.title')}</h2>
          <p>{t('finalCta.description')}</p>
          <Button to="/login" variant="secondary">{t('finalCta.button')}<ArrowIcon /></Button>
        </div>
        <div className="final-cta__visual" aria-hidden="true">
          <img src="/brand/baemin-rider-cutout.png" alt="" />
        </div>
      </div>
    </section>
  )
}
