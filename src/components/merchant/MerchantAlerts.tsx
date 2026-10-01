import { useTranslation } from 'react-i18next'

export function MerchantAlerts({
  showNew,
  showOverdue,
  flash,
  onDismissNew,
}: {
  showNew: boolean
  showOverdue: boolean
  flash: string | null
  onDismissNew: () => void
}) {
  const { t } = useTranslation('merchant')
  if (!showNew && !showOverdue && !flash) return null

  return (
    <div className="merchant-alerts">
      {showNew && (
        <p className="merchant-alerts__item merchant-alerts__item--new">
          <span>{t('alerts.newRequest')}</span>
          <button type="button" onClick={onDismissNew}>{t('alerts.dismiss')}</button>
        </p>
      )}
      {showOverdue && (
        <p className="merchant-alerts__item merchant-alerts__item--overdue">{t('alerts.overdue')}</p>
      )}
      {flash && <p className="merchant-alerts__item">{flash}</p>}
    </div>
  )
}
