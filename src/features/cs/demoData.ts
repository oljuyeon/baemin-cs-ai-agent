import type {
  CaseHistory,
  CsCase,
  CsHistoryData,
  CustomerData,
  DeliveryData,
  DemoCaseId,
  DemoStage,
  MerchantConfirmationData,
  MerchantData,
  OrderData,
} from './types'

const CREATED_AT = '2026-09-30T19:00:00+09:00'

export const mockCustomers: CustomerData[] = [
  { customerId: 'C001', name: '김고객', recentOrderCount: 8, refundCount30d: 1 },
  { customerId: 'C002', name: '이민지', recentOrderCount: 3, refundCount30d: 0 },
  { customerId: 'C003', name: '박현우', recentOrderCount: 5, refundCount30d: 1 },
  { customerId: 'C004', name: '최유진', recentOrderCount: 11, refundCount30d: 2 },
  { customerId: 'C005', name: '정도윤', recentOrderCount: 2, refundCount30d: 0 },
]

export const mockMerchants: MerchantData[] = [
  { storeId: 'S001', storeName: '한식당', merchantUserId: 'M001' },
  { storeId: 'S002', storeName: '치킨하우스', merchantUserId: 'M002' },
  { storeId: 'S003', storeName: '분식연구소', merchantUserId: 'M003' },
]

export const mockOrders: OrderData[] = [
  {
    orderId: 'A1001', customerId: 'C001', storeId: 'S001',
    orderedAt: '2026-09-30T19:20:00+09:00',
    items: [{ itemId: 'I001', name: '김치찌개', price: 12000 }],
    totalAmount: 12000, orderStatus: 'delivering',
  },
  {
    orderId: 'A1002', customerId: 'C002', storeId: 'S002',
    orderedAt: '2026-09-30T18:00:00+09:00',
    items: [
      { itemId: 'I002', name: '후라이드치킨', price: 20000 },
      { itemId: 'I003', name: '콜라', price: 2000 },
    ],
    totalAmount: 22000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1003', customerId: 'C003', storeId: 'S001',
    orderedAt: '2026-09-30T18:10:00+09:00',
    items: [
      { itemId: 'I004', name: '불고기정식', price: 18000 },
      { itemId: 'I005', name: '공깃밥', price: 1000 },
    ],
    totalAmount: 19000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1004', customerId: 'C004', storeId: 'S003',
    orderedAt: '2026-09-30T18:30:00+09:00',
    items: [
      { itemId: 'I006', name: '떡볶이', price: 6000 },
      { itemId: 'I007', name: '튀김세트', price: 5000 },
    ],
    totalAmount: 11000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1005', customerId: 'C005', storeId: 'S002',
    orderedAt: '2026-09-30T18:40:00+09:00',
    items: [{ itemId: 'I008', name: '양념치킨', price: 21000 }],
    totalAmount: 21000, orderStatus: 'delivered',
  },
]

export const mockDeliveries: DeliveryData[] = [
  {
    orderId: 'A1001', riderAssignedAt: '2026-09-30T19:30:00+09:00',
    pickedUpAt: '2026-09-30T19:45:00+09:00',
    expectedAt: '2026-09-30T20:20:00+09:00', deliveryStatus: 'picked_up',
  },
  {
    orderId: 'A1002', riderAssignedAt: '2026-09-30T18:15:00+09:00',
    pickedUpAt: '2026-09-30T18:30:00+09:00', expectedAt: '2026-09-30T18:50:00+09:00',
    deliveredAt: '2026-09-30T18:52:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1003', riderAssignedAt: '2026-09-30T18:25:00+09:00',
    pickedUpAt: '2026-09-30T18:40:00+09:00', expectedAt: '2026-09-30T19:00:00+09:00',
    deliveredAt: '2026-09-30T19:03:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1004', riderAssignedAt: '2026-09-30T18:42:00+09:00',
    pickedUpAt: '2026-09-30T18:55:00+09:00', expectedAt: '2026-09-30T19:15:00+09:00',
    deliveredAt: '2026-09-30T19:13:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1005', riderAssignedAt: '2026-09-30T18:55:00+09:00',
    pickedUpAt: '2026-09-30T19:10:00+09:00', expectedAt: '2026-09-30T19:35:00+09:00',
    deliveredAt: '2026-09-30T19:37:00+09:00', deliveryStatus: 'delivered',
  },
]

