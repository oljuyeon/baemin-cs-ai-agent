import { caseStore } from '../cs'
import type { CsCase } from '../cs'
import type { IssueReassessment, MessageUnderstanding } from './nlu'

export const issueChangeLocked = (caseData: CsCase) => {
  if (caseData.status === 'ESCALATED' || caseData.status === 'CLOSED') return true
  if (
    caseData.finalAction === 'mock_coupon'
    || caseData.finalAction === 'mock_refund'
    || caseData.finalAction === 'mock_redelivery'
    || caseData.finalAction === 'human_review'
  ) return true
  if (caseData.merchantConfirmation) return true
  return caseData.toolHistory.some((entry) =>
    entry.result.status === 'success'
    && (
      entry.toolName === 'request_merchant_confirmation'
      || entry.toolName === 'refund'
      || entry.toolName === 'redelivery'
      || entry.toolName === 'escalate_to_human'
    ),
  )
}

export const issueClassificationStatus = (
  understanding: Pick<MessageUnderstanding, 'confidence' | 'issueAmbiguous'>,
  explicitlyConfirmed: boolean,
) => explicitlyConfirmed || (!understanding.issueAmbiguous && understanding.confidence >= 0.75)
  ? 'CONFIRMED' as const
  : 'PROVISIONAL' as const

export const correctCaseIssue = (
  caseData: CsCase,
  reassessment: IssueReassessment,
  customerClaim: string,
  correctionMode: 'automatic' | 'customer_confirmed' = 'customer_confirmed',
) => caseStore.commitCase(caseData.caseId, {
  changes: {
    issueType: reassessment.issueType,
    issueClassificationStatus: 'CONFIRMED',
    issueConfidence: reassessment.confidence,
    issueVersion: caseData.issueVersion + 1,
    issueClarificationQuestion: undefined,
    customerClaim,
    customerDetailRequestedAt: undefined,
    customerDetailProvidedAt: undefined,
    claimedItemName: reassessment.issueType === 'missing_item'
      ? reassessment.claimedItemName
      : undefined,
    status: 'CHECKING_DATA',
    decision: undefined,
    liability: 'UNKNOWN',
    resolutionPreference: undefined,
    appliedPolicy: undefined,
    riskFlags: [],
    finalAction: undefined,
    finalActionResult: undefined,
    escalationCode: undefined,
    escalationReason: undefined,
    agentSummary: undefined,
    humanHandoffSummary: undefined,
  },
  history: [{
    actor: 'agent',
    event: 'ISSUE_TYPE_CHANGED',
    fromStatus: caseData.status,
    toStatus: 'CHECKING_DATA',
    detail: `${caseData.issueType}에서 ${reassessment.issueType}으로 ${correctionMode === 'automatic' ? '대화 근거로 자동 정정' : '고객 확인 후 정정'}`,
  }],
})
