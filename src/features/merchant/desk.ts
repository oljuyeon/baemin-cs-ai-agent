import { caseStore, mockMerchants, type CsCase } from '../cs'

const STORE_SESSION_KEY = 'delivery-cs-agent:selected-store'

export const REMINDER_AFTER_MS = 3 * 60 * 1000

export const readSelectedStoreId = () => {
  const stored = window.sessionStorage.getItem(STORE_SESSION_KEY)
  if (stored && mockMerchants.some((merchant) => merchant.storeId === stored)) return stored
  return mockMerchants[0]?.storeId ?? ''
}

export const writeSelectedStoreId = (storeId: string) => {
  window.sessionStorage.setItem(STORE_SESSION_KEY, storeId)
}

export const merchantForStore = (storeId: string) =>
  mockMerchants.find((merchant) => merchant.storeId === storeId)

export const queueForStore = (storeId: string): CsCase[] => {
  const merchant = merchantForStore(storeId)
  if (!merchant) return []
  return caseStore
    .getCasesForRole('merchant', merchant.merchantUserId)
    .sort((left, right) =>
      (left.merchantConfirmation?.requestedAt ?? left.createdAt)
        .localeCompare(right.merchantConfirmation?.requestedAt ?? right.createdAt),
    )
}

export const historyForStore = (storeId: string): CsCase[] =>
  caseStore
    .getAllCases()
    .filter((caseData) =>
      caseData.storeId === storeId && caseData.merchantConfirmation?.status === 'completed',
    )
    .sort((left, right) =>
      (right.merchantConfirmation?.respondedAt ?? '').localeCompare(
        left.merchantConfirmation?.respondedAt ?? '',
      ),
    )

export const isOverdueRequest = (caseData: CsCase, now = Date.now()) => {
  const requestedAt = caseData.merchantConfirmation?.requestedAt
  if (!requestedAt || caseData.status !== 'WAITING_MERCHANT') return false
  return now - new Date(requestedAt).getTime() >= REMINDER_AFTER_MS
}
