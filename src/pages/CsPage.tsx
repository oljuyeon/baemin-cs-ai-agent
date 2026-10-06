import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { caseStore, type CsCase } from '../features/cs'
import { CS_AGENT_ID, historyForCs, isCsInProgress, isOverdueEscalation, markCsInProgress, queueForCs } from '../features/csDesk/desk'
import { CsAlerts } from '../components/cs/CsAlerts'
import { CsHeader } from '../components/cs/CsHeader'
import { EscalationDetail } from '../components/cs/EscalationDetail'
import { EscalationQueue } from '../components/cs/EscalationQueue'
import { ResolutionHistory } from '../components/cs/ResolutionHistory'
import '../styles/cs.css'

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

export function CsPage() {
  const { t } = useTranslation('cs')
  const [queue, setQueue] = useState<CsCase[]>([])
  const [history, setHistory] = useState<CsCase[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panel, setPanel] = useState<'queue' | 'history'>('queue')
  const [mobileDetail, setMobileDetail] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const narrow = useNarrowLayout()
  const seenCount = useRef<number | null>(null)
  const appliedLink = useRef<string | null>(null)
  const [searchParams] = useSearchParams()
  const linkedCaseId = searchParams.get('case')

  const refresh = useCallback(() => {
    const nextQueue = queueForCs()
    const nextHistory = historyForCs()
    if (seenCount.current !== null && nextQueue.length > seenCount.current) setShowNew(true)
    seenCount.current = nextQueue.length
    setQueue(nextQueue)
    setHistory(nextHistory)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!linkedCaseId || appliedLink.current === linkedCaseId) return
    const inQueue = queue.some((caseData) => caseData.caseId === linkedCaseId)
    const inHistory = history.some((caseData) => caseData.caseId === linkedCaseId)
    if (!inQueue && !inHistory) return
    appliedLink.current = linkedCaseId
    setSelectedId(linkedCaseId)
    setPanel(inQueue ? 'queue' : 'history')
    setMobileDetail(true)
  }, [linkedCaseId, queue, history])

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

  const selectCase = (caseId: string, nextPanel: 'queue' | 'history') => {
    if (nextPanel === 'queue') markCsInProgress(caseId)
    setSelectedId(caseId)
    setPanel(nextPanel)
    setMobileDetail(true)
  }

  const showPanel = (nextPanel: 'queue' | 'history') => {
    setPanel(nextPanel)
    setMobileDetail(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const selected = queue.find((caseData) => caseData.caseId === selectedId)
    ?? history.find((caseData) => caseData.caseId === selectedId)
    ?? null
  const overdue = queue.some((caseData) => isOverdueEscalation(caseData, now) && !isCsInProgress(caseData.caseId))
  const showQueue = !narrow || (panel === 'queue' && !mobileDetail)
  const showHistory = !narrow || (panel === 'history' && !mobileDetail)
  const showDetail = !narrow || mobileDetail

  return (
    <main className={`cs-page${mobileDetail ? ' is-detail-open' : ''}`}>
      <CsHeader />
      <div className="cs-shell cs-main">
        <section className="cs-intro">
          <span>{t('intro.eyebrow')}</span>
          <h1>{t('intro.title')}</h1>
          <p>{t('intro.description')}</p>
          <p>{t('intro.agent', { id: CS_AGENT_ID })}</p>
        </section>
        <CsAlerts
          showNew={showNew}
          showOverdue={overdue}
          flash={flash}
          onDismissNew={() => setShowNew(false)}
        />
        <div className={`cs-layout is-${panel}`}>
          <div className="cs-layout__lists">
            {showQueue && (
              <EscalationQueue
                cases={queue}
                selectedId={selectedId}
                now={now}
                onSelect={(caseId) => selectCase(caseId, 'queue')}
              />
            )}
            {showHistory && (
              <ResolutionHistory
                cases={history}
                selectedId={selectedId}
                onSelect={(caseId) => selectCase(caseId, 'history')}
              />
            )}
          </div>
          {showDetail && (
            <EscalationDetail
              caseData={selected}
              showBack={mobileDetail}
              onBack={() => setMobileDetail(false)}
              onSaved={(message) => {
                setFlash(message)
                setPanel('history')
                setMobileDetail(false)
                refresh()
              }}
              onError={(message) => setFlash(message)}
            />
          )}
        </div>
      </div>
      <nav className="cs-bottom-nav" aria-label={t('nav.queue')}>
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
