import {
  assessRisk,
  caseStore,
  evaluatePolicy,
  inferLiability,
  isAutomaticMissingCandidate,
  type CsCase,
  type EvidenceAnalysis,
  type FinalAction,
  type MerchantConditionalAction,
} from '../cs'
import { analyzeEvidenceWithOpenAI } from './remoteAgent'
import { executeTool } from './toolExecutor'
import { agentController } from './controller'

const actionLabel: Record<MerchantConditionalAction, string> = {
  mock_coupon: '2,000원 쿠폰 지급',
  mock_refund: '누락 메뉴 부분 환불',
  mock_redelivery: '재배달',
  merchant_review: '매장 재확인',
}

const requireCase = (caseId: string) => {
  const caseData = caseStore.getCase(caseId)
  if (!caseData) throw new Error(`Case ${caseId} was not found.`)
  return caseData
}

const recordRemoteAnalysis = (
  caseData: CsCase,
  analysis: EvidenceAnalysis,
) => caseStore.commitCase(caseData.caseId, {
  changes: {
    evidenceAnalysis: [
      ...(caseData.evidenceAnalysis ?? []).filter(
        (item) => item.evidenceUrl !== analysis.evidenceUrl,
      ),
      analysis,
    ],
  },
  toolHistory: [{
    toolName: 'analyze_evidence',
    input: { evidenceUrl: '[customer-image]' },
    result: { status: 'success', data: analysis },
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  }],
})

const appendBoth = (caseId: string, customerMessage: string, merchantMessage: string) => {
  caseStore.appendConversation(caseId, 'agent', customerMessage)
  return caseStore.appendMerchantConversation(caseId, 'agent', merchantMessage)
}

const waitForMerchant = (
  caseData: CsCase,
  customerMessage: string,
  merchantMessage: string,
) => {
  caseStore.updateCase(caseData.caseId, {
    status: 'WAITING_MERCHANT',
    decision: 'WAITING_MERCHANT',
    merchantConfirmation: caseData.merchantConfirmation
      ? { ...caseData.merchantConfirmation, status: 'waiting' }
      : undefined,
  })
  return appendBoth(caseData.caseId, customerMessage, merchantMessage)
}

const plannedActionIsSafe = (
  caseData: CsCase,
  action: Exclude<MerchantConditionalAction, 'merchant_review'>,
) => {
  const confirmation = caseData.merchantConfirmation
  if (!confirmation) return false
  if (
    action === 'mock_coupon'
    && (
      caseData.issueType !== 'missing_item'
      || !isAutomaticMissingCandidate(caseData)
    )
  ) return false
  const approvedCase: CsCase = {
    ...caseData,
    merchantConfirmation: {
      ...confirmation,
      response: 'CONFIRMED',
      status: 'completed',
    },
  }
  const policy = evaluatePolicy(approvedCase)
  const risk = assessRisk(approvedCase)
  return policy.allowedActions.includes(action as FinalAction)
    && !risk.blockedActions.includes(action as FinalAction)
}

const executeApprovedAction = async (
  caseData: CsCase,
  action: Exclude<MerchantConditionalAction, 'merchant_review'>,
) => {
  const confirmation = caseData.merchantConfirmation
  if (!confirmation) return caseData

  caseStore.recordMerchantResponse(
    caseData.caseId,
    'CONFIRMED',
    `고객 사진 분석 결과가 주장을 뒷받침해 조건부 조치(${actionLabel[action]})를 승인했습니다.`,
  )
  const completed = caseStore.completeMerchantConfirmation(caseData.caseId)
  caseStore.updateCase(caseData.caseId, {
    liability: inferLiability(completed),
    status: 'ACTION_EXECUTING',
  })
  await executeTool(caseData.caseId, {
    type: 'CALL_TOOL',
    toolName: 'get_policy',
    input: { caseData: requireCase(caseData.caseId) },
  })
  await executeTool(caseData.caseId, {
    type: 'CALL_TOOL',
    toolName: 'check_risk',
    input: { caseData: requireCase(caseData.caseId) },
  })
  caseStore.updateCase(caseData.caseId, { status: 'ACTION_EXECUTING' })

  if (action === 'mock_coupon') {
    await executeTool(caseData.caseId, {
      type: 'CALL_TOOL',
      toolName: 'issue_coupon',
      input: {
        caseId: caseData.caseId,
        orderId: caseData.orderId,
        amount: confirmation.conditionalCouponAmount ?? 2_000,
      },
    })
  } else if (action === 'mock_refund') {
    const amount = caseData.issueType === 'missing_item'
      ? caseData.order?.items.find((item) => item.name === caseData.claimedItemName)?.price
      : caseData.order?.totalAmount
    if (!amount) {
      return waitForMerchant(
        requireCase(caseData.caseId),
        '사진은 확인했지만 환불 금액을 자동으로 계산할 수 없어 매장에 다시 확인을 요청했습니다.',
        '사진은 고객 주장을 뒷받침하지만 환불 금액을 계산할 수 없습니다. 직접 조치를 선택해 주세요.',
      )
    }
    await executeTool(caseData.caseId, {
      type: 'CALL_TOOL',
      toolName: 'refund',
      input: {
        caseId: caseData.caseId,
        orderId: caseData.orderId,
        itemName: caseData.claimedItemName,
        amount,
      },
    })
  } else {
    await executeTool(caseData.caseId, {
      type: 'CALL_TOOL',
      toolName: 'redelivery',
      input: { caseId: caseData.caseId, orderId: caseData.orderId },
    })
  }

  const afterTool = requireCase(caseData.caseId)
  if (afterTool.finalActionResult?.action !== action) {
    return waitForMerchant(
      afterTool,
      '사진 확인은 완료했지만 자동 조치 중 오류가 발생해 매장에 다시 확인을 요청했습니다.',
      `사진 분석 후 ${actionLabel[action]} 실행에 실패했습니다. 직접 확인해 주세요.`,
    )
  }

  const amount = action === 'mock_coupon'
    ? confirmation.conditionalCouponAmount ?? 2_000
    : action === 'mock_refund'
      ? caseData.issueType === 'missing_item'
        ? caseData.order?.items.find((item) => item.name === caseData.claimedItemName)?.price
        : caseData.order?.totalAmount
      : undefined
  const customerMessage = action === 'mock_coupon'
    ? `첨부 사진이 문의 내용을 뒷받침하는 것으로 확인됐습니다. 매장이 미리 승인한 ${amount?.toLocaleString('ko-KR')}원 쿠폰을 지급했습니다.`
    : action === 'mock_refund'
      ? `첨부 사진이 문의 내용을 뒷받침하는 것으로 확인됐습니다. 매장이 미리 승인한 ${amount?.toLocaleString('ko-KR')}원 환불을 처리했습니다.`
      : '첨부 사진이 문의 내용을 뒷받침하는 것으로 확인됐습니다. 매장이 미리 승인한 재배달을 요청했습니다.'

  caseStore.commitCase(caseData.caseId, {
    changes: {
      status: 'AUTO_RESOLVED',
      decision: 'AUTO_RESOLVE',
      finalAction: action,
    },
    history: [{
      actor: 'agent',
      event: 'FINAL_ACTION_COMPLETED',
      fromStatus: 'ACTION_EXECUTING',
      toStatus: 'AUTO_RESOLVED',
      detail: customerMessage,
    }],
  })
  return appendBoth(
    caseData.caseId,
    customerMessage,
    `고객 사진 분석 결과가 주장을 뒷받침해 사전 승인한 ${actionLabel[action]} 조치를 완료했습니다.`,
  )
}

