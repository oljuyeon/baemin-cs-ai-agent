import { caseStore, type CsCase } from '../cs'

export const CS_AGENT_ID = 'CS001'
export const REMINDER_AFTER_MS = 3 * 60 * 1000
const STARTED_KEY = 'delivery-cs-agent:cs-started'

function readStarted() {
  if (typeof window === 'undefined') return new Set<string>()
  try {
    const raw = window.localStorage.getItem(STARTED_KEY)
    const ids = raw ? JSON.parse(raw) as unknown : []
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

export function isCsInProgress(caseId: string) {
  return readStarted().has(caseId)
}

export function markCsInProgress(caseId: string) {
  const ids = readStarted()
  if (ids.has(caseId)) return
  ids.add(caseId)
  window.localStorage.setItem(STARTED_KEY, JSON.stringify([...ids]))
}

const escalatedAt = (caseData: CsCase) => {
  const event = [...caseData.history].reverse().find((entry) => entry.event === 'ESCALATED')
  return new Date(event?.createdAt ?? caseData.updatedAt).getTime()
}

export function queueForCs(): CsCase[] {
  return caseStore.getCasesForRole('cs')
    .filter((caseData) => caseData.status === 'ESCALATED')
    .sort((left, right) => escalatedAt(right) - escalatedAt(left))
}

export function historyForCs(): CsCase[] {
  return caseStore.getCasesForRole('cs')
    .filter((caseData) => caseData.status === 'CLOSED' && caseData.humanCsResolution)
    .sort((left, right) =>
      (right.humanCsResolution?.handledAt ?? '').localeCompare(left.humanCsResolution?.handledAt ?? ''),
    )
}

export function isOverdueEscalation(caseData: CsCase, now = Date.now()) {
  return now - escalatedAt(caseData) >= REMINDER_AFTER_MS
}
