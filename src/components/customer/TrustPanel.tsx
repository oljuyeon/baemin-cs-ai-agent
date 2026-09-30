import { useTranslation } from 'react-i18next'
import { CheckIcon } from '../common/icons'

export function TrustPanel() {
  const { t } = useTranslation('customer')
  const items = t('trust.items', { returnObjects: true }) as string[]
  return (
    <aside className="trust-panel"><h3>{t('trust.title')}</h3><ul>{items.map((item) => <li key={item}><span><CheckIcon /></span>{item}</li>)}</ul><p>{t('trust.note')}</p></aside>
  )
}