export async function processCustomerEvidence(
  caseId: string,
  evidenceUrl: string,
): Promise<CsCase> {
  let current = requireCase(caseId)
  const remoteAnalysis = await analyzeEvidenceWithOpenAI(current, evidenceUrl)
  if (remoteAnalysis) {
    current = recordRemoteAnalysis(current, remoteAnalysis)
  } else {
    current = await executeTool(caseId, {
      type: 'CALL_TOOL',
      toolName: 'analyze_evidence',
      input: { evidenceUrl },
    })
  }

  const analysis = current.evidenceAnalysis?.find(
    (item) => item.evidenceUrl === evidenceUrl,
  )
  const conditionalAction = current.merchantConfirmation?.conditionalAction

  if (analysis?.provider === 'fallback') {
    current = await executeTool(caseId, {
      type: 'CALL_TOOL',
      toolName: 'get_policy',
      input: { caseData: current },
    })
    current = await executeTool(caseId, {
      type: 'CALL_TOOL',
      toolName: 'check_risk',
      input: { caseData: current },
    })
    return agentController.runNextStep(caseId)
  }

  if (!analysis || analysis.assessment === 'inconclusive') {
    return waitForMerchant(
      current,
      '사진을 확인했지만 이 사진만으로는 누락 또는 오배달 여부를 확정하기 어려워 매장에 다시 확인을 요청했습니다.',
      `고객 사진 분석 결과: 판단 어려움. ${analysis?.observation ?? '분석 결과가 없습니다.'}`,
    )
  }

  if (analysis.assessment === 'contradicts_claim') {
    return waitForMerchant(
      current,
      '사진에서 문의 내용과 다른 정황이 확인되어 자동 보상하지 않고 매장에 다시 확인을 요청했습니다.',
      `고객 사진 분석 결과: 고객 주장과 충돌. ${analysis.observation}`,
    )
  }

  if (analysis.assessment === 'supports_claim') {
    // 매장이 추가 사진을 요청한 뒤 고객이 증빙을 제출한 경로도 최초 첨부
    // 경로와 동일하게 처리한다. 사진이 주장을 뒷받침하면 매장에 재확인을
    // 요청하지 않고 최신 Policy/Risk를 기록한 뒤 Human CS 승인으로 넘긴다.
    current = await executeTool(caseId, {
      type: 'CALL_TOOL',
      toolName: 'get_policy',
      input: { caseData: current },
    })
    current = await executeTool(caseId, {
      type: 'CALL_TOOL',
      toolName: 'check_risk',
      input: { caseData: current },
    })
    return agentController.runNextStep(caseId)
  }

  if (!conditionalAction || conditionalAction === 'merchant_review') {
    return waitForMerchant(
      current,
      '사진이 문의 내용을 뒷받침하는 것으로 분석됐습니다. 매장이 사진을 확인한 뒤 다음 조치를 안내할 예정입니다.',
      `고객 사진이 주장을 뒷받침합니다. ${analysis.observation} 직접 다음 조치를 선택해 주세요.`,
    )
  }

  if (!plannedActionIsSafe(current, conditionalAction)) {
    return waitForMerchant(
      current,
      '사진은 문의 내용을 뒷받침하지만 정책 또는 기존 처리 이력 때문에 자동 보상하지 않고 매장에 다시 확인을 요청했습니다.',
      `사진은 주장을 뒷받침하지만 ${actionLabel[conditionalAction]} 자동 실행이 정책 또는 위험 기준에 의해 제한되었습니다.`,
    )
  }

  return executeApprovedAction(current, conditionalAction)
}
