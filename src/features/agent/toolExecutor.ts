import {
  agentTools,
  caseStore,
  inferLiability,
  type AgentAction,
  type CaseChanges,
  type CsCase,
  type OrderItem,
  type ToolResult,
} from '../cs'
import { analyzeEvidenceWithOpenAI } from './remoteAgent'

type ToolAction = Extract<AgentAction, { type: 'CALL_TOOL' }>

const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase()

const findClaimedItem = (caseData: CsCase, items: OrderItem[]) => {
  const claim = normalize(caseData.customerClaim)
  return items.find((item) => claim.includes(normalize(item.name)))?.name
}

const requireCase = (caseId: string) => {
  const caseData = caseStore.getCase(caseId)
  if (!caseData) throw new Error(`Case ${caseId} was not found.`)
  return caseData
}

export async function executeTool(caseId: string, action: ToolAction): Promise<CsCase> {
  const current = requireCase(caseId)
  const startedAt = new Date().toISOString()
  let result: ToolResult<unknown>
  const changes: CaseChanges = {}

  switch (action.toolName) {
    case 'get_order': {
      const input = action.input as { orderId: string }
      const toolResult = await agentTools.getOrder(input)
      result = toolResult
      if (toolResult.status === 'success') {
        changes.order = toolResult.data
        changes.claimedItemName = current.claimedItemName
          ?? findClaimedItem(current, toolResult.data.items)
        changes.status = 'CHECKING_DATA'
      }
      break
    }
    case 'get_delivery': {
      const input = action.input as { orderId: string }
      const toolResult = await agentTools.getDelivery(input)
      result = toolResult
      if (toolResult.status === 'success') {
        changes.delivery = toolResult.data
        changes.liability = inferLiability({ ...current, delivery: toolResult.data })
        changes.status = 'CHECKING_DATA'
      }
      break
    }
    case 'get_cs_history': {
      const input = action.input as { customerId: string; orderId: string }
      const toolResult = await agentTools.getCsHistory(input)
      result = toolResult
      if (toolResult.status === 'success') {
        changes.csHistory = toolResult.data
        changes.status = 'CHECKING_DATA'
      }
      break
    }
    case 'get_policy': {
      const toolResult = await agentTools.getPolicy({ caseData: current })
      result = toolResult
      if (toolResult.status === 'success') {
        changes.appliedPolicy = toolResult.data.policyId
        changes.status = 'POLICY_CHECK'
      }
      break
    }
    case 'check_risk': {
      const toolResult = await agentTools.checkRisk({ caseData: current })
      result = toolResult
      if (toolResult.status === 'success') {
        changes.riskFlags = toolResult.data.flags
        changes.status = 'RISK_CHECK'
      }
      break
    }
    case 'analyze_evidence': {
      const input = action.input as { evidenceUrl: string }
      const remoteAnalysis = await analyzeEvidenceWithOpenAI(current, input.evidenceUrl)
      const toolResult = remoteAnalysis
        ? { status: 'success' as const, data: remoteAnalysis }
        : await agentTools.analyzeEvidence(input)
      result = toolResult
      if (toolResult.status === 'success') {
        const previous = current.evidenceAnalysis ?? []
        changes.evidenceAnalysis = [
          ...previous.filter((item) => item.evidenceUrl !== toolResult.data.evidenceUrl),
          toolResult.data,
        ]
      }
      break
    }
    case 'request_merchant_confirmation': {
      const input = action.input as Parameters<typeof agentTools.requestMerchantConfirmation>[0]
      const toolResult = await agentTools.requestMerchantConfirmation(input)
      result = toolResult
      if (toolResult.status === 'success') {
        changes.merchantConfirmation = {
          ...toolResult.data,
          requestedBy: 'agent',
          conversation: [
            ...(current.merchantConfirmation?.conversation ?? []),
            ...toolResult.data.conversation,
          ],
        }
        changes.status = 'WAITING_MERCHANT'
        changes.decision = 'WAITING_MERCHANT'
      }
      break
    }
    case 'refund': {
      const input = action.input as Parameters<typeof agentTools.refund>[0]
      const toolResult = await agentTools.refund(input)
      result = toolResult
      if (toolResult.status === 'success') changes.finalActionResult = toolResult.data
      break
    }
    case 'redelivery': {
      const input = action.input as Parameters<typeof agentTools.redelivery>[0]
      const toolResult = await agentTools.redelivery(input)
      result = toolResult
      if (toolResult.status === 'success') changes.finalActionResult = toolResult.data
      break
    }
    case 'issue_coupon': {
      const input = action.input as Parameters<typeof agentTools.issueCoupon>[0]
      const toolResult = await agentTools.issueCoupon(input)
      result = toolResult
      if (toolResult.status === 'success') changes.finalActionResult = toolResult.data
      break
    }
    case 'escalate_to_human': {
      const input = action.input as Parameters<typeof agentTools.escalateToHuman>[0]
      result = await agentTools.escalateToHuman(input)
      break
    }
  }

  const completedAt = new Date().toISOString()
  return caseStore.commitCase(caseId, {
    changes,
    toolHistory: [{
      issueVersion: current.issueVersion,
      toolName: action.toolName,
      input: action.input,
      result,
      startedAt,
      completedAt,
    }],
  })
}
