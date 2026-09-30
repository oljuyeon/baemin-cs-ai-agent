import { useTranslation } from 'react-i18next'

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation('common')
  const nextLanguage = i18n.resolvedLanguage === 'ko' ? 'en' : 'ko'

  return (
    <button
      type="button"
      className="language-switcher"
      onClick={() => i18n.changeLanguage(nextLanguage)}
      aria-label={t('language.label')}
    >
      <span className="language-switcher__globe" aria-hidden="true">◎</span>
      {t(`language.${nextLanguage}`)}
    </button>
  )
}
