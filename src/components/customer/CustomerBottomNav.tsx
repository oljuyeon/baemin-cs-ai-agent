import { useTranslation } from 'react-i18next'
import { NavIcon } from './CustomerIcons'

const navItems = ['home', 'orders', 'cases', 'profile'] as const

export function CustomerBottomNav() {
  const { t } = useTranslation('customer')
  return <nav className="customer-bottom-nav" aria-label={t('header.title')}>{navItems.map((item, index) => <button className={index === 0 ? 'is-active' : ''} type="button" key={item}><NavIcon type={item}/><span>{t(`nav.${item}`)}</span></button>)}</nav>
}
