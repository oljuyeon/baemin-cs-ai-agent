import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SparkIcon } from './icons'

export function BrandMark() {
  const { t } = useTranslation('common')
  return (
    <Link className="brand" to="/" aria-label={t('accessibility.home')}>
      <span className="brand__symbol"><SparkIcon /></span>
      <span className="brand__text">{t('brand.name')}</span>
    </Link>
  )
}
