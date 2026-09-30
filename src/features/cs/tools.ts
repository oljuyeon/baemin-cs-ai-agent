import { caseStore } from './caseStore'
import {
  findCsHistory,
  findDelivery,
  findOrder,
} from './demoData'
import { evaluatePolicy } from './policy'
import { evaluateRisk } from './policy'
import type {
  AgentTools,
  CaseCommit,
  CaseHistoryDraft,
  CsCase,
  HumanEscalationResult,
  MerchantConfirmationData,
  MockActionResult,
  OrderData,
  DeliveryData,
  CsHistoryData,
  EvidenceAnalysis,
  RiskResult,
  ToolName,
  ToolResult,
} from './types'

const nowIso = () => new Date().toISOString()
const newId = (prefix: string) => {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `${prefix}-${suffix}`
}

interface ToolOperation<T> {
  data: T
  changes?: CaseCommit['changes']
  history?: CaseHistoryDraft[]
}

class MockAgentTools implements AgentTools {
  async getOrder(input: { orderId: string }) {
    const caseId = this.caseIdForOrder(input.orderId)
    if (!caseId) return this.caseNotFoundForOrder<OrderData>(input.orderId)
    return this.run<OrderData>(caseId, 'get_order', input, () => {
      const order = findOrder(input.orderId)
      if (!order) throw new Error(`Order ${input.orderId} was not found.`)
      return { data: order, changes: { order } }
    })
  }

  async getDelivery(input: { orderId: string }) {
    const caseId = this.caseIdForOrder(input.orderId)
    if (!caseId) return this.caseNotFoundForOrder<DeliveryData>(input.orderId)
    return this.run<DeliveryData>(caseId, 'get_delivery', input, () => {
      const delivery = findDelivery(input.orderId)
      if (!delivery) throw new Error(`Delivery for order ${input.orderId} was not found.`)
      return { data: delivery, changes: { delivery } }
    })
  }

  async getCsHistory(input: { customerId: string; orderId: string }) {
    const caseId = this.caseIdForOrder(input.orderId)
    if (!caseId) return this.caseNotFoundForOrder<CsHistoryData[]>(input.orderId)
    return this.run<CsHistoryData[]>(caseId, 'get_cs_history', input, () => {
      const csHistory = findCsHistory(input.customerId, input.orderId)
      return { data: csHistory, changes: { csHistory } }
    })
  }

  async getPolicy(input: { caseData: CsCase }) {
    const caseId = input.caseData.caseId
    return this.run(caseId, 'get_policy', { caseId }, () => {
      const current = caseStore.getCase(caseId) ?? input.caseData
      const policy = evaluatePolicy(current)
      return {
        data: policy,
        changes: {
          appliedPolicy: policy.policyId,
        },
      }
    })
  }

  async checkRisk(input: { caseData: CsCase }) {
    const caseId = input.caseData.caseId
    return this.run<RiskResult>(caseId, 'check_risk', { caseId }, () => {
      const current = caseStore.getCase(caseId) ?? input.caseData
      const flags = evaluateRisk(current)
      return {
        data: {
          flags,
          autoActionAllowed: flags.length === 0,
        },
        changes: { riskFlags: flags },
      }
    })
  }

  async analyzeEvidence(input: { evidenceUrl: string }) {
    const caseData = caseStore.getAllCases().find((candidate) =>
      candidate.evidenceUrls.includes(input.evidenceUrl),
    )
    if (!caseData) {
      return {
        status: 'error' as const,
        error: `No Case is connected to evidence ${input.evidenceUrl}.`,
      }
    }

    return this.run<EvidenceAnalysis>(
      caseData.caseId,
      'analyze_evidence',
      input,
      () => {
        const analysis = this.mockEvidenceAnalysis(input.evidenceUrl)
        const current = this.requireCase(caseData.caseId)
        const previous = current.evidenceAnalysis ?? []
        return {
          data: analysis,
          changes: {
            evidenceAnalysis: [
              ...previous.filter((item) => item.evidenceUrl !== input.evidenceUrl),
              analysis,
            ],
          },
        }
      },
    )
  }

  async requestMerchantConfirmation(input: {
    caseId: string
    orderId: string
    issueType: CsCase['issueType']
    itemName?: string
    customerClaim: string
    evidenceUrl?: string
  }) {
    return this.run(input.caseId, 'request_merchant_confirmation', input, () => {
      const timestamp = nowIso()
      const request: MerchantConfirmationData = {
        requestId: newId('MC'),
        caseId: input.caseId,
        orderId: input.orderId,
        itemName: input.itemName,
        customerClaim: input.customerClaim,
        evidenceUrl: input.evidenceUrl,
        status: 'waiting',
        requestedAt: timestamp,
      }
      return {
        data: request,
        changes: {
          status: 'WAITING_MERCHANT',
          decision: 'WAITING_MERCHANT',
          merchantConfirmation: request,
        },
        history: [{
          actor: 'agent',
          event: 'MERCHANT_REQUESTED',
          toStatus: 'WAITING_MERCHANT',
          detail: 'Merchant 확인 요청 생성',
          createdAt: timestamp,
        }],
      }
    })
  }

