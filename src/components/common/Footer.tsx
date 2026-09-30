import { useTranslation } from 'react-i18next'
import { BrandMark } from './BrandMark'

export function Footer() {
  const { t } = useTranslation('main')
  return (
    <footer className="footer">
      <div className="shell footer__inner">
        <BrandMark />
        <p>{t('footer.notice')}</p>
        <span>{t('footer.copyright')}</span>
      </div>
    </footer>
  )
}
