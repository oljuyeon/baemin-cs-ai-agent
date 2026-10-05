import {
  caseStore,
  type AgentAction,
  type AgentController,
  type CsCase,
} from '../cs'
import { decideNextAction } from './decisionEngine'
import { executeTool } from './toolExecutor'

const MAX_STEPS = 8

const requireCase = (caseId: string) => {
  const caseData = caseStore.getCase(caseId)
  if (!caseData) throw new Error(`Case ${caseId} was not found.`)
  return caseData
}

const isTerminal = (caseData: CsCase) =>
  caseData.status === 'AUTO_RESOLVED'
  || caseData.status === 'ESCALATED'
  || caseData.status === 'CLOSED'

const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase()

const enrichClaimedItem = (caseData: CsCase) => {
  if (caseData.claimedItemName || !caseData.order) return caseData
  const customerText = normalize(
    caseData.conversation
      .filter((message) => message.role === 'customer')
      .map((message) => message.content)
      .join(' '),
  )
  const item = caseData.order.items.find((candidate) =>
    customerText.includes(normalize(candidate.name)),
  )
  if (!item) return caseData
  return caseStore.updateCase(caseData.caseId, { claimedItemName: item.name })
}

const finish = (caseId: string, action: Extract<AgentAction, { type: 'FINISH' }>) => {
  const current = requireCase(caseId)
  const status = action.decision === 'AUTO_RESOLVE' ? 'AUTO_RESOLVED' : 'ESCALATED'

  caseStore.commitCase(caseId, {
    changes: {
      status,
      decision: action.decision,
      finalAction: action.finalAction,
      escalationReason: action.decision === 'ESCALATE'
        ? action.customerMessage
        : current.escalationReason,
      agentSummary: action.decision === 'ESCALATE'
        ? `Agent가 ${current.toolHistory.length}개의 Tool Observation을 확인한 뒤 Human CS 검토가 필요하다고 판단했습니다.`
        : current.agentSummary,
    },
    history: [{
      actor: 'agent',
      event: action.decision === 'ESCALATE' ? 'ESCALATED' : 'FINAL_ACTION_COMPLETED',
      fromStatus: current.status,
      toStatus: status,
      detail: action.customerMessage,
    }],
  })

  caseStore.appendConversation(caseId, 'agent', action.customerMessage)
  return requireCase(caseId)
}

const escalateAfterLimit = async (caseId: string) => {
  const current = requireCase(caseId)
  const reason = `Agent가 최대 ${MAX_STEPS}단계를 실행했지만 종료하지 못했습니다.`

  await executeTool(caseId, {
    type: 'CALL_TOOL',
    toolName: 'escalate_to_human',
    input: {
      caseId,
      reason,
      summary: `Tool ${current.toolHistory.length}회 실행 후 최대 step에 도달했습니다.`,
    },
  })

  return finish(caseId, {
    type: 'FINISH',
    decision: 'ESCALATE',
    finalAction: 'human_review',
    customerMessage: '자동 확인을 완료하지 못해 상담원이 이어서 확인합니다.',
  })
}

export const agentController: AgentController = {
  decideNextAction,

  async runNextStep(caseId: string) {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const current = enrichClaimedItem(requireCase(caseId))
      if (isTerminal(current)) return current

      if (
        current.status === 'WAITING_MERCHANT'
        && current.merchantConfirmation?.status !== 'completed'
      ) {
        return current
      }

      const action = await decideNextAction(current)

      if (action.type === 'CALL_TOOL') {
        await executeTool(caseId, action)
        continue
      }

      if (action.type === 'ASK_CUSTOMER') {
        caseStore.commitCase(caseId, {
          changes: {
            status: 'COLLECTING_INFO',
            decision: 'NEED_MORE_INFO',
          },
        })
        caseStore.appendConversation(caseId, 'agent', action.question)
        return requireCase(caseId)
      }

      if (action.type === 'ASK_MERCHANT') {
        caseStore.appendMerchantConversation(caseId, 'agent', action.question)
        return requireCase(caseId)
      }

      if (action.decision === 'ESCALATE') {
        await executeTool(caseId, {
          type: 'CALL_TOOL',
          toolName: 'escalate_to_human',
          input: {
            caseId,
            reason: action.customerMessage,
            summary: `Agent가 ${current.toolHistory.length}개의 Tool Observation을 확인했습니다.`,
          },
        })
      }

      return finish(caseId, action)
    }

    return escalateAfterLimit(caseId)
  },
}
