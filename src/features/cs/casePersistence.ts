import type { CsCase } from './types'

const STORAGE_KEY = 'delivery-cs-agent:cases:v2'
const CHANNEL_NAME = 'delivery-cs-agent:case-updates'
const UNAVAILABLE_EVIDENCE = 'saved-image://reload-required'
const EVIDENCE_PREFIX = 'idb-image://'
const EVIDENCE_DB = 'delivery-cs-agent-evidence'
const EVIDENCE_STORE = 'images'

type PersistedState = {
  version: 2
  cases: CsCase[]
}

const canUseBrowserStorage = () => typeof window !== 'undefined'

const evidenceKey = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${(hash >>> 0).toString(16)}-${value.length}`
}

const openEvidenceDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = window.indexedDB.open(EVIDENCE_DB, 1)
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(EVIDENCE_STORE)) {
      request.result.createObjectStore(EVIDENCE_STORE)
    }
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

const saveInlineEvidence = async (dataUrl: string) => {
  if (!canUseBrowserStorage() || !('indexedDB' in window)) return UNAVAILABLE_EVIDENCE
  const key = evidenceKey(dataUrl)
  const db = await openEvidenceDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(EVIDENCE_STORE, 'readwrite')
    transaction.objectStore(EVIDENCE_STORE).put(dataUrl, key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
  return `${EVIDENCE_PREFIX}${key}`
}

const persistedEvidenceReference = (url: string) => {
  if (!url.startsWith('data:image/')) return url
  const reference = `${EVIDENCE_PREFIX}${evidenceKey(url)}`
  void saveInlineEvidence(url).catch((error) => {
    console.warn('첨부 사진을 브라우저 저장소에 보관하지 못했습니다.', error)
  })
  return reference
}

export const resolvePersistedEvidenceUrl = async (url: string) => {
  if (!url.startsWith(EVIDENCE_PREFIX)) return url
  if (!canUseBrowserStorage() || !('indexedDB' in window)) return UNAVAILABLE_EVIDENCE
  try {
    const db = await openEvidenceDb()
    const key = url.slice(EVIDENCE_PREFIX.length)
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(EVIDENCE_STORE, 'readonly')
        .objectStore(EVIDENCE_STORE)
        .get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return typeof value === 'string' ? value : UNAVAILABLE_EVIDENCE
  } catch (error) {
    console.warn('보관된 첨부 사진을 불러오지 못했습니다.', error)
    return UNAVAILABLE_EVIDENCE
  }
}

const withoutLargeInlineImages = (caseData: CsCase): CsCase => {
  const next = structuredClone(caseData)
  const safeEvidenceUrl = (url: string) => persistedEvidenceReference(url)

  next.evidenceUrls = next.evidenceUrls.map(safeEvidenceUrl)
  next.evidenceAnalysis = next.evidenceAnalysis?.map((analysis) => ({
    ...analysis,
    evidenceUrl: safeEvidenceUrl(analysis.evidenceUrl),
  }))
  if (next.merchantConfirmation?.evidenceUrl) {
    next.merchantConfirmation.evidenceUrl = safeEvidenceUrl(
      next.merchantConfirmation.evidenceUrl,
    )
  }
  return next
}

const normalizePersistedCase = (caseData: CsCase): CsCase => {
  const next = structuredClone(caseData)
  if (next.merchantConfirmation) {
    next.merchantConfirmation.requestedBy ??= 'agent'
    next.merchantConfirmation.conversation ??= []
  }
  return next
}

export const readPersistedCases = (): CsCase[] => {
  if (!canUseBrowserStorage()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    if (parsed.version !== 2 || !Array.isArray(parsed.cases)) return []
    return parsed.cases.map(normalizePersistedCase)
  } catch (error) {
    console.warn('Case 저장 내용을 불러오지 못했습니다.', error)
    return []
  }
}

export const writePersistedCases = (cases: CsCase[]) => {
  if (!canUseBrowserStorage()) return
  try {
    const state: PersistedState = {
      version: 2,
      cases: cases.map(withoutLargeInlineImages),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn('Case 대화와 처리 이력을 저장하지 못했습니다.', error)
  }
}

export const createCaseSyncChannel = (
  onExternalUpdate: (cases: CsCase[]) => void,
) => {
  if (!canUseBrowserStorage() || typeof BroadcastChannel === 'undefined') {
    return { publish: () => undefined }
  }

  const channel = new BroadcastChannel(CHANNEL_NAME)
  channel.addEventListener('message', () => onExternalUpdate(readPersistedCases()))
  return {
    publish: () => channel.postMessage({ type: 'cases-updated' }),
  }
}
