import type { CsCase, ToolCallLog, ToolName, ToolResult } from '../cs'

const issueScopedTools = new Set<ToolName>(['get_policy', 'check_risk'])

const belongsToCurrentIssue = (caseData: CsCase, log: ToolCallLog) =>
  !issueScopedTools.has(log.toolName)
  || (log.issueVersion ?? 1) === (caseData.issueVersion ?? 1)

export const wasToolCalled = (caseData: CsCase, toolName: ToolName) =>
  caseData.toolHistory.some((log) =>
    log.toolName === toolName && belongsToCurrentIssue(caseData, log),
  )

export const latestToolResult = <T>(caseData: CsCase, toolName: ToolName) =>
  [...caseData.toolHistory]
    .reverse()
    .find((log) =>
      log.toolName === toolName && belongsToCurrentIssue(caseData, log),
    )
    ?.result as ToolResult<T> | undefined

export const currentIssueToolHistory = (caseData: CsCase) =>
  caseData.toolHistory.filter((log) => belongsToCurrentIssue(caseData, log))
