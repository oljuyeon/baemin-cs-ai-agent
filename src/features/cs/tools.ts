import { caseStore } from './caseStore'
import {
  findCsHistory,
  findDelivery,
  findEvidenceAnalysis,
  findOrder,
} from './demoData'
import { evaluatePolicy, evaluateRisk } from './policy'
import type {
  AgentTools,
  CsCase,
  CsHistoryData,
  DeliveryData,
  EvidenceAnalysis,
  HumanEscalationResult,
  MerchantConfirmationData,
  MockActionResult,
  OrderData,
  RiskResult,
  ToolResult,
} from './types'

const nowIso = () => new Date().toISOString()
const newId = (prefix: string) => {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `${prefix}-${suffix}`
}

/**
 * Tool은 외부/Mock 시스템 결과만 반환한다.
 * Case 변경과 toolHistory 기록은 Agent Controller가 담당한다.
 */
class MockAgentTools implements AgentTools {
  async getOrder(input: { orderId: string }) {
    return this.run<OrderData>(() => {
      const order = findOrder(input.orderId)
      if (!order) throw new Error(`Order ${input.orderId} was not found.`)
      return order
    })
  }

  async getDelivery(input: { orderId: string }) {
    return this.run<DeliveryData>(() => {
      const delivery = findDelivery(input.orderId)
      if (!delivery) throw new Error(`Delivery for order ${input.orderId} was not found.`)
      return delivery
    })
  }

  async getCsHistory(input: { customerId: string; orderId: string }) {
    return this.run<CsHistoryData[]>(() => findCsHistory(input.customerId, input.orderId))
  }

  async getPolicy(input: { caseData: CsCase }) {
    return this.run(() => evaluatePolicy(input.caseData))
  }

  async checkRisk(input: { caseData: CsCase }) {
    return this.run<RiskResult>(() => {
      const flags = evaluateRisk(input.caseData)
      return { flags, autoActionAllowed: flags.length === 0 }
    })
  }

  async analyzeEvidence(input: { evidenceUrl: string }) {
    return this.run<EvidenceAnalysis>(() => {
      const analysis = findEvidenceAnalysis(input.evidenceUrl)
      if (analysis) return analysis
      return {
        evidenceUrl: input.evidenceUrl,
        assessment: 'inconclusive',
        observation: '첨부 이미지를 받았지만 Mock 분석 데이터와 일치하는 결과가 없습니다.',
        limitations: ['실제 Vision API가 아닌 PoC Mock 분석입니다.'],
      }
    })
  }

  async requestMerchantConfirmation(input: {
    caseId: string
    orderId: string
    issueType: CsCase['issueType']
    itemName?: string
    customerClaim: string
    evidenceUrl?: string
  }) {
    return this.run<MerchantConfirmationData>(() => ({
      requestId: newId('MC'),
      caseId: input.caseId,
      orderId: input.orderId,
      itemName: input.itemName,
      customerClaim: input.customerClaim,
      evidenceUrl: input.evidenceUrl,
      status: 'waiting',
      requestedAt: nowIso(),
    }))
  }

  async refund(input: {
    caseId: string
    orderId: string
    itemName?: string
    amount: number
  }) {
    return this.run<MockActionResult>(() => {
      const current = this.requireCase(input.caseId)
      if (current.orderId !== input.orderId) {
        throw new Error('Case와 환불 대상 주문이 일치하지 않습니다.')
      }
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new Error('환불 금액은 0보다 커야 합니다.')
      }
      return {
        actionId: newId('ACTION'),
        action: 'mock_refund',
        completedAt: nowIso(),
      }
    })
  }

  async redelivery(input: { caseId: string; orderId: string }) {
    return this.run<MockActionResult>(() => {
      const current = this.requireCase(input.caseId)
      if (current.orderId !== input.orderId) {
        throw new Error('Case와 재배달 대상 주문이 일치하지 않습니다.')
      }
      return {
        actionId: newId('ACTION'),
        action: 'mock_redelivery',
        completedAt: nowIso(),
      }
    })
  }

  async escalateToHuman(input: { caseId: string; reason: string; summary?: string }) {
    return this.run<HumanEscalationResult>(() => {
      this.requireCase(input.caseId)
      return {
        queueId: newId('CSQ'),
        status: 'queued',
        createdAt: nowIso(),
      }
    })
  }

  private async run<T>(operation: () => T): Promise<ToolResult<T>> {
    try {
      return { status: 'success', data: operation() }
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown Tool error',
      }
    }
  }

  private requireCase(caseId: string): CsCase {
    const caseData = caseStore.getCase(caseId)
    if (!caseData) throw new Error(`Case ${caseId} was not found.`)
    return caseData
  }
}

export const agentTools: AgentTools = new MockAgentTools()