export const mockCsHistory: CsHistoryData[] = [
  {
    customerId: 'C001', orderId: 'OLD-C001', issueType: 'delivery_delay',
    action: 'guide_customer', status: 'completed',
  },
  {
    customerId: 'C004', orderId: 'OLD-C004', issueType: 'missing_item',
    itemName: '콜라', action: 'mock_refund', amount: 2000, status: 'completed',
  },
]

const clone = <T>(value: T): T => structuredClone(value)

const history = (
  id: string,
  event: CaseHistory['event'],
  detail: string,
  overrides: Partial<CaseHistory> = {},
): CaseHistory => ({
  id,
  actor: 'customer',
  event,
  detail,
  createdAt: CREATED_AT,
  ...overrides,
})

const baseCases: Record<DemoCaseId, CsCase> = {
  A: {
    caseId: 'CASE-A', demoCaseId: 'A', customerId: 'C001', orderId: 'A1001', storeId: 'S001',
    issueType: 'delivery_delay', status: 'NEW', customerClaim: '음식이 너무 늦어요.',
    conversation: [{ role: 'customer', content: '음식이 너무 늦어요.', createdAt: CREATED_AT }],
    evidenceUrls: [], csHistory: [], riskFlags: [], toolHistory: [],
    history: [history('H-A-1', 'CASE_CREATED', 'Demo A 고객 문의 접수')],
    createdAt: CREATED_AT, updatedAt: CREATED_AT,
  },
  B: {
    caseId: 'CASE-B', demoCaseId: 'B', customerId: 'C002', orderId: 'A1002', storeId: 'S002',
    issueType: 'missing_item', status: 'NEW', customerClaim: '콜라가 안 왔어요.',
    conversation: [{ role: 'customer', content: '콜라가 안 왔어요.', createdAt: CREATED_AT }],
    claimedItemName: '콜라', evidenceUrls: [], csHistory: [], riskFlags: [], toolHistory: [],
    history: [history('H-B-1', 'CASE_CREATED', 'Demo B 고객 문의 접수')],
    createdAt: CREATED_AT, updatedAt: CREATED_AT,
  },
  C: {
    caseId: 'CASE-C', demoCaseId: 'C', customerId: 'C003', orderId: 'A1003', storeId: 'S001',
    issueType: 'missing_item', status: 'NEW', customerClaim: '불고기정식이 안 왔어요.',
    conversation: [{ role: 'customer', content: '불고기정식이 안 왔어요.', createdAt: CREATED_AT }],
    claimedItemName: '불고기정식', evidenceUrls: ['mock://evidence/case-c.jpg'],
    csHistory: [], riskFlags: [], toolHistory: [],
    history: [history('H-C-1', 'CASE_CREATED', 'Demo C 고객 문의 접수')],
    createdAt: CREATED_AT, updatedAt: CREATED_AT,
  },
  D: {
    caseId: 'CASE-D', demoCaseId: 'D', customerId: 'C004', orderId: 'A1004', storeId: 'S003',
    issueType: 'missing_item', status: 'NEW', customerClaim: '튀김세트가 안 왔어요.',
    conversation: [{ role: 'customer', content: '튀김세트가 안 왔어요.', createdAt: CREATED_AT }],
    claimedItemName: '튀김세트', evidenceUrls: ['mock://evidence/case-d.jpg'],
    csHistory: [], riskFlags: [], toolHistory: [],
    history: [history('H-D-1', 'CASE_CREATED', 'Demo D 고객 문의 접수')],
    createdAt: CREATED_AT, updatedAt: CREATED_AT,
  },
  E: {
    caseId: 'CASE-E', demoCaseId: 'E', customerId: 'C005', orderId: 'A1005', storeId: 'S002',
    issueType: 'wrong_delivery', status: 'NEW', customerClaim: '제가 주문한 양념치킨이 아니에요.',
    conversation: [{ role: 'customer', content: '제가 주문한 양념치킨이 아니에요.', createdAt: CREATED_AT }],
    receivedItemDescription: '후라이드치킨', evidenceUrls: ['mock://evidence/case-e.jpg'],
    csHistory: [], riskFlags: [], toolHistory: [],
    history: [history('H-E-1', 'CASE_CREATED', '선택 Demo E 고객 문의 접수')],
    createdAt: CREATED_AT, updatedAt: CREATED_AT,
  },
}

