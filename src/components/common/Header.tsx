import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { BrandMark } from './BrandMark'
import { LanguageSwitcher } from './LanguageSwitcher'

export function Header() {
  const { t } = useTranslation('common')
  const [isOpen, setIsOpen] = useState(false)

  const close = () => setIsOpen(false)

  return (
    <header className="header">
      <div className="header__inner shell">
        <BrandMark />
        <nav className={`header__nav ${isOpen ? 'is-open' : ''}`} aria-label={t('accessibility.mainNav')}>
          <a href="/#service" onClick={close}>{t('nav.service')}</a>
          <a href="/#roles" onClick={close}>{t('nav.roles')}</a>
          <Link to="/agent-logs" onClick={close}>{t('nav.agentLogs')}</Link>
          <LanguageSwitcher />
        </nav>
        <button
          className="header__menu"
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-label={t(isOpen ? 'accessibility.closeMenu' : 'accessibility.openMenu')}
          aria-expanded={isOpen}
        >
          <span />
          <span />
        </button>
      </div>
    </header>
  )
}
