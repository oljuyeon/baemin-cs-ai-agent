import { caseStore, type CsCase } from '../cs'

export const CS_AGENT_ID = 'CS001'
export const REMINDER_AFTER_MS = 3 * 60 * 1000

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
