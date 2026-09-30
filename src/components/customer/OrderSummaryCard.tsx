import { useTranslation } from 'react-i18next'
import { ChevronIcon } from './CustomerIcons'

export function OrderSummaryCard() {
  const { t } = useTranslation('customer')
  return (
    <section className="customer-order-block">
      <div className="customer-section-title"><h2>{t('order.sectionTitle')}</h2><button type="button">{t('order.change')}<ChevronIcon /></button></div>
      <article className="order-summary-card">
        <div className="order-summary-card__meta"><span>{t('order.recent')}</span><small>{t('order.orderedAt')}</small></div>
        <div className="order-summary-card__title"><div><h3>{t('order.store')}</h3><span>{t('order.orderNumber')}</span></div><strong>{t('order.price')}</strong></div>
        <p>{t('order.menu')}</p>
        <div className="order-summary-card__status">
          <div><span>{t('order.statusLabel')}</span><strong><i />{t('order.status')}</strong></div>
          <div><span>{t('order.etaLabel')}</span><strong>{t('order.eta')}</strong></div>
        </div>
      </article>
    </section>
  )
}
