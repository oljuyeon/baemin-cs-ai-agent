import { caseStore, mockMerchants, PROJECT_SIMULATION_POLICY, type CsCase } from '../cs'

const STORE_SESSION_KEY = 'delivery-cs-agent:selected-store'

export const REMINDER_AFTER_MS = PROJECT_SIMULATION_POLICY.merchantWarningSeconds * 1_000

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

const latestTimestamp = (values: Array<string | undefined>) =>
  values.reduce((latest, value) => {
    const timestamp = value ? new Date(value).getTime() : 0
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest
  }, 0)

export const isAwaitingMerchantReply = (caseData: CsCase) => {
  const confirmation = caseData.merchantConfirmation
  if (!confirmation || caseData.status !== 'WAITING_MERCHANT') return false

  const latestAgentRequest = latestTimestamp([
    confirmation.requestedAt,
    ...confirmation.conversation
      .filter((message) => message.role === 'agent')
      .map((message) => message.createdAt),
  ])
  const latestMerchantAnswer = latestTimestamp([
    confirmation.response ? confirmation.respondedAt : undefined,
    ...confirmation.conversation
      .filter((message) => message.role === 'merchant')
      .map((message) => message.createdAt),
    ...caseData.history
      .filter((entry) => entry.actor === 'merchant' && entry.event === 'MERCHANT_RESPONDED')
      .map((entry) => entry.createdAt),
  ])

  return latestAgentRequest > latestMerchantAnswer
}

export const isOverdueRequest = (caseData: CsCase, now = Date.now()) => {
  const confirmation = caseData.merchantConfirmation
  if (!confirmation || !isAwaitingMerchantReply(caseData)) return false
  const waitingSince = latestTimestamp([
    confirmation.requestedAt,
    ...confirmation.conversation
      .filter((message) => message.role === 'agent')
      .map((message) => message.createdAt),
  ])
  return waitingSince > 0 && now - waitingSince >= REMINDER_AFTER_MS
}
