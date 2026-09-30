import { useTranslation } from 'react-i18next'
import { BrandMark } from '../components/common/BrandMark'
import { Button } from '../components/common/Button'
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'
import { RoleIcon, SparkIcon } from '../components/common/icons'

type PlaceholderRole = 'customer' | 'merchant' | 'cs' | 'demo' | 'notFound'

export function PlaceholderPage({ role }: { role: PlaceholderRole }) {
  const { t } = useTranslation('common')
  const iconRole = role === 'merchant' || role === 'cs' ? role : 'customer'
  return (
    <main className="placeholder-page">
      <div className="placeholder-page__header"><BrandMark /><LanguageSwitcher /></div>
      <section className="placeholder-card">
        <span className="placeholder-card__icon">{role === 'demo' ? <SparkIcon /> : <RoleIcon type={iconRole} />}</span>
        <span className="eyebrow">{t('placeholder.eyebrow')}</span>
        <h1>{t(`placeholder.${role}`)}</h1>
        <p>{t('placeholder.description')}</p>
        <Button to="/" variant="primary">{t('actions.backHome')}</Button>
      </section>
    </main>
  )
}
