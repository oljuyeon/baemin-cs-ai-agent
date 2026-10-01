import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../common/LanguageSwitcher'
import { RoleIcon } from '../common/icons'
import { BackIcon } from '../customer/CustomerIcons'

export function MerchantHeader() {
  const { t } = useTranslation('merchant')
  return (
    <header className="merchant-header">
      <div className="merchant-shell merchant-header__inner">
        <Link to="/" className="merchant-header__back" aria-label={t('header.back')}><BackIcon /></Link>
        <div className="merchant-header__title">
          <span><RoleIcon type="merchant" /></span>
          <strong>{t('header.title')}</strong>
        </div>
        <LanguageSwitcher />
      </div>
    </header>
  )
}
