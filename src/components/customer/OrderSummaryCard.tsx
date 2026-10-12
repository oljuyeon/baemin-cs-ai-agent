import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  findDelivery,
  findMerchant,
  findOrder,
  mockOrders,
  type DeliveryData,
  type OrderData,
} from '../../features/cs'

export const selectableOrders = [...mockOrders].sort((left, right) =>
  left.orderId.localeCompare(right.orderId, undefined, { numeric: true }),
)

export const firstSelectableOrderId = selectableOrders[0]?.orderId ?? ''

export function OrderSummaryCard({
  orderId,
  locked,
  onOrderChange,
  orderSnapshot,
  deliverySnapshot,
}: {
  orderId: string
  locked: boolean
  onOrderChange: (orderId: string) => void
  orderSnapshot?: OrderData
  deliverySnapshot?: DeliveryData
}) {
  const { t, i18n } = useTranslation('customer')
  const [clockNow, setClockNow] = useState(() => Date.now())
  const order = orderSnapshot?.orderId === orderId ? orderSnapshot : findOrder(orderId)
  const delivery = deliverySnapshot?.orderId === orderId
    ? deliverySnapshot
    : order
      ? findDelivery(order.orderId, clockNow)
      : undefined
  const merchant = order ? findMerchant(order.storeId) : undefined
  const locale = i18n.language === 'en' ? 'en-US' : 'ko-KR'
  const deliveryCompletedAt = delivery?.deliveryStatus === 'delivered'
    ? delivery.deliveredAt
    : undefined
  const deliveryTime = deliveryCompletedAt ?? delivery?.expectedAt
  const deliveryStatus = delivery?.deliveryStatus ?? order?.orderStatus

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

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
          <small>
            {t('order.orderedAtLabel')} {new Date(order.orderedAt).toLocaleString(locale, {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </small>
        </div>
        <div className="order-summary-card__title">
          <div><h3>{merchant?.storeName ?? order.storeId}</h3><span>{order.orderId}</span></div>
          <strong>{order.totalAmount.toLocaleString(locale)}원</strong>
        </div>
        <p>{order.items.map((item) => item.name).join(' · ')}</p>
        <div className="order-summary-card__status">
          <div><span>{t('order.statusLabel')}</span><strong><i />{deliveryStatus ? t(`order.statuses.${deliveryStatus}`, { defaultValue: deliveryStatus }) : '-'}</strong></div>
          <div>
            <span>{t(deliveryCompletedAt ? 'order.deliveredAtLabel' : 'order.etaLabel')}</span>
            <strong>{deliveryTime ? new Date(deliveryTime).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '-'}</strong>
            {delivery && (
              <small>
                {delivery.deliveredAt
                  ? t('order.deliveredAt', {
                    time: new Date(delivery.deliveredAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
                  })
                  : delivery.delayMinutes > 0
                    ? t('order.delayedBy', { minutes: delivery.delayMinutes })
                    : t('order.arrivingIn', { minutes: Math.abs(delivery.delayMinutes) })}
              </small>
            )}
          </div>
        </div>
      </article>
    </section>
  )
}
