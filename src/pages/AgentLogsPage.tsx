import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Header } from '../components/common/Header'
import { caseStore, type CsCase, type ToolCallLog } from '../features/cs'
import '../styles/agent-logs.css'

type Translate = ReturnType<typeof useTranslation<'common'>>['t']
type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringList = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string')
  : []

const formatTime = (value: string, language: string) => new Intl.DateTimeFormat(language, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
}).format(new Date(value))

const translatedList = (
  values: string[],
  prefix: string,
  t: Translate,
) => values.map((value) => t(`${prefix}.${value}`, { defaultValue: value })).join(', ')

const toolObservation = (log: ToolCallLog, t: Translate) => {
  if (log.result.status === 'error') return log.result.error
  const data = log.result.data
  if (!isRecord(data) && !Array.isArray(data)) return t('agentLogs.success')

  if (log.toolName === 'get_order' && isRecord(data)) {
    const items = Array.isArray(data.items)
      ? data.items.filter(isRecord).map((item) => String(item.name ?? '')).filter(Boolean)
      : []
    return items.length > 0 ? items.join(', ') : t('agentLogs.success')
  }
  if (log.toolName === 'get_delivery' && isRecord(data)) {
    const status = typeof data.deliveryStatus === 'string' ? data.deliveryStatus : ''
    const delay = typeof data.delayMinutes === 'number' ? data.delayMinutes : null
    return [status, delay === null ? null : `${delay}분 지연`].filter(Boolean).join(' · ')
  }
  if (log.toolName === 'get_cs_history' && Array.isArray(data)) {
    return `기존 처리 이력 ${data.length}건`
  }
  if (log.toolName === 'get_policy' && isRecord(data)) {
    const allowed = translatedList(stringList(data.allowedActions), 'agentLogs.actionValue', t)
    const reason = typeof data.reason === 'string' ? data.reason : ''
    return [reason, allowed ? `허용: ${allowed}` : null].filter(Boolean).join(' · ')
  }
  if (log.toolName === 'check_risk' && isRecord(data)) {
    const flags = translatedList(stringList(data.flags), 'agentLogs.riskValue', t)
    const blocked = translatedList(stringList(data.blockedActions), 'agentLogs.actionValue', t)
    const reason = typeof data.reason === 'string' ? data.reason : ''
    return [flags || t('agentLogs.none'), blocked ? `자동 처리 제한: ${blocked}` : null, reason]
      .filter(Boolean)
      .join(' · ')
  }
  if (log.toolName === 'analyze_evidence') {
    return '첨부 자료를 후속 판단의 입력으로 기록했습니다.'
  }
  if (log.toolName === 'request_merchant_confirmation' && isRecord(data)) {
    return data.status === 'waiting' ? '매장 답변을 대기하고 있습니다.' : '매장 확인이 완료됐습니다.'
  }
  if (isRecord(data) && typeof data.action === 'string') {
    return t(`agentLogs.actionValue.${data.action}`, { defaultValue: data.action })
  }
  if (log.toolName === 'escalate_to_human') return '상담원 검토 대기열에 접수했습니다.'
  return t('agentLogs.success')
}

