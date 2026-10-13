import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../common/LanguageSwitcher'
import { BackIcon } from '../customer/CustomerIcons'

export function CsHeader() {
  const { t } = useTranslation('cs')
  return (
    <header className="cs-header">
      <div className="cs-shell cs-header__inner">
        <Link to="/" className="cs-header__back" aria-label={t('header.back')}><BackIcon /></Link>
        <div className="cs-header__title">
          <span><img src="/brand/ieum-symbol.jpeg" alt="" /></span>
          <strong>{t('header.title')}</strong>
        </div>
        <LanguageSwitcher />
      </div>
    </header>
  )
}
