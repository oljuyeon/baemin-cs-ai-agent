import { useTranslation } from 'react-i18next'
import type { CsCase, ToolCallLog } from '../../features/cs'

interface Props {
  caseData: CsCase
}

type Translate = ReturnType<typeof useTranslation<'cs'>>['t']
type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringValue = (value: unknown) => typeof value === 'string' ? value : undefined
const numberValue = (value: unknown) => typeof value === 'number' ? value : undefined
const stringList = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const successData = (log: ToolCallLog) =>
  log.result.status === 'success' ? log.result.data : undefined

const latestSuccess = (caseData: CsCase, toolName: ToolCallLog['toolName']) =>
  [...caseData.toolHistory]
    .reverse()
    .find((log) => log.toolName === toolName && log.result.status === 'success')

const formatMoney = (amount: number, language: string) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(amount)

const formatWhen = (value: string, language: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

const formatDuration = (log: ToolCallLog, t: Translate) => {
  const duration = Math.max(0, new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime())
  if (!Number.isFinite(duration)) return null
  return duration < 1000
    ? t('detail.review.durationMs', { count: duration })
    : t('detail.review.durationSec', { count: (duration / 1000).toFixed(1) })
}

const formatPrimitive = (value: unknown, t: Translate) => {
  if (value === null || value === undefined || value === '') return t('detail.review.none')
  if (typeof value === 'boolean') return value ? t('detail.review.yes') : t('detail.review.no')
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.length > 0 ? value.map(String).join(', ') : t('detail.review.none')
  return JSON.stringify(value)
}

const inputRows = (input: unknown, t: Translate) => {
  if (!isRecord(input)) return [{ label: t('detail.review.input'), value: formatPrimitive(input, t) }]

  const rows: Array<{ label: string; value: string }> = []
  Object.entries(input).forEach(([key, value]) => {
    if (key === 'caseData' && isRecord(value)) {
      const identityKeys = ['caseId', 'orderId', 'customerId', 'storeId', 'issueType', 'status']
      identityKeys.forEach((identityKey) => {
        if (value[identityKey] !== undefined) {
          rows.push({
            label: t(`detail.review.field.${identityKey}`, { defaultValue: identityKey }),
            value: formatPrimitive(value[identityKey], t),
          })
        }
      })
      return
    }
    rows.push({
      label: t(`detail.review.field.${key}`, { defaultValue: key }),
      value: formatPrimitive(value, t),
    })
  })
  return rows
}

const resultRows = (log: ToolCallLog, t: Translate, language: string) => {
  if (log.result.status === 'error') {
    return [{ label: t('detail.review.errorReason'), value: log.result.error }]
  }

  const data = log.result.data
  if (!isRecord(data) && !Array.isArray(data)) {
    return [{ label: t('detail.review.result'), value: formatPrimitive(data, t) }]
  }

  switch (log.toolName) {
    case 'get_order': {
      const record = isRecord(data) ? data : {}
      const items = Array.isArray(record.items)
        ? record.items
          .filter(isRecord)
          .map((item) => stringValue(item.name))
          .filter((item): item is string => Boolean(item))
        : []
      const total = numberValue(record.totalAmount)
      return [
        { label: t('detail.review.orderStatus'), value: t(`orderStatus.${stringValue(record.orderStatus)}`, { defaultValue: stringValue(record.orderStatus) ?? t('detail.review.none') }) },
        { label: t('detail.review.items'), value: items.length > 0 ? items.join(', ') : t('detail.review.none') },
        { label: t('detail.review.total'), value: total === undefined ? t('detail.review.none') : formatMoney(total, language) },
      ]
    }
    case 'get_delivery': {
      const record = isRecord(data) ? data : {}
      const delay = numberValue(record.delayMinutes)
      return [
        { label: t('detail.review.deliveryStatus'), value: stringValue(record.deliveryStatus) ?? t('detail.review.none') },
        { label: t('detail.review.delay'), value: delay === undefined ? t('detail.review.none') : t('detail.delay', { minutes: delay }) },
        { label: t('detail.review.deliveredAt'), value: stringValue(record.deliveredAt) ? formatWhen(String(record.deliveredAt), language) : t('detail.review.none') },
      ]
    }
    case 'get_cs_history': {
      const history = Array.isArray(data) ? data.filter(isRecord) : []
      if (history.length === 0) {
        return [{ label: t('detail.review.history'), value: t('detail.review.noHistory') }]
      }
      return history.map((entry, index) => {
        const action = stringValue(entry.action)
        const issueType = stringValue(entry.issueType)
        const amount = numberValue(entry.amount)
        const status = stringValue(entry.status)
        const parts = [
          issueType ? t(`issue.${issueType}`, { defaultValue: issueType }) : null,
          action ? t(`finalAction.${action}`, { defaultValue: action }) : null,
          status ? t(`detail.review.historyStatus.${status}`, { defaultValue: status }) : null,
          amount === undefined ? null : formatMoney(amount, language),
        ].filter((item): item is string => Boolean(item))
        return { label: t('detail.review.historyItem', { count: index + 1 }), value: parts.join(' · ') }
      })
    }
    case 'get_policy': {
      const record = isRecord(data) ? data : {}
      const policyId = stringValue(record.policyId)
      const allowedActions = stringList(record.allowedActions)
      const constraints = stringList(record.constraints)
      return [
        { label: t('detail.review.policy'), value: policyId ? t(`policy.${policyId}`, { defaultValue: policyId }) : t('detail.review.none') },
        { label: t('detail.review.allowedActions'), value: allowedActions.length > 0 ? allowedActions.map((item) => t(`finalAction.${item}`, { defaultValue: item })).join(', ') : t('detail.review.none') },
        { label: t('detail.review.constraints'), value: constraints.length > 0 ? constraints.join(' / ') : t('detail.review.noConstraints') },
        { label: t('detail.review.judgmentReason'), value: stringValue(record.reason) ?? t('detail.review.none') },
      ]
    }
    case 'check_risk': {
      const record = isRecord(data) ? data : {}
      const flags = stringList(record.flags)
      const blockedActions = stringList(record.blockedActions)
      return [
        { label: t('detail.review.riskFlags'), value: flags.length > 0 ? flags.map((item) => t(`risk.${item}`, { defaultValue: item })).join(', ') : t('detail.noRisk') },
        { label: t('detail.review.blockedActions'), value: blockedActions.length > 0 ? blockedActions.map((item) => t(`finalAction.${item}`, { defaultValue: item })).join(', ') : t('detail.review.none') },
        { label: t('detail.review.judgmentReason'), value: stringValue(record.reason) ?? t('detail.review.none') },
      ]
    }
    case 'analyze_evidence': {
      const record = isRecord(data) ? data : {}
      const assessment = stringValue(record.assessment)
      const limitations = stringList(record.limitations)
      return [
        { label: t('detail.review.assessment'), value: assessment ? t(`detail.review.assessmentValue.${assessment}`, { defaultValue: assessment }) : t('detail.review.none') },
        { label: t('detail.review.observation'), value: stringValue(record.observation) ?? t('detail.review.none') },
        { label: t('detail.review.limitations'), value: limitations.length > 0 ? limitations.join(' / ') : t('detail.review.none') },
      ]
    }
    case 'request_merchant_confirmation': {
      const record = isRecord(data) ? data : {}
      const response = stringValue(record.response)
      return [
        { label: t('detail.review.requestStatus'), value: stringValue(record.status) === 'completed' ? t('detail.review.completed') : t('detail.review.waiting') },
        { label: t('detail.review.merchantResponse'), value: response ? t(`merchantResponse.${response}`, { defaultValue: response }) : t('merchantResponse.none') },
        { label: t('detail.review.merchantComment'), value: stringValue(record.comment) ?? t('detail.review.none') },
      ]
    }
    case 'refund':
    case 'redelivery': {
      const record = isRecord(data) ? data : {}
      const action = stringValue(record.action)
      return [
        { label: t('detail.review.action'), value: action ? t(`finalAction.${action}`, { defaultValue: action }) : t('detail.review.none') },
        { label: t('detail.review.actionId'), value: stringValue(record.actionId) ?? t('detail.review.none') },
        { label: t('detail.review.completedAt'), value: stringValue(record.completedAt) ? formatWhen(String(record.completedAt), language) : t('detail.review.none') },
      ]
    }
    case 'escalate_to_human': {
      const record = isRecord(data) ? data : {}
      return [
        { label: t('detail.review.queueStatus'), value: stringValue(record.status) === 'queued' ? t('detail.review.queued') : formatPrimitive(record.status, t) },
        { label: t('detail.review.queueId'), value: stringValue(record.queueId) ?? t('detail.review.none') },
        { label: t('detail.review.queuedAt'), value: stringValue(record.createdAt) ? formatWhen(String(record.createdAt), language) : t('detail.review.none') },
      ]
    }
    default:
      return Object.entries(isRecord(data) ? data : {}).map(([key, value]) => ({
        label: t(`detail.review.field.${key}`, { defaultValue: key }),
        value: formatPrimitive(value, t),
      }))
  }
}

const rawJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const isGenericAgentSummary = (summary: string) =>
  /Tool Observation|Tool \d+회|개의 Tool/i.test(summary)

function buildDecisionReasons(caseData: CsCase, t: Translate) {
  const reasons: string[] = []
  const storedSummary = caseData.agentSummary?.trim()
  if (
    storedSummary
    && storedSummary !== caseData.escalationReason?.trim()
    && !isGenericAgentSummary(storedSummary)
  ) reasons.push(storedSummary)

  const merchant = caseData.merchantConfirmation
  if (merchant?.response) {
    const response = t(`merchantResponse.${merchant.response}`)
    reasons.push(t('detail.review.summaryMerchant', {
      response,
      comment: merchant.comment ? ` · ${merchant.comment}` : '',
    }))
  } else if (merchant?.status === 'waiting') {
    reasons.push(t('detail.review.summaryMerchantWaiting'))
  }

  const evidence = caseData.evidenceAnalysis?.filter((item) => item.observation) ?? []
  evidence.forEach((item) => reasons.push(t('detail.review.summaryEvidence', { observation: item.observation })))

  const policyLog = latestSuccess(caseData, 'get_policy')
  const policyData = policyLog ? successData(policyLog) : undefined
  if (isRecord(policyData) && stringValue(policyData.reason)) {
    reasons.push(t('detail.review.summaryPolicy', { reason: stringValue(policyData.reason) }))
  }

  const riskLog = latestSuccess(caseData, 'check_risk')
  const riskData = riskLog ? successData(riskLog) : undefined
  if (isRecord(riskData) && stringValue(riskData.reason)) {
    reasons.push(t('detail.review.summaryRisk', { reason: stringValue(riskData.reason) }))
  }

  const failed = caseData.toolHistory.filter((log) => log.result.status === 'error')
  if (failed.length > 0) {
    reasons.push(t('detail.review.summaryFailed', {
      tools: failed.map((log) => t(`detail.review.tool.${log.toolName}`, { defaultValue: log.toolName })).join(', '),
    }))
  }

  return [...new Set(reasons)].slice(0, 6)
}

export function AgentDecisionSummary({ caseData }: Props) {
  const { t } = useTranslation('cs')
  const reasons = buildDecisionReasons(caseData, t)

  return (
    <section className="cs-summary">
      <p>{t('detail.summaryLabel')}</p>
      <strong>{t('detail.review.summaryLead')}</strong>
      {reasons.length > 0 ? (
        <ul>
          {reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      ) : (
        <span>{caseData.agentSummary || t('detail.noSummary')}</span>
      )}
    </section>
  )
}

export function AgentReviewTrace({ caseData }: Props) {
  const { t, i18n } = useTranslation('cs')
  const successful = caseData.toolHistory.filter((log) => log.result.status === 'success').length
  const failed = caseData.toolHistory.length - successful

  if (caseData.toolHistory.length === 0) return null

  return (
    <details className="cs-trace">
      <summary>{t('detail.trace', { count: caseData.toolHistory.length })}</summary>
      <div className="cs-trace__overview">
        <span className="is-success">{t('detail.review.successCount', { count: successful })}</span>
        <span className={failed > 0 ? 'is-error' : undefined}>{t('detail.review.errorCount', { count: failed })}</span>
      </div>
      {failed > 0 && <p className="cs-trace__warning">{t('detail.review.failedWarning')}</p>}
      <ol className="cs-trace__list">
        {caseData.toolHistory.map((log) => {
          const duration = formatDuration(log, t)
          return (
            <li key={log.id}>
              <details className={`cs-trace__item ${log.result.status === 'error' ? 'is-error' : ''}`}>
                <summary>
                  <span className="cs-trace__step">{log.step}</span>
                  <span className="cs-trace__name">{t(`detail.review.tool.${log.toolName}`, { defaultValue: log.toolName })}</span>
                  <span className={`cs-trace__status ${log.result.status === 'success' ? 'is-success' : 'is-error'}`}>
                    {log.result.status === 'success' ? t('detail.traceOk') : t('detail.traceError')}
                  </span>
                </summary>
                <div className="cs-trace__body">
                  <p className="cs-trace__time">
                    {formatWhen(log.completedAt, i18n.language)}
                    {duration ? ` · ${duration}` : ''}
                  </p>
                  <section>
                    <h4>{t('detail.review.checkedTarget')}</h4>
                    <dl>
                      {inputRows(log.input, t).map((row, index) => (
                        <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>
                      ))}
                    </dl>
                  </section>
                  <section>
                    <h4>{t('detail.review.keyResult')}</h4>
                    <dl>
                      {resultRows(log, t, i18n.language).map((row, index) => (
                        <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>
                      ))}
                    </dl>
                  </section>
                  <details className="cs-trace__raw">
                    <summary>{t('detail.review.raw')}</summary>
                    <h5>{t('detail.review.rawInput')}</h5>
                    <pre>{rawJson(log.input)}</pre>
                    <h5>{t('detail.review.rawResult')}</h5>
                    <pre>{rawJson(log.result)}</pre>
                  </details>
                </div>
              </details>
            </li>
          )
        })}
      </ol>
    </details>
  )
}
