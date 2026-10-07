import { useTranslation } from 'react-i18next'
import {
  findDelivery,
  findMerchant,
  findOrder,
  mockOrders,
} from '../../features/cs'

const selectableOrderIds = new Set(['A1001', 'A1002', 'A1004'])
export const selectableOrders = mockOrders.filter((order) => selectableOrderIds.has(order.orderId))

export const firstSelectableOrderId = selectableOrders[0]?.orderId ?? ''

export function OrderSummaryCard({
  orderId,
  locked,
  onOrderChange,
}: {
  orderId: string
  locked: boolean
  onOrderChange: (orderId: string) => void
}) {
  const { t, i18n } = useTranslation('customer')
  const order = findOrder(orderId)
  const delivery = order ? findDelivery(order.orderId) : undefined
  const merchant = order ? findMerchant(order.storeId) : undefined
  const locale = i18n.language === 'en' ? 'en-US' : 'ko-KR'

  if (!order) return null

  return (
    <section className="customer-order-block">
      <div className="customer-section-title">
        <h2>{t('order.sectionTitle')}</h2>
        <select
          className="customer-order-select"
          aria-label={t('order.change')}
          value={orderId}
          disabled={locked}
          onChange={(event) => onOrderChange(event.target.value)}
        >
          {selectableOrders.map((candidate) => {
            const candidateMerchant = findMerchant(candidate.storeId)
            return (
              <option key={candidate.orderId} value={candidate.orderId}>
                {candidate.orderId} · {candidateMerchant?.storeName ?? candidate.storeId}
              </option>
            )
          })}
        </select>
      </div>
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
