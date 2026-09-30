import { mockMerchants } from './demoData'
import type {
  CaseCommit,
  CaseHistory,
  CaseHistoryDraft,
  CaseStatus,
  CaseStore,
  ConversationMessage,
  CreateCaseInput,
  CsCase,
  EvidenceAnalysis,
  FinalAction,
  HumanCsAction,
  MerchantResponse,
  ToolCallLog,
  ToolCallLogDraft,
  UserRole,
} from './types'

const STORAGE_KEY = 'delivery-cs-agent:cases:v2'

const clone = <T>(value: T): T => structuredClone(value)
const nowIso = () => new Date().toISOString()
const newId = (prefix: string) => {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `${prefix}-${suffix}`
}

const isStoredCaseArray = (value: unknown): value is CsCase[] =>
  Array.isArray(value)
  && value.every((item) =>
    typeof item === 'object'
    && item !== null
    && typeof (item as CsCase).caseId === 'string'
    && Array.isArray((item as CsCase).history)
    && Array.isArray((item as CsCase).toolHistory),
  )

const normalizeCase = (caseData: CsCase): CsCase => ({
  ...caseData,
  conversation: Array.isArray(caseData.conversation)
    ? caseData.conversation
    : [{
        role: 'customer',
        content: caseData.customerClaim,
        createdAt: caseData.createdAt,
      }],
  evidenceUrls: Array.isArray(caseData.evidenceUrls) ? caseData.evidenceUrls : [],
  csHistory: Array.isArray(caseData.csHistory) ? caseData.csHistory : [],
  riskFlags: Array.isArray(caseData.riskFlags) ? caseData.riskFlags : [],
  history: Array.isArray(caseData.history) ? caseData.history : [],
  toolHistory: Array.isArray(caseData.toolHistory) ? caseData.toolHistory : [],
})

const finalActionForHumanCs = (action: HumanCsAction): FinalAction => {
  if (action === 'approve_refund') return 'mock_refund'
  if (action === 'approve_redelivery') return 'mock_redelivery'
  return 'human_review'
}

export class LocalCaseStore implements CaseStore {
  private cases = new Map<string, CsCase>()
  private listeners = new Map<string, Set<(caseData: CsCase) => void>>()

