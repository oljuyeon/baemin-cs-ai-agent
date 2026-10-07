import {
  caseStore,
  type AgentAction,
  type AgentController,
  type CsCase,
} from '../cs'
import { decideNextAction } from './decisionEngine'
import { resolveOrderItem } from './nlu'
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

const buildHumanCsSummary = (caseData: CsCase, failureReason: string) => [
  `caseId=${caseData.caseId}`,
  `customerId=${caseData.customerId}`,
  `orderId=${caseData.orderId}`,
  `issueType=${caseData.issueType}`,
  `고객 원문=${caseData.customerClaim}`,
  `주문 사실=${caseData.order
    ? `${caseData.order.items.map((item) => `${item.name} ${item.price}원`).join(', ')} / 총 ${caseData.order.totalAmount}원`
    : '조회 실패'}`,
  `배달 사실=${caseData.delivery
    ? `${caseData.delivery.deliveryStatus}, 지연 ${caseData.delivery.delayMinutes}분`
    : '없음'}`,
  `증빙=${caseData.evidenceAnalysis?.map((item) => `${item.assessment}: ${item.observation}`).join(' | ') || caseData.evidenceUrls.join(', ') || '없음'}`,
  `매장 응답=${caseData.merchantConfirmation?.response ?? '없음'}${caseData.merchantConfirmation?.comment ? ` (${caseData.merchantConfirmation.comment})` : ''}`,
  `귀책 추정=${caseData.liability}`,
  `Risk=${caseData.riskFlags.join(', ') || '없음'}`,
  `Policy=${caseData.appliedPolicy ?? '미확인'}`,
  `고객 희망=${caseData.resolutionPreference ?? '미정'}`,
  `실행 Tool=${caseData.toolHistory.map((item) => `${item.toolName}:${item.result.status}`).join(', ') || '없음'}`,
  `완료 Action=${caseData.finalActionResult?.action ?? '없음'}`,
  `자동 처리 실패 이유=${failureReason}`,
  'Human CS 결정 필요=환불·재배달·추가 확인 중 적절한 최종 조치',
].join('\n')

const enrichClaimedItem = (caseData: CsCase) => {
  if (caseData.claimedItemName || !caseData.order) return caseData
  const customerText =
    caseData.conversation
      .filter((message) => message.role === 'customer')
      .map((message) => message.content)
      .join(' ')
  const itemName = resolveOrderItem(customerText, caseData.order.items)
  if (!itemName) return caseData
  return caseStore.updateCase(caseData.caseId, { claimedItemName: itemName })
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
        ? buildHumanCsSummary(current, action.customerMessage)
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
        if (current.issueType === 'delivery_delay') {
          caseStore.updateCase(caseId, {
            status: 'CHECKING_DATA',
            decision: undefined,
            merchantConfirmation: undefined,
          })
          continue
        }

        const lastMessage = current.conversation[current.conversation.length - 1]
        if (lastMessage?.role === 'customer') {
          caseStore.appendConversation(
            caseId,
            'agent',
            '매장 확인 요청을 전달했고 현재 답변을 기다리고 있습니다. 답변이 오면 바로 이어서 안내할게요.',
          )
          return requireCase(caseId)
        }
        return current
      }

      const action = await decideNextAction(current)

      if (action.type === 'CALL_TOOL') {
        const updated = await executeTool(caseId, action)
        if (
          action.toolName === 'request_merchant_confirmation'
          && updated.status === 'WAITING_MERCHANT'
        ) {
          caseStore.appendConversation(
            caseId,
            'agent',
            '매장에 확인 요청을 보냈습니다. 답변이 오면 이 대화에서 바로 이어서 안내할게요.',
          )
          return requireCase(caseId)
        }
        continue
      }

      if (action.type === 'ASK_CUSTOMER') {
        caseStore.commitCase(caseId, {
          changes: {
            status: action.waitStatus ?? 'COLLECTING_INFO',
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
            summary: buildHumanCsSummary(current, action.customerMessage),
          },
        })
      }

      return finish(caseId, action)
    }

    return escalateAfterLimit(caseId)
  },
}