const merchantRequest = (
  demoCaseId: 'C' | 'D',
  response?: MerchantConfirmationData['response'],
): MerchantConfirmationData => {
  const caseData = baseCases[demoCaseId]
  return {
    requestId: `MC-${demoCaseId}`,
    caseId: caseData.caseId,
    orderId: caseData.orderId,
    itemName: caseData.claimedItemName,
    customerClaim: caseData.customerClaim,
    evidenceUrl: caseData.evidenceUrls[0],
    response,
    comment: response === 'PACKED' ? '포장 당시 주문 메뉴를 모두 확인했습니다.' : undefined,
    status: response ? 'completed' : 'waiting',
    requestedAt: '2026-09-30T19:10:00+09:00',
    respondedAt: response ? '2026-09-30T19:15:00+09:00' : undefined,
  }
}

export function createDemoCase(demoCaseId: DemoCaseId, stage: DemoStage = 'start'): CsCase {
  const caseData = clone(baseCases[demoCaseId])

  if (stage === 'start') return caseData

  if (demoCaseId !== 'C' && demoCaseId !== 'D') {
    throw new Error(`Demo ${demoCaseId} does not support the ${stage} stage.`)
  }

  caseData.status = 'WAITING_MERCHANT'
  caseData.decision = 'WAITING_MERCHANT'
  caseData.merchantConfirmation = merchantRequest(demoCaseId)
  caseData.history.push(
    history(`H-${demoCaseId}-2`, 'MERCHANT_REQUESTED', 'Merchant 확인 요청 생성', {
      actor: 'agent', fromStatus: 'NEW', toStatus: 'WAITING_MERCHANT',
      createdAt: '2026-09-30T19:10:00+09:00',
    }),
  )

  if (stage === 'waiting_merchant') return caseData

  const response = demoCaseId === 'C' ? 'POSSIBLE_MISSING' : 'PACKED'
  caseData.merchantConfirmation = merchantRequest(demoCaseId, response)
  caseData.status = 'CHECKING_DATA'
  caseData.decision = undefined
  caseData.history.push(
    history(`H-${demoCaseId}-3`, 'MERCHANT_RESPONDED', `Merchant 응답 저장: ${response}`, {
      actor: 'merchant', fromStatus: 'WAITING_MERCHANT', toStatus: 'CHECKING_DATA',
      createdAt: '2026-09-30T19:15:00+09:00',
    }),
  )

  if (stage === 'merchant_responded') return caseData

  if (demoCaseId !== 'D') {
    throw new Error(`Demo ${demoCaseId} does not support the escalated stage.`)
  }

  caseData.status = 'ESCALATED'
  caseData.decision = 'ESCALATE'
  caseData.finalAction = 'human_review'
  caseData.agentSummary = '고객은 튀김세트 누락을 주장하지만 매장은 정상 포장을 주장합니다.'
  caseData.escalationReason = '고객과 Merchant의 주장이 충돌합니다.'
  caseData.history.push(
    history('H-D-4', 'ESCALATED', caseData.escalationReason, {
      actor: 'agent', fromStatus: 'CHECKING_DATA', toStatus: 'ESCALATED',
      createdAt: '2026-09-30T19:17:00+09:00',
    }),
  )
  return caseData
}

export function createInitialDemoCases(): CsCase[] {
  return (['A', 'B', 'C', 'D', 'E'] as DemoCaseId[]).map((id) => createDemoCase(id))
}

export const findCustomer = (customerId: string) =>
  clone(mockCustomers.find((customer) => customer.customerId === customerId))

export const findOrder = (orderId: string) =>
  clone(mockOrders.find((order) => order.orderId === orderId))

export const findDelivery = (orderId: string) =>
  clone(mockDeliveries.find((delivery) => delivery.orderId === orderId))

export const findCsHistory = (customerId: string, orderId?: string) =>
  clone(mockCsHistory.filter((record) =>
    record.customerId === customerId && (!orderId || record.orderId === orderId),
  ))

export const findMerchant = (storeId: string) =>
  clone(mockMerchants.find((merchant) => merchant.storeId === storeId))
