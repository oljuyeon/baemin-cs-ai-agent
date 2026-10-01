import { useTranslation } from 'react-i18next'

interface Props {
  showNew: boolean
  showOverdue: boolean
  flash: string | null
  onDismissNew: () => void
}

export function CsAlerts({ showNew, showOverdue, flash, onDismissNew }: Props) {
  const { t } = useTranslation('cs')
  if (!showNew && !showOverdue && !flash) return null
  return (
    <div className="cs-alerts">
      {showNew && (
        <p className="cs-alerts__item cs-alerts__item--new">
          {t('alerts.newEscalation')}
          <button type="button" onClick={onDismissNew}>{t('alerts.dismiss')}</button>
        </p>
      )}
      {showOverdue && <p className="cs-alerts__item cs-alerts__item--overdue">{t('alerts.overdue')}</p>}
      {flash && <p className="cs-alerts__item">{flash}</p>}
    </div>
  )
}
