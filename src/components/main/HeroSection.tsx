import { useTranslation } from 'react-i18next'
import { Button } from '../common/Button'
import { ArrowIcon, CheckIcon, SparkIcon } from '../common/icons'

export function HeroSection() {
  const { t } = useTranslation('main')
  const titleLines = t('hero.title').split('\n')
  return (
    <section className="hero">
      <div className="shell hero__inner">
        <div className="hero__copy">
          <div className="eyebrow"><SparkIcon />{t('hero.eyebrow')}</div>
          <h1>{titleLines.map((line) => <span key={line}>{line}</span>)}</h1>
          <p>{t('hero.description')}</p>
          <div className="hero__actions">
            <Button to="/login">{t('hero.primaryCta')}<ArrowIcon /></Button>
            <a className="button button--ghost" href="#service">{t('hero.secondaryCta')}<ArrowIcon /></a>
          </div>
          <div className="hero__benefits">
            {(['always', 'faster', 'connected'] as const).map((benefit) => (
              <span key={benefit}><CheckIcon />{t(`hero.benefits.${benefit}`)}</span>
            ))}
          </div>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <div className="hero__mascot-wrap">
            <img className="hero__mascot" src="/brand/baemin-rider-cutout.png" alt="" />
          </div>
        </div>
      </div>
    </section>
  )
}