  constructor() {
    this.restore()
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key !== STORAGE_KEY || !event.newValue) return
        try {
          const stored = JSON.parse(event.newValue) as unknown
          if (!isStoredCaseArray(stored)) return
          this.cases = new Map(stored.map((caseData) => {
            const normalized = normalizeCase(caseData)
            return [normalized.caseId, normalized]
          }))
          stored.forEach((caseData) => this.notify(caseData.caseId))
        } catch {
          // Ignore malformed values written outside this store.
        }
      })
    }
  }

  createCase(input: CreateCaseInput): CsCase {
    const timestamp = nowIso()
    const caseId = input.caseId ?? newId('CASE')
    if (this.cases.has(caseId)) throw new Error(`Case ${caseId} already exists.`)

    const caseData: CsCase = {
      caseId,
      customerId: input.customerId,
      orderId: input.orderId,
      storeId: input.storeId,
      issueType: input.issueType,
      status: 'NEW',
      customerClaim: input.customerClaim,
      claimedItemName: input.claimedItemName,
      receivedItemDescription: input.receivedItemDescription,
      conversation: [{
        role: 'customer',
        content: input.customerClaim,
        createdAt: timestamp,
      }],
      evidenceUrls: input.evidenceUrls ? [...input.evidenceUrls] : [],
      csHistory: [],
      riskFlags: [],
      history: [{
        id: newId('HISTORY'),
        actor: 'customer',
        event: 'CASE_CREATED',
        toStatus: 'NEW',
        detail: '고객 문의 접수',
        createdAt: timestamp,
      }],
      toolHistory: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    this.cases.set(caseId, caseData)
    this.persistAndNotify(caseId)
    return clone(caseData)
  }

  getCase(caseId: string): CsCase | undefined {
    const caseData = this.cases.get(caseId)
    return caseData ? clone(caseData) : undefined
  }

  getAllCases(): CsCase[] {
    return [...this.cases.values()]
      .sort((left, right) => left.caseId.localeCompare(right.caseId))
      .map(clone)
  }

  findCaseByOrderId(orderId: string): CsCase | undefined {
    const matches = [...this.cases.values()]
      .filter((caseData) => caseData.orderId === orderId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    return matches[0] ? clone(matches[0]) : undefined
  }

  commitCase(caseId: string, commit: CaseCommit): CsCase {
    const current = this.cases.get(caseId)
    if (!current) throw new Error(`Case ${caseId} was not found.`)

    const timestamp = nowIso()
    const changes = clone(commit.changes ?? {})
    const historyDrafts = [...(commit.history ?? [])]
    const nextStatus = changes.status ?? current.status

    if (
      nextStatus !== current.status
      && !historyDrafts.some((entry) => entry.event === 'STATUS_CHANGED')
    ) {
      historyDrafts.push({
        actor: 'agent',
        event: 'STATUS_CHANGED',
        fromStatus: current.status,
        toStatus: nextStatus,
        detail: `${current.status}에서 ${nextStatus}로 변경`,
      })
    }

    const history = [
      ...current.history,
      ...historyDrafts.map((draft) => this.makeHistory(draft, timestamp)),
    ]
    const toolHistory = [
      ...current.toolHistory,
      ...(commit.toolHistory ?? []).map((draft, index) =>
        this.makeToolLog(draft, current.toolHistory.length + index + 1),
      ),
    ]

    const next: CsCase = {
      ...current,
      ...changes,
      history,
      toolHistory,
      updatedAt: timestamp,
    }

    this.cases.set(caseId, next)
    this.persistAndNotify(caseId)
    return clone(next)
  }

  updateCase(caseId: string, changes: CaseCommit['changes'] = {}): CsCase {
    return this.commitCase(caseId, { changes })
  }

  getCasesByStatus(status: CaseStatus): CsCase[] {
    return this.getAllCases().filter((caseData) => caseData.status === status)
  }

  getCasesForRole(role: UserRole, subjectId?: string): CsCase[] {
    const cases = this.getAllCases()
    if (role === 'cs') {
      return cases.filter((caseData) =>
        caseData.status === 'ESCALATED'
        || (caseData.status === 'CLOSED' && Boolean(caseData.humanCsResolution)),
      )
    }

    if (!subjectId) return []
    if (role === 'customer') {
      return cases.filter((caseData) => caseData.customerId === subjectId)
    }

    const merchant = mockMerchants.find((item) => item.merchantUserId === subjectId)
    const storeId = merchant?.storeId ?? subjectId
    return cases.filter((caseData) =>
      caseData.storeId === storeId && caseData.status === 'WAITING_MERCHANT',
    )
  }

  appendConversation(
    caseId: string,
    role: ConversationMessage['role'],
    content: string,
  ): CsCase {
    const current = this.requireCase(caseId)
    const message = { role, content, createdAt: nowIso() }
    return this.commitCase(caseId, {
      changes: { conversation: [...current.conversation, message] },
    })
  }

  recordEvidenceAnalysis(caseId: string, analysis: EvidenceAnalysis): CsCase {
    const current = this.requireCase(caseId)
    const previous = current.evidenceAnalysis ?? []
    const withoutSameEvidence = previous.filter(
      (item) => item.evidenceUrl !== analysis.evidenceUrl,
    )
    return this.commitCase(caseId, {
      changes: { evidenceAnalysis: [...withoutSameEvidence, analysis] },
    })
  }

  recordMerchantResponse(
    caseId: string,
    response: MerchantResponse,
    comment?: string,
  ): CsCase {
    const current = this.requireCase(caseId)
    if (!current.merchantConfirmation) {
      throw new Error(`Case ${caseId} has no Merchant confirmation request.`)
    }

    const respondedAt = nowIso()
    return this.commitCase(caseId, {
      changes: {
        status: 'CHECKING_DATA',
        decision: undefined,
        appliedPolicy: undefined,
        riskFlags: [],
        merchantConfirmation: {
          ...current.merchantConfirmation,
          response,
          comment,
          status: 'completed',
          respondedAt,
        },
      },
      history: [{
        actor: 'merchant',
        event: 'MERCHANT_RESPONDED',
        fromStatus: current.status,
        toStatus: 'CHECKING_DATA',
        detail: `Merchant 응답 저장: ${response}`,
        createdAt: respondedAt,
      }],
    })
  }

  recordHumanCsResolution(
    caseId: string,
    action: HumanCsAction,
    handledBy: string,
    comment?: string,
  ): CsCase {
    const current = this.requireCase(caseId)
    const handledAt = nowIso()
    return this.commitCase(caseId, {
      changes: {
        status: 'CLOSED',
        finalAction: finalActionForHumanCs(action),
        humanCsResolution: { action, handledBy, comment, handledAt },
      },
      history: [{
        actor: 'cs',
        event: 'HUMAN_CS_ACTION_COMPLETED',
        fromStatus: current.status,
        toStatus: 'CLOSED',
        detail: `Human CS 최종 처리: ${action}${comment ? ` - ${comment}` : ''}`,
        createdAt: handledAt,
      }],
    })
  }

  subscribe(caseId: string, listener: (caseData: CsCase) => void): () => void {
    const listeners = this.listeners.get(caseId) ?? new Set()
    listeners.add(listener)
    this.listeners.set(caseId, listeners)
    const current = this.getCase(caseId)
    if (current) listener(current)

    return () => {
      const currentListeners = this.listeners.get(caseId)
      currentListeners?.delete(listener)
      if (currentListeners?.size === 0) this.listeners.delete(caseId)
    }
  }

  resetCase(caseId: string): CsCase {
    const current = this.requireCase(caseId)
    if (!current.demoCaseId) throw new Error(`Case ${caseId} is not a Demo Case.`)
    throw new Error(
      `Demo ${current.demoCaseId} is not restored from a scripted customer claim.`,
    )
  }

  resetAllDemoCases(): CsCase[] {
    let removed = false
    for (const [caseId, caseData] of this.cases.entries()) {
      if (!caseData.demoCaseId) continue
      this.cases.delete(caseId)
      removed = true
    }
    if (removed) this.persist()
    return []
  }

  private restore() {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const stored = JSON.parse(raw) as unknown
          if (isStoredCaseArray(stored)) {
            this.cases = new Map(stored.map((caseData) => {
              const normalized = normalizeCase(caseData)
              return [normalized.caseId, normalized]
            }))
            return
          }
        }
      } catch {
        // Fall through to deterministic Demo Data.
      }
    }

    this.cases = new Map()
    this.persist()
  }

  private persist() {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.cases.values()]))
  }

  private persistAndNotify(caseId: string) {
    this.persist()
    this.notify(caseId)
  }

  private notify(caseId: string) {
    const current = this.getCase(caseId)
    if (!current) return
    this.listeners.get(caseId)?.forEach((listener) => listener(current))
  }

  private requireCase(caseId: string): CsCase {
    const caseData = this.cases.get(caseId)
    if (!caseData) throw new Error(`Case ${caseId} was not found.`)
    return caseData
  }

  private makeHistory(draft: CaseHistoryDraft, fallbackCreatedAt: string): CaseHistory {
    return {
      ...draft,
      id: draft.id ?? newId('HISTORY'),
      createdAt: draft.createdAt ?? fallbackCreatedAt,
    }
  }

  private makeToolLog(draft: ToolCallLogDraft, fallbackStep: number): ToolCallLog {
    return {
      ...clone(draft),
      id: draft.id ?? newId('TOOL'),
      step: draft.step ?? fallbackStep,
    }
  }
}

export const caseStore = new LocalCaseStore()
export { STORAGE_KEY as CASE_STORE_STORAGE_KEY }