  async refund(input: {
    caseId: string
    orderId: string
    itemName?: string
    amount: number
  }) {
    return this.run(input.caseId, 'refund', input, () => {
      const current = this.requireCase(input.caseId)
      const timestamp = nowIso()
      const action: MockActionResult = {
        actionId: newId('ACTION'),
        action: 'mock_refund',
        completedAt: timestamp,
      }
      return {
        data: action,
        changes: {
          status: 'AUTO_RESOLVED',
          decision: 'AUTO_RESOLVE',
          finalAction: 'mock_refund',
          finalActionResult: action,
          csHistory: [
            ...current.csHistory,
            {
              customerId: current.customerId,
              orderId: input.orderId,
              issueType: current.issueType,
              itemName: input.itemName,
              action: 'mock_refund',
              amount: input.amount,
              status: 'completed',
            },
          ],
        },
        history: [this.finalActionHistory(current, 'Mock 부분 환불 완료', timestamp)],
      }
    })
  }

  async redelivery(input: { caseId: string; orderId: string }) {
    return this.run(input.caseId, 'redelivery', input, () => {
      const current = this.requireCase(input.caseId)
      const timestamp = nowIso()
      const action: MockActionResult = {
        actionId: newId('ACTION'),
        action: 'mock_redelivery',
        completedAt: timestamp,
      }
      return {
        data: action,
        changes: {
          status: 'AUTO_RESOLVED',
          decision: 'AUTO_RESOLVE',
          finalAction: 'mock_redelivery',
          finalActionResult: action,
        },
        history: [this.finalActionHistory(current, 'Mock 재배달 요청 완료', timestamp)],
      }
    })
  }

  async escalateToHuman(input: { caseId: string; reason: string; summary?: string }) {
    return this.run(input.caseId, 'escalate_to_human', input, () => {
      const current = this.requireCase(input.caseId)
      const timestamp = nowIso()
      const result: HumanEscalationResult = {
        queueId: newId('CSQ'),
        status: 'queued',
        createdAt: timestamp,
      }
      return {
        data: result,
        changes: {
          status: 'ESCALATED',
          decision: 'ESCALATE',
          finalAction: 'human_review',
          escalationReason: input.reason,
          agentSummary: input.summary ?? current.agentSummary,
        },
        history: [{
          actor: 'agent',
          event: 'ESCALATED',
          fromStatus: current.status,
          toStatus: 'ESCALATED',
          detail: input.reason,
          createdAt: timestamp,
        }],
      }
    })
  }

  private async run<T>(
    caseId: string,
    toolName: ToolName,
    input: unknown,
    operation: () => ToolOperation<T>,
  ): Promise<ToolResult<T>> {
    const startedAt = nowIso()
    try {
      this.requireCase(caseId)
      const operationResult = operation()
      const result: ToolResult<T> = { status: 'success', data: operationResult.data }
      caseStore.commitCase(caseId, {
        changes: operationResult.changes,
        history: operationResult.history,
        toolHistory: [{
          toolName,
          input,
          result,
          startedAt,
          completedAt: nowIso(),
        }],
      })
      return result
    } catch (error) {
      const result: ToolResult<T> = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown Tool error',
      }
      if (caseStore.getCase(caseId)) {
        caseStore.commitCase(caseId, {
          toolHistory: [{
            toolName,
            input,
            result,
            startedAt,
            completedAt: nowIso(),
          }],
        })
      }
      return result
    }
  }

  private caseIdForOrder(orderId: string): string | undefined {
    return caseStore.findCaseByOrderId(orderId)?.caseId
  }

  private caseNotFoundForOrder<T>(orderId: string): ToolResult<T> {
    return {
      status: 'error',
      error: `No Case is connected to order ${orderId}.`,
    }
  }

  private requireCase(caseId: string): CsCase {
    const caseData = caseStore.getCase(caseId)
    if (!caseData) throw new Error(`Case ${caseId} was not found.`)
    return caseData
  }

  private finalActionHistory(
    current: CsCase,
    detail: string,
    createdAt: string,
  ): CaseHistoryDraft {
    return {
      actor: 'agent',
      event: 'FINAL_ACTION_COMPLETED',
      fromStatus: current.status,
      toStatus: 'AUTO_RESOLVED',
      detail,
      createdAt,
    }
  }

  private mockEvidenceAnalysis(evidenceUrl: string): EvidenceAnalysis {
    if (evidenceUrl.includes('case-e')) {
      return {
        evidenceUrl,
        observation: '첨부 이미지의 음식이 주문 메뉴인 양념치킨과 다른 음식으로 보입니다.',
        limitations: ['PoC에서는 이미지 위변조 여부를 판별하지 않습니다.'],
      }
    }

    if (evidenceUrl.includes('case-c') || evidenceUrl.includes('case-d')) {
      return {
        evidenceUrl,
        observation: '첨부 이미지에서 포장된 음식 일부를 확인할 수 있습니다.',
        limitations: [
          '사진만으로 누락 여부를 확정할 수 없습니다.',
          '포장 시점의 전체 구성은 Merchant 확인이 필요합니다.',
        ],
      }
    }

    return {
      evidenceUrl,
      observation: '고객이 증빙 이미지를 첨부했습니다.',
      limitations: ['PoC 분석 결과이며 실제 이미지 판정 시스템과 연결되지 않습니다.'],
    }
  }
}

export const agentTools: AgentTools = new MockAgentTools()
