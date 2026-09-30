import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../common/LanguageSwitcher'
import { SparkIcon } from '../common/icons'
import { BackIcon } from './CustomerIcons'

export function CustomerHeader() {
  const { t } = useTranslation('customer')
  return (
    <header className="customer-header">
      <div className="customer-shell customer-header__inner">
        <Link to="/" className="customer-header__back" aria-label={t('header.back')}><BackIcon /></Link>
        <div className="customer-header__title"><span><SparkIcon /></span><strong>{t('header.title')}</strong></div>
        <LanguageSwitcher />
      </div>
    </header>
  )
}
