import {
  agentTools,
  caseStore,
  type IssueType,
} from '../cs'
import { merchantForStore, queueForStore } from './desk'

export type SampleSpec = {
  id: string
  orderId: string
  issueType: IssueType
  customerClaim: string
  claimedItemName: string
  evidenceUrl?: string
}

const samplesByStore: Record<string, SampleSpec[]> = {
  S001: [
    {
      id: 's001-missing-bulgogi',
      orderId: 'A1003',
      issueType: 'missing_item',
      customerClaim: '18,000원짜리 불고기정식이 안 왔어요.',
      claimedItemName: '불고기정식',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's001-missing-doenjang',
      orderId: 'A1008',
      issueType: 'missing_item',
      customerClaim: '된장찌개가 빠져 있었어요.',
      claimedItemName: '된장찌개',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's001-wrong-kimchi',
      orderId: 'A1001',
      issueType: 'wrong_delivery',
      customerClaim: '김치찌개를 주문했는데 다른 음식이 왔어요.',
      claimedItemName: '김치찌개',
      evidenceUrl: 'mock://evidence/contradicts-claim.jpg',
    },
    {
      id: 's001-missing-jeyuk',
      orderId: 'A1009',
      issueType: 'missing_item',
      customerClaim: '제육정식이 안 오고 된장국만 왔어요.',
      claimedItemName: '제육정식',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's001-wrong-bibim',
      orderId: 'A1012',
      issueType: 'wrong_delivery',
      customerClaim: '비빔밥 대신 다른 덮밥이 왔어요.',
      claimedItemName: '비빔밥',
      evidenceUrl: 'mock://evidence/wrong-delivery-supports-claim.jpg',
    },
    {
      id: 's001-missing-galbi',
      orderId: 'A1015',
      issueType: 'missing_item',
      customerClaim: '갈비탕이 안 왔어요.',
      claimedItemName: '갈비탕',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's001-wrong-naengmyeon',
      orderId: 'A1016',
      issueType: 'wrong_delivery',
      customerClaim: '물냉면 대신 비빔냉면이 왔어요.',
      claimedItemName: '물냉면',
      evidenceUrl: 'mock://evidence/wrong-delivery-supports-claim.jpg',
    },
  ],
  S002: [
    {
      id: 's002-wrong-yangnyeom',
      orderId: 'A1005',
      issueType: 'wrong_delivery',
      customerClaim: '양념치킨을 주문했는데 다른 음식이 왔어요.',
      claimedItemName: '양념치킨',
      evidenceUrl: 'mock://evidence/wrong-delivery-supports-claim.jpg',
    },
    {
      id: 's002-missing-cola',
      orderId: 'A1002',
      issueType: 'missing_item',
      customerClaim: '콜라가 안 왔어요.',
      claimedItemName: '콜라',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's002-missing-ganjang',
      orderId: 'A1006',
      issueType: 'missing_item',
      customerClaim: '간장치킨이 통째로 안 왔어요.',
      claimedItemName: '간장치킨',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's002-missing-beer',
      orderId: 'A1010',
      issueType: 'missing_item',
      customerClaim: '반반치킨은 왔는데 맥주가 없어요.',
      claimedItemName: '맥주',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's002-wrong-sunsall',
      orderId: 'A1014',
      issueType: 'wrong_delivery',
      customerClaim: '순살양념을 주문했는데 뼈치킨이 왔어요.',
      claimedItemName: '순살양념',
      evidenceUrl: 'mock://evidence/wrong-delivery-supports-claim.jpg',
    },
    {
      id: 's002-missing-honey',
      orderId: 'A1017',
      issueType: 'missing_item',
      customerClaim: '허니콤보는 왔는데 콜라가 없어요.',
      claimedItemName: '콜라',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's002-missing-half',
      orderId: 'A1018',
      issueType: 'missing_item',
      customerClaim: '양념반마리가 안 왔어요.',
      claimedItemName: '양념반마리',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
  ],
  S003: [
    {
      id: 's003-missing-tteok',
      orderId: 'A1004',
      issueType: 'missing_item',
      customerClaim: '떡볶이가 빠져 있었어요.',
      claimedItemName: '떡볶이',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's003-missing-twigim',
      orderId: 'A1004',
      issueType: 'missing_item',
      customerClaim: '튀김세트도 같이 안 왔어요.',
      claimedItemName: '튀김세트',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's003-wrong-modum',
      orderId: 'A1007',
      issueType: 'wrong_delivery',
      customerClaim: '모둠튀김이 아니라 다른 메뉴가 배달됐어요.',
      claimedItemName: '모둠튀김',
      evidenceUrl: 'mock://evidence/wrong-delivery-supports-claim.jpg',
    },
    {
      id: 's003-missing-gimbap',
      orderId: 'A1011',
      issueType: 'missing_item',
      customerClaim: '참치김밥이 빠졌어요.',
      claimedItemName: '참치김밥',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's003-missing-sundae',
      orderId: 'A1013',
      issueType: 'missing_item',
      customerClaim: '치즈떡볶이만 오고 순대가 없어요.',
      claimedItemName: '순대',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's003-missing-gimbap-rabokki',
      orderId: 'A1019',
      issueType: 'missing_item',
      customerClaim: '라볶이는 왔는데 김밥이 빠졌어요.',
      claimedItemName: '김밥',
      evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    },
    {
      id: 's003-wrong-jjolmyeon',
      orderId: 'A1020',
      issueType: 'wrong_delivery',
      customerClaim: '쫄면 대신 비빔면이 왔어요.',
      claimedItemName: '쫄면',
      evidenceUrl: 'mock://evidence/contradicts-claim.jpg',
    },
  ],
}

const sampleKey = (orderId: string, issueType: IssueType, itemName?: string) =>
  `${orderId}:${issueType}:${itemName ?? ''}`

export const samplesForStore = (storeId: string) => samplesByStore[storeId] ?? []

export const waitingSampleIds = (storeId: string) => {
  const waiting = new Set(
    queueForStore(storeId).map((caseData) =>
      sampleKey(caseData.orderId, caseData.issueType, caseData.claimedItemName),
    ),
  )
  return new Set(
    samplesForStore(storeId)
      .filter((sample) => waiting.has(sampleKey(sample.orderId, sample.issueType, sample.claimedItemName)))
      .map((sample) => sample.id),
  )
}

export type SampleRequestResult =
  | { status: 'created'; caseId: string }
  | { status: 'already_waiting'; caseId: string }
  | { status: 'unavailable' }

async function createOne(storeId: string, spec: SampleSpec): Promise<SampleRequestResult> {
  const merchant = merchantForStore(storeId)
  if (!merchant) return { status: 'unavailable' }

  const existing = queueForStore(storeId).find((caseData) =>
    sampleKey(caseData.orderId, caseData.issueType, caseData.claimedItemName)
    === sampleKey(spec.orderId, spec.issueType, spec.claimedItemName),
  )
  if (existing) return { status: 'already_waiting', caseId: existing.caseId }

  const orderResult = await agentTools.getOrder({ orderId: spec.orderId })
  if (orderResult.status === 'error' || orderResult.data.storeId !== storeId) {
    return { status: 'unavailable' }
  }

  const created = caseStore.createCase({
    customerId: orderResult.data.customerId,
    orderId: orderResult.data.orderId,
    storeId,
    issueType: spec.issueType,
    customerClaim: spec.customerClaim,
    claimedItemName: spec.claimedItemName,
    evidenceUrls: spec.evidenceUrl ? [spec.evidenceUrl] : [],
  })

  const confirmation = await agentTools.requestMerchantConfirmation({
    caseId: created.caseId,
    orderId: spec.orderId,
    issueType: spec.issueType,
    itemName: spec.claimedItemName,
    customerClaim: spec.customerClaim,
    evidenceUrl: spec.evidenceUrl,
  })
  if (confirmation.status === 'error') return { status: 'unavailable' }

  caseStore.commitCase(created.caseId, {
    changes: {
      status: 'WAITING_MERCHANT',
      decision: 'WAITING_MERCHANT',
      order: orderResult.data,
      merchantConfirmation: confirmation.data,
    },
    history: [{
      actor: 'agent',
      event: 'MERCHANT_REQUESTED',
      fromStatus: 'NEW',
      toStatus: 'WAITING_MERCHANT',
      detail: '매장 확인 요청',
    }],
  })

  return { status: 'created', caseId: created.caseId }
}

export async function createSampleMerchantRequest(
  storeId: string,
  sampleId: string,
): Promise<SampleRequestResult> {
  const spec = samplesForStore(storeId).find((sample) => sample.id === sampleId)
  if (!spec) return { status: 'unavailable' }
  return createOne(storeId, spec)
}

export async function createRemainingSamples(storeId: string) {
  const waiting = waitingSampleIds(storeId)
  const created: string[] = []
  for (const sample of samplesForStore(storeId)) {
    if (waiting.has(sample.id)) continue
    const result = await createOne(storeId, sample)
    if (result.status === 'created') created.push(result.caseId)
  }
  return created
}