export function AgentLogsPage() {
  const { t, i18n } = useTranslation('common')
  const [cases, setCases] = useState<CsCase[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setCases(caseStore.getAllCases().sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ))
  }, [])

  useEffect(() => {
    refresh()
    const interval = window.setInterval(refresh, 2_000)
    return () => window.clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    if (cases.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !cases.some((caseData) => caseData.caseId === selectedId)) {
      setSelectedId(cases[0].caseId)
    }
  }, [cases, selectedId])

  const selected = cases.find((caseData) => caseData.caseId === selectedId) ?? null
  const timeline = useMemo(() => {
    if (!selected) return []
    return [
      ...selected.history.map((entry) => ({
        id: entry.id,
        at: entry.createdAt,
        kind: 'event' as const,
        title: t(`agentLogs.event.${entry.event}`, { defaultValue: entry.event }),
        detail: entry.detail || [entry.fromStatus, entry.toStatus].filter(Boolean).join(' → '),
        status: undefined,
        step: undefined,
      })),
      ...selected.toolHistory.map((entry) => ({
        id: entry.id,
        at: entry.completedAt,
        kind: 'tool' as const,
        title: t(`agentLogs.tool.${entry.toolName}`, { defaultValue: entry.toolName }),
        detail: toolObservation(entry, t),
        status: entry.result.status,
        step: entry.step,
      })),
    ].sort((left, right) => left.at.localeCompare(right.at))
  }, [selected, t])

  return (
    <div className="agent-logs-page">
      <Header />
      <main className="agent-logs-shell shell">
        <section className="agent-logs-intro">
          <span>{t('agentLogs.eyebrow')}</span>
          <h1>{t('agentLogs.title')}</h1>
          <p>{t('agentLogs.description')}</p>
        </section>

        {cases.length === 0 ? (
          <section className="agent-logs-empty">{t('agentLogs.empty')}</section>
        ) : (
          <div className="agent-logs-layout">
            <aside className="agent-case-panel">
              <div className="agent-case-panel__heading">
                <h2>{t('agentLogs.caseList')}</h2>
                <span>{t('agentLogs.caseCount', { count: cases.length })}</span>
              </div>
              <div className="agent-case-list">
                {cases.map((caseData) => (
                  <button
                    key={caseData.caseId}
                    type="button"
                    className={caseData.caseId === selectedId ? 'is-selected' : undefined}
                    onClick={() => setSelectedId(caseData.caseId)}
                  >
                    <span className="agent-case-list__top">
                      <strong>{caseData.orderId}</strong>
                      <i>{t(`agentLogs.issue.${caseData.issueType}`)}</i>
                    </span>
                    <span className="agent-case-list__claim">{caseData.customerClaim}</span>
                    <span className="agent-case-list__meta">
                      {t(`agentLogs.statusValue.${caseData.status}`)} · {formatTime(caseData.updatedAt, i18n.language)}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="agent-log-detail">
              {!selected ? <p>{t('agentLogs.selectCase')}</p> : (
                <>
                  <header className="agent-log-detail__header">
                    <div>
                      <span>{selected.caseId}</span>
                      <h2>{selected.orderId} · {t(`agentLogs.issue.${selected.issueType}`)}</h2>
                    </div>
                    <i>{t(`agentLogs.statusValue.${selected.status}`)}</i>
                  </header>

                  <section className="agent-log-claim">
                    <span>{t('agentLogs.customerClaim')}</span>
                    <p>{selected.customerClaim}</p>
                  </section>

                  <section className="agent-log-current">
                    <h3>{t('agentLogs.currentDecision')}</h3>
                    <dl>
                      <div><dt>{t('agentLogs.status')}</dt><dd>{t(`agentLogs.statusValue.${selected.status}`)}</dd></div>
                      <div><dt>{t('agentLogs.decision')}</dt><dd>{selected.decision ? t(`agentLogs.decisionValue.${selected.decision}`) : t('agentLogs.pending')}</dd></div>
                      <div><dt>{t('agentLogs.finalAction')}</dt><dd>{selected.finalAction ? t(`agentLogs.actionValue.${selected.finalAction}`) : t('agentLogs.pending')}</dd></div>
                      <div><dt>{t('agentLogs.policy')}</dt><dd>{selected.appliedPolicy ?? t('agentLogs.none')}</dd></div>
                      <div><dt>{t('agentLogs.risk')}</dt><dd>{selected.riskFlags.length > 0 ? translatedList(selected.riskFlags, 'agentLogs.riskValue', t) : t('agentLogs.none')}</dd></div>
                    </dl>
                  </section>

                  <section className="agent-log-timeline">
                    <div className="agent-log-timeline__heading">
                      <h3>{t('agentLogs.timeline')}</h3>
                      <p>{t('agentLogs.timelineDescription')}</p>
                    </div>
                    <ol>
                      {timeline.map((entry) => (
                        <li key={entry.id} className={`is-${entry.kind}`}>
                          <span className="agent-log-timeline__marker" aria-hidden="true" />
                          <article>
                            <div className="agent-log-timeline__meta">
                              <span>{entry.kind === 'tool' ? t('agentLogs.toolAction') : t('agentLogs.caseEvent')}</span>
                              {entry.step && <span>{t('agentLogs.step', { count: entry.step })}</span>}
                              {entry.status && <span className={`is-${entry.status}`}>{t(`agentLogs.${entry.status}`)}</span>}
                              <time dateTime={entry.at}>{formatTime(entry.at, i18n.language)}</time>
                            </div>
                            <h4>{entry.title}</h4>
                            {entry.detail && <p>{entry.detail}</p>}
                          </article>
                        </li>
                      ))}
                    </ol>
                  </section>
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
