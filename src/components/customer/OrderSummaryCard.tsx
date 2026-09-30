import { useTranslation } from 'react-i18next'
import {
  findDelivery,
  findMerchant,
  findOrder,
} from '../../features/cs'
import type { CustomerIssue } from '../../types/customer'
import { ChevronIcon } from './CustomerIcons'

const orderIdForIssue: Record<CustomerIssue, string> = {
  delay: 'A1001',
  missing: 'A1002',
  wrong: 'A1005',
}

export function OrderSummaryCard({ issue }: { issue: CustomerIssue | null }) {
  const { t, i18n } = useTranslation('customer')
  const order = findOrder(orderIdForIssue[issue ?? 'missing'])
  const delivery = order ? findDelivery(order.orderId) : undefined
  const merchant = order ? findMerchant(order.storeId) : undefined
  const locale = i18n.language === 'en' ? 'en-US' : 'ko-KR'

  if (!order) return null

  return (
    <section className="customer-order-block">
      <div className="customer-section-title"><h2>{t('order.sectionTitle')}</h2><button type="button">{t('order.change')}<ChevronIcon /></button></div>
      <article className="order-summary-card">
        <div className="order-summary-card__meta">
          <span>{t('order.recent')}</span>
          <small>{new Date(order.orderedAt).toLocaleString(locale)}</small>
        </div>
        <div className="order-summary-card__title">
          <div><h3>{merchant?.storeName ?? order.storeId}</h3><span>{order.orderId}</span></div>
          <strong>{order.totalAmount.toLocaleString(locale)}원</strong>
        </div>
        <p>{order.items.map((item) => item.name).join(' · ')}</p>
        <div className="order-summary-card__status">
          <div><span>{t('order.statusLabel')}</span><strong><i />{delivery?.deliveryStatus ?? order.orderStatus}</strong></div>
          <div><span>{t('order.etaLabel')}</span><strong>{delivery?.expectedAt ? new Date(delivery.expectedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '-'}</strong></div>
        </div>
      </article>
    </section>
  )
}
