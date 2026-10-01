import { useTranslation } from 'react-i18next'
import { mockMerchants } from '../../features/cs'

export function StoreSwitcher({
  storeId,
  onSelect,
}: {
  storeId: string
  onSelect: (storeId: string) => void
}) {
  const { t } = useTranslation('merchant')
  return (
    <section className="store-switcher" aria-label={t('stores.label')}>
      <div className="store-switcher__copy">
        <span>{t('header.owner')}</span>
        <h1>{t('stores.label')}</h1>
        <p>{t('stores.hint')}</p>
      </div>
      <div className="store-switcher__grid">
        {mockMerchants.map((merchant) => {
          const selected = merchant.storeId === storeId
          return (
            <button
              key={merchant.storeId}
              type="button"
              className={selected ? 'is-selected' : undefined}
              aria-pressed={selected}
              onClick={() => onSelect(merchant.storeId)}
            >
              <strong>{merchant.storeName}</strong>
              <small>{t('stores.id', { storeId: merchant.storeId })}</small>
            </button>
          )
        })}
      </div>
    </section>
  )
}
