import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../common/LanguageSwitcher'
import { RoleIcon } from '../common/icons'
import { BackIcon } from '../customer/CustomerIcons'

export function CsHeader() {
  const { t } = useTranslation('cs')
  return (
    <header className="cs-header">
      <div className="cs-shell cs-header__inner">
        <Link to="/" className="cs-header__back" aria-label={t('header.back')}><BackIcon /></Link>
        <div className="cs-header__title">
          <span><RoleIcon type="cs" /></span>
          <strong>{t('header.title')}</strong>
        </div>
        <LanguageSwitcher />
      </div>
    </header>
  )
}
