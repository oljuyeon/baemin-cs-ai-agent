import { useTranslation } from 'react-i18next'
import { BrandMark } from '../components/common/BrandMark'
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'
import { RoleEntrySection } from '../components/main/RoleEntrySection'

export function LoginPage() {
  const { t } = useTranslation('common')
  return (
    <main className="login-page">
      <div className="login-page__header shell"><BrandMark /><LanguageSwitcher /></div>
      <div className="login-page__intro shell">
        <span className="eyebrow">{t('login.eyebrow')}</span>
        <h1>{t('login.title')}</h1>
        <p>{t('login.description')}</p>
      </div>
      <RoleEntrySection />
    </main>
  )
}
