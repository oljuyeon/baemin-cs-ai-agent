import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { caseStore, type CsCase } from '../features/cs'
import {
  historyForStore,
  isOverdueRequest,
  queueForStore,
  readSelectedStoreId,
  writeSelectedStoreId,
} from '../features/merchant/desk'
import {
  createRemainingSamples,
  createSampleMerchantRequest,
  samplesForStore,
  waitingSampleIds,
} from '../features/merchant/sampleRequest'
import { MerchantAlerts } from '../components/merchant/MerchantAlerts'
import { MerchantHeader } from '../components/merchant/MerchantHeader'
import { RequestDetail } from '../components/merchant/RequestDetail'
import { RequestQueue } from '../components/merchant/RequestQueue'
import { ResponseHistory } from '../components/merchant/ResponseHistory'
import { StoreSwitcher } from '../components/merchant/StoreSwitcher'
import '../styles/merchant.css'

const narrowQuery = '(max-width: 820px)'

function useNarrowLayout() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(narrowQuery).matches)
  useEffect(() => {
    const media = window.matchMedia(narrowQuery)
    const onChange = () => setNarrow(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return narrow
}

export function MerchantPage() {
  const { t } = useTranslation('merchant')
  const [storeId, setStoreId] = useState(readSelectedStoreId)
  const [queue, setQueue] = useState<CsCase[]>([])
  const [history, setHistory] = useState<CsCase[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panel, setPanel] = useState<'queue' | 'history'>('queue')
  const [mobileDetail, setMobileDetail] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [hasDemoCases, setHasDemoCases] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const narrow = useNarrowLayout()
  const seenCount = useRef<number | null>(null)

  const refresh = useCallback(() => {
    const nextQueue = queueForStore(storeId)
    const nextHistory = historyForStore(storeId)
    if (seenCount.current !== null && nextQueue.length > seenCount.current) setShowNew(true)
    seenCount.current = nextQueue.length
    setQueue(nextQueue)
    setHistory(nextHistory)
    setHasDemoCases(caseStore.getAllCases().some((caseData) => Boolean(caseData.demoCaseId)))
  }, [storeId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 15_000)
    const poll = window.setInterval(refresh, 4_000)
    return () => {
      window.clearInterval(clock)
      window.clearInterval(poll)
    }
  }, [refresh])

  const caseIds = [...queue, ...history].map((caseData) => caseData.caseId).join('|')
  useEffect(() => {
    const ids = caseIds ? [...new Set(caseIds.split('|'))] : []
    const unsubscribes = ids.map((caseId) => {
      let initial = true
      return caseStore.subscribe(caseId, () => {
        if (initial) {
          initial = false
          return
        }
        refresh()
      })
    })
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe())
    }
  }, [caseIds, refresh])

  const selectStore = (nextStoreId: string) => {
    if (nextStoreId === storeId) return
    seenCount.current = null
    setShowNew(false)
    setFlash(null)
    setSelectedId(null)
    setMobileDetail(false)
    setPanel('queue')
    writeSelectedStoreId(nextStoreId)
    setStoreId(nextStoreId)
  }

  const selectCase = (caseId: string, nextPanel: 'queue' | 'history') => {
    setSelectedId(caseId)
    setPanel(nextPanel)
    setMobileDetail(true)
  }

  const showPanel = (nextPanel: 'queue' | 'history') => {
    setPanel(nextPanel)
    setMobileDetail(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const createSample = async (sampleId: string) => {
    setCreating(true)
    setFlash(null)
    try {
      const result = await createSampleMerchantRequest(storeId, sampleId)
      if (result.status === 'created') {
        setFlash(t('alerts.sampleCreated'))
        setSelectedId(result.caseId)
        setPanel('queue')
        setMobileDetail(false)
      } else if (result.status === 'already_waiting') {
        setFlash(t('alerts.sampleExists'))
        setSelectedId(result.caseId)
        setPanel('queue')
        setMobileDetail(false)
      } else {
        setFlash(t('alerts.sampleFailed'))
      }
      refresh()
    } finally {
      setCreating(false)
    }
  }

  const createAllSamples = async () => {
    setCreating(true)
    setFlash(null)
    try {
      const created = await createRemainingSamples(storeId)
      if (created.length === 0) setFlash(t('alerts.sampleNoneLeft'))
      else setFlash(t('alerts.sampleCreatedMany', { count: created.length }))
      setPanel('queue')
      setMobileDetail(false)
      if (created[0]) setSelectedId(created[0])
      refresh()
    } finally {
      setCreating(false)
    }
  }

  const resetSamples = () => {
    if (!window.confirm(t('queue.resetConfirm'))) return

    const selectedWasDemo = selectedId
      ? Boolean(caseStore.getCase(selectedId)?.demoCaseId)
      : false
    caseStore.resetAllDemoCases()
    if (selectedWasDemo) setSelectedId(null)
    setPanel('queue')
    setMobileDetail(false)
    setShowNew(false)
    setFlash(t('alerts.samplesReset'))
    refresh()
  }

  const selected = queue.find((caseData) => caseData.caseId === selectedId)
    ?? history.find((caseData) => caseData.caseId === selectedId)
    ?? null
  const overdue = queue.some((caseData) => isOverdueRequest(caseData, now))
  const showQueue = !narrow || (panel === 'queue' && !mobileDetail)
  const showHistory = !narrow || (panel === 'history' && !mobileDetail)
  const showDetail = !narrow || mobileDetail

  return (
    <main className={`merchant-page${mobileDetail ? ' is-detail-open' : ''}`}>
      <MerchantHeader />
      <div className="merchant-shell merchant-main">
        <StoreSwitcher storeId={storeId} onSelect={selectStore} />
        <MerchantAlerts
          showNew={showNew}
          showOverdue={overdue}
          flash={flash}
          onDismissNew={() => setShowNew(false)}
        />
        <div className={`merchant-layout is-${panel}`}>
          <div className="merchant-layout__lists">
            {showQueue && (
              <RequestQueue
                cases={queue}
                samples={samplesForStore(storeId)}
                waitingSampleIds={waitingSampleIds(storeId)}
                selectedId={selectedId}
                now={now}
                creating={creating}
                hasDemoCases={hasDemoCases}
                onSelect={(caseId) => selectCase(caseId, 'queue')}
                onCreateSample={(sampleId) => { void createSample(sampleId) }}
                onCreateAll={() => { void createAllSamples() }}
                onResetSamples={resetSamples}
              />
            )}
            {showHistory && (
              <ResponseHistory
                cases={history}
                selectedId={selectedId}
                onSelect={(caseId) => selectCase(caseId, 'history')}
              />
            )}
          </div>
          {showDetail && (
            <RequestDetail
              caseData={selected}
              showBack={mobileDetail}
              onBack={() => setMobileDetail(false)}
              onSaved={(message) => {
                setFlash(message)
                refresh()
              }}
              onError={(message) => setFlash(message)}
            />
          )}
        </div>
      </div>
      <nav className="merchant-bottom-nav" aria-label={t('nav.queue')}>
        <button
          type="button"
          className={panel === 'queue' && !mobileDetail ? 'is-active' : undefined}
          onClick={() => showPanel('queue')}
        >
          {t('nav.queue')}
        </button>
        <button
          type="button"
          className={panel === 'history' && !mobileDetail ? 'is-active' : undefined}
          onClick={() => showPanel('history')}
        >
          {t('nav.history')}
        </button>
      </nav>
    </main>
  )
}
