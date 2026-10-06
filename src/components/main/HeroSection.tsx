import { useTranslation } from 'react-i18next'
import { Button } from '../common/Button'
import { ArrowIcon, CheckIcon, SparkIcon } from '../common/icons'

export function HeroSection() {
  const { t } = useTranslation('main')
  return (
    <section className="hero">
      <div className="shell hero__inner">
        <div className="hero__copy">
          <div className="eyebrow"><SparkIcon />{t('hero.eyebrow')}</div>
          <h1>{t('hero.title')}</h1>
          <p>{t('hero.description')}</p>
          <div className="hero__actions">
            <Button to="/login">{t('hero.primaryCta')}<ArrowIcon /></Button>
            <a className="text-link" href="#roles">{t('hero.secondaryCta')}<ArrowIcon /></a>
          </div>
          <span className="hero__time"><CheckIcon />{t('hero.time')}</span>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <div className="phone-card">
            <div className="phone-card__top">
              <span className="phone-card__avatar"><SparkIcon /></span>
              <div><strong>{t('hero.status')}</strong><span className="typing"><i/><i/><i/></span></div>
            </div>
            <div className="phone-card__route">
              <span className="route-dot route-dot--start" />
              <span className="route-line" />
              <span className="route-bike">⌁</span>
              <span className="route-line route-line--muted" />
              <span className="route-dot route-dot--end" />
            </div>
            <div className="phone-card__bubble">{t('hero.message')}</div>
            <div className="phone-card__result"><span><CheckIcon /></span>{t('hero.resolution')}</div>
          </div>
          <span className="hero__shape hero__shape--one" />
          <span className="hero__shape hero__shape--two" />
        </div>
      </div>
    </section>
  )
}
