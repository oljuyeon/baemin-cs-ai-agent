import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
export function BrandMark() {
  const { t } = useTranslation('common')
  return (
    <Link className="brand" to="/" aria-label={t('accessibility.home')}>
      <span className="brand__symbol" aria-hidden="true">
        <img src="/brand/ieum-symbol.jpeg" alt="" />
      </span>
      <span className="brand__copy">
        <strong className="brand__text">{t('brand.name')}</strong>
        <small>{t('brand.tagline')}</small>
      </span>
    </Link>
  )
}
