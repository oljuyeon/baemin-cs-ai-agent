import type {
  CsHistoryData,
  CustomerData,
  DeliveryData,
  EvidenceAnalysis,
  MerchantData,
  OrderData,
} from './types'

const FIXTURE_NOW = new Date('2026-09-30T21:48:00+09:00').getTime()
const APP_OPENED_AT = Date.now()
let appStartedAt = APP_OPENED_AT

const shiftFixtureTime = (value: string) =>
  new Date(new Date(value).getTime() + APP_OPENED_AT - FIXTURE_NOW).toISOString()

const shiftOptionalFixtureTime = (value?: string) =>
  value ? shiftFixtureTime(value) : undefined

export const markAppStarted = () => {
  appStartedAt = APP_OPENED_AT
}

export const mockCustomers: CustomerData[] = [
  { customerId: 'C001', name: '김지연', recentOrderCount: 8, refundCount30d: 1 },
  { customerId: 'C002', name: '정누락', recentOrderCount: 3, refundCount30d: 0 },
  { customerId: 'C003', name: '박현우', recentOrderCount: 5, refundCount30d: 1 },
  { customerId: 'C004', name: '최유진', recentOrderCount: 11, refundCount30d: 2 },
  { customerId: 'C005', name: '오배송', recentOrderCount: 2, refundCount30d: 0 },
  { customerId: 'C006', name: '한소율', recentOrderCount: 4, refundCount30d: 0 },
  { customerId: 'C007', name: '오세진', recentOrderCount: 6, refundCount30d: 1 },
  { customerId: 'C008', name: '김진상', recentOrderCount: 14, refundCount30d: 5 },
  { customerId: 'C009', name: '이수민', recentOrderCount: 4, refundCount30d: 0 },
  { customerId: 'C010', name: '박도윤', recentOrderCount: 7, refundCount30d: 2 },
  { customerId: 'C011', name: '최하늘', recentOrderCount: 3, refundCount30d: 0 },
  { customerId: 'C012', name: '정다은', recentOrderCount: 9, refundCount30d: 1 },
  { customerId: 'C013', name: '한지우', recentOrderCount: 2, refundCount30d: 0 },
  { customerId: 'C014', name: '윤서준', recentOrderCount: 5, refundCount30d: 1 },
  { customerId: 'C015', name: '강민재', recentOrderCount: 6, refundCount30d: 0 },
  { customerId: 'C016', name: '서지우', recentOrderCount: 3, refundCount30d: 1 },
  { customerId: 'C017', name: '문하린', recentOrderCount: 4, refundCount30d: 0 },
  { customerId: 'C018', name: '배성호', recentOrderCount: 8, refundCount30d: 2 },
  { customerId: 'C019', name: '노은채', recentOrderCount: 2, refundCount30d: 0 },
  { customerId: 'C020', name: '임재원', recentOrderCount: 5, refundCount30d: 1 },
]

export const mockMerchants: MerchantData[] = [
  { storeId: 'S001', storeName: '한식당', merchantUserId: 'M001' },
  { storeId: 'S002', storeName: '치킨하우스', merchantUserId: 'M002' },
  { storeId: 'S003', storeName: '분식연구소', merchantUserId: 'M003' },
]

const orderFixtures: OrderData[] = [
  {
    orderId: 'A1001', customerId: 'C001', storeId: 'S001',
    orderedAt: '2026-09-30T20:10:00+09:00',
    items: [{ itemId: 'I001', name: '김치찌개', price: 12000 }],
    totalAmount: 12000, orderStatus: 'delivering',
  },
  {
    orderId: 'A1006', customerId: 'C006', storeId: 'S002',
    orderedAt: '2026-09-30T19:38:00+09:00',
    items: [{ itemId: 'I009', name: '간장치킨', price: 21000 }],
    totalAmount: 21000, orderStatus: 'delivering',
  },
  {
    orderId: 'A1007', customerId: 'C007', storeId: 'S003',
    orderedAt: '2026-09-30T19:18:00+09:00',
    items: [{ itemId: 'I010', name: '모둠튀김', price: 9000 }],
    totalAmount: 9000, orderStatus: 'delivering',
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
    orderId: 'A1004', customerId: 'C008', storeId: 'S003',
    orderedAt: '2026-09-30T18:30:00+09:00',
    items: [
      { itemId: 'I006', name: '떡볶이', price: 6000 },
      { itemId: 'I007', name: '튀김세트', price: 6000 },
    ],
    totalAmount: 12000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1005', customerId: 'C005', storeId: 'S002',
    orderedAt: '2026-09-30T18:40:00+09:00',
    items: [{ itemId: 'I008', name: '양념치킨', price: 21000 }],
    totalAmount: 21000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1008', customerId: 'C008', storeId: 'S001',
    orderedAt: '2026-09-30T17:10:00+09:00',
    items: [{ itemId: 'I011', name: '된장찌개', price: 11000 }],
    totalAmount: 11000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1009', customerId: 'C009', storeId: 'S001',
    orderedAt: '2026-09-30T19:20:00+09:00',
    items: [
      { itemId: 'I012', name: '제육정식', price: 16000 },
      { itemId: 'I013', name: '된장국', price: 2000 },
    ],
    totalAmount: 18000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1012', customerId: 'C010', storeId: 'S001',
    orderedAt: '2026-09-30T18:50:00+09:00',
    items: [
      { itemId: 'I014', name: '비빔밥', price: 9000 },
      { itemId: 'I015', name: '계란찜', price: 3000 },
    ],
    totalAmount: 12000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1010', customerId: 'C011', storeId: 'S002',
    orderedAt: '2026-09-30T19:40:00+09:00',
    items: [
      { itemId: 'I016', name: '반반치킨', price: 23000 },
      { itemId: 'I017', name: '맥주', price: 4000 },
    ],
    totalAmount: 27000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1014', customerId: 'C014', storeId: 'S002',
    orderedAt: '2026-09-30T17:20:00+09:00',
    items: [{ itemId: 'I018', name: '순살양념', price: 19000 }],
    totalAmount: 19000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1011', customerId: 'C012', storeId: 'S003',
    orderedAt: '2026-09-30T19:10:00+09:00',
    items: [
      { itemId: 'I019', name: '참치김밥', price: 4500 },
      { itemId: 'I020', name: '라면', price: 5000 },
    ],
    totalAmount: 9500, orderStatus: 'delivered',
  },
  {
    orderId: 'A1013', customerId: 'C013', storeId: 'S003',
    orderedAt: '2026-09-30T16:40:00+09:00',
    items: [
      { itemId: 'I021', name: '치즈떡볶이', price: 8000 },
      { itemId: 'I022', name: '순대', price: 5000 },
    ],
    totalAmount: 13000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1015', customerId: 'C015', storeId: 'S001',
    orderedAt: '2026-09-30T19:05:00+09:00',
    items: [
      { itemId: 'I023', name: '갈비탕', price: 14000 },
      { itemId: 'I024', name: '공기밥', price: 1000 },
    ],
    totalAmount: 15000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1016', customerId: 'C016', storeId: 'S001',
    orderedAt: '2026-09-30T17:50:00+09:00',
    items: [{ itemId: 'I025', name: '물냉면', price: 11000 }],
    totalAmount: 11000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1017', customerId: 'C017', storeId: 'S002',
    orderedAt: '2026-09-30T18:20:00+09:00',
    items: [
      { itemId: 'I026', name: '허니콤보', price: 22000 },
      { itemId: 'I027', name: '콜라', price: 2000 },
    ],
    totalAmount: 24000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1018', customerId: 'C018', storeId: 'S002',
    orderedAt: '2026-09-30T16:10:00+09:00',
    items: [{ itemId: 'I028', name: '양념반마리', price: 13000 }],
    totalAmount: 13000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1019', customerId: 'C019', storeId: 'S003',
    orderedAt: '2026-09-30T18:05:00+09:00',
    items: [
      { itemId: 'I029', name: '라볶이', price: 7000 },
      { itemId: 'I030', name: '김밥', price: 4000 },
    ],
    totalAmount: 11000, orderStatus: 'delivered',
  },
  {
    orderId: 'A1020', customerId: 'C020', storeId: 'S003',
    orderedAt: '2026-09-30T15:40:00+09:00',
    items: [{ itemId: 'I031', name: '쫄면', price: 6500 }],
    totalAmount: 6500, orderStatus: 'delivered',
  },
]

/** 고정 Fixture의 시간 간격은 유지하고, 날짜는 앱을 연 시각 기준으로 이동한다. */
export const mockOrders: OrderData[] = orderFixtures.map((order) => ({
  ...order,
  orderedAt: shiftFixtureTime(order.orderedAt),
}))

type StoredDelivery = Omit<DeliveryData, 'delayMinutes'>

const deliveryFixtures: StoredDelivery[] = [
  {
    orderId: 'A1001', riderAssignedAt: '2026-09-30T20:18:00+09:00',
    pickedUpAt: '2026-09-30T20:25:00+09:00',
    expectedAt: '2026-09-30T21:30:00+09:00', deliveryStatus: 'picked_up',
  },
  {
    orderId: 'A1006', riderAssignedAt: '2026-09-30T20:03:00+09:00',
    pickedUpAt: '2026-09-30T20:18:00+09:00',
    expectedAt: '2026-09-30T20:43:00+09:00', deliveryStatus: 'picked_up',
  },
  {
    orderId: 'A1007', riderAssignedAt: '2026-09-30T19:48:00+09:00',
    pickedUpAt: '2026-09-30T20:03:00+09:00',
    expectedAt: '2026-09-30T20:43:00+09:00', deliveryStatus: 'picked_up',
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
  {
    orderId: 'A1008', riderAssignedAt: '2026-09-30T17:20:00+09:00',
    pickedUpAt: '2026-09-30T17:35:00+09:00', expectedAt: '2026-09-30T18:00:00+09:00',
    deliveredAt: '2026-09-30T18:04:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1009', riderAssignedAt: '2026-09-30T19:35:00+09:00',
    pickedUpAt: '2026-09-30T19:48:00+09:00', expectedAt: '2026-09-30T20:10:00+09:00',
    deliveredAt: '2026-09-30T20:08:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1012', riderAssignedAt: '2026-09-30T19:05:00+09:00',
    pickedUpAt: '2026-09-30T19:18:00+09:00', expectedAt: '2026-09-30T19:40:00+09:00',
    deliveredAt: '2026-09-30T19:44:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1010', riderAssignedAt: '2026-09-30T19:55:00+09:00',
    pickedUpAt: '2026-09-30T20:12:00+09:00', expectedAt: '2026-09-30T20:35:00+09:00',
    deliveredAt: '2026-09-30T20:33:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1014', riderAssignedAt: '2026-09-30T17:35:00+09:00',
    pickedUpAt: '2026-09-30T17:50:00+09:00', expectedAt: '2026-09-30T18:15:00+09:00',
    deliveredAt: '2026-09-30T18:20:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1011', riderAssignedAt: '2026-09-30T19:22:00+09:00',
    pickedUpAt: '2026-09-30T19:34:00+09:00', expectedAt: '2026-09-30T19:55:00+09:00',
    deliveredAt: '2026-09-30T19:52:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1013', riderAssignedAt: '2026-09-30T16:55:00+09:00',
    pickedUpAt: '2026-09-30T17:08:00+09:00', expectedAt: '2026-09-30T17:25:00+09:00',
    deliveredAt: '2026-09-30T17:29:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1015', riderAssignedAt: '2026-09-30T19:18:00+09:00',
    pickedUpAt: '2026-09-30T19:32:00+09:00', expectedAt: '2026-09-30T19:55:00+09:00',
    deliveredAt: '2026-09-30T19:58:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1016', riderAssignedAt: '2026-09-30T18:02:00+09:00',
    pickedUpAt: '2026-09-30T18:15:00+09:00', expectedAt: '2026-09-30T18:35:00+09:00',
    deliveredAt: '2026-09-30T18:33:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1017', riderAssignedAt: '2026-09-30T18:35:00+09:00',
    pickedUpAt: '2026-09-30T18:50:00+09:00', expectedAt: '2026-09-30T19:15:00+09:00',
    deliveredAt: '2026-09-30T19:12:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1018', riderAssignedAt: '2026-09-30T16:25:00+09:00',
    pickedUpAt: '2026-09-30T16:40:00+09:00', expectedAt: '2026-09-30T17:05:00+09:00',
    deliveredAt: '2026-09-30T17:08:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1019', riderAssignedAt: '2026-09-30T18:18:00+09:00',
    pickedUpAt: '2026-09-30T18:30:00+09:00', expectedAt: '2026-09-30T18:50:00+09:00',
    deliveredAt: '2026-09-30T18:47:00+09:00', deliveryStatus: 'delivered',
  },
  {
    orderId: 'A1020', riderAssignedAt: '2026-09-30T15:52:00+09:00',
    pickedUpAt: '2026-09-30T16:05:00+09:00', expectedAt: '2026-09-30T16:25:00+09:00',
    deliveredAt: '2026-09-30T16:28:00+09:00', deliveryStatus: 'delivered',
  },
]

export const mockDeliveries: StoredDelivery[] = deliveryFixtures.map((delivery) => ({
  ...delivery,
  riderAssignedAt: shiftOptionalFixtureTime(delivery.riderAssignedAt),
  pickedUpAt: shiftOptionalFixtureTime(delivery.pickedUpAt),
  expectedAt: shiftFixtureTime(delivery.expectedAt),
  deliveredAt: shiftOptionalFixtureTime(delivery.deliveredAt),
}))

/** 배달 완료 시각이 있으면 그 시각, 없으면 앱을 연 시각을 고정된 예상 도착 시각과 비교한다. */
export const calculateDelayMinutes = (
  delivery: Pick<DeliveryData, 'expectedAt' | 'deliveredAt'>,
  now = appStartedAt,
) => {
  const reference = delivery.deliveredAt ? new Date(delivery.deliveredAt).getTime() : now
  return Math.floor((reference - new Date(delivery.expectedAt).getTime()) / 60_000)
}

export const mockCsHistory: CsHistoryData[] = [
  {
    customerId: 'C001', orderId: 'OLD-C001', issueType: 'delivery_delay',
    action: 'guide_customer', status: 'completed',
  },
  {
    customerId: 'C004', orderId: 'OLD-C004', issueType: 'missing_item',
    itemName: '콜라', action: 'mock_refund', amount: 2000, status: 'completed',
  },
  {
    customerId: 'C010', orderId: 'OLD-C010', issueType: 'missing_item',
    itemName: '계란찜', action: 'mock_refund', amount: 3000, status: 'completed',
  },
  {
    customerId: 'C012', orderId: 'OLD-C012', issueType: 'wrong_delivery',
    itemName: '라면', action: 'mock_redelivery', status: 'rejected',
  },
  {
    customerId: 'C014', orderId: 'OLD-C014', issueType: 'missing_item',
    itemName: '콜라', action: 'mock_refund', amount: 2000, status: 'completed',
  },
  {
    customerId: 'C016', orderId: 'OLD-C016', issueType: 'delivery_delay',
    action: 'guide_customer', status: 'completed',
  },
  {
    customerId: 'C018', orderId: 'OLD-C018', issueType: 'missing_item',
    itemName: '콜라', action: 'mock_refund', amount: 2000, status: 'completed',
  },
  {
    customerId: 'C020', orderId: 'OLD-C020', issueType: 'wrong_delivery',
    itemName: '쫄면', action: 'mock_redelivery', status: 'rejected',
  },
]

export const mockEvidenceAnalyses: Record<string, EvidenceAnalysis> = {
  'mock://evidence/wrong-delivery-supports-claim.jpg': {
    evidenceUrl: 'mock://evidence/wrong-delivery-supports-claim.jpg',
    assessment: 'supports_claim',
    observation: '사진에서 주문 메뉴인 양념치킨과 다른 후라이드치킨 형태가 확인됩니다.',
    limitations: ['PoC에서는 이미지 위변조 여부를 판별하지 않습니다.'],
  },
  'mock://evidence/merchant-check-inconclusive.jpg': {
    evidenceUrl: 'mock://evidence/merchant-check-inconclusive.jpg',
    assessment: 'inconclusive',
    observation: '사진에서 포장된 음식 일부만 확인할 수 있습니다.',
    limitations: [
      '사진 밖에 다른 음식이 있는지 확인할 수 없습니다.',
      '포장 당시 전체 구성은 Merchant 확인이 필요합니다.',
    ],
  },
  'mock://evidence/contradicts-claim.jpg': {
    evidenceUrl: 'mock://evidence/contradicts-claim.jpg',
    assessment: 'contradicts_claim',
    observation: '사진의 식별 가능한 메뉴가 고객이 설명한 수령 메뉴와 일치하지 않습니다.',
    limitations: ['PoC 규칙 기반 분석이며 고의성이나 위변조 여부를 판단하지 않습니다.'],
  },
}

const clone = <T>(value: T): T => structuredClone(value)

export const findCustomer = (customerId: string) =>
  clone(mockCustomers.find((customer) => customer.customerId === customerId))

export const findOrder = (orderId: string) =>
  clone(mockOrders.find((order) => order.orderId === orderId))

export const findDelivery = (orderId: string) => {
  const delivery = clone(mockDeliveries.find((item) => item.orderId === orderId))
  if (!delivery) return undefined
  return { ...delivery, delayMinutes: calculateDelayMinutes(delivery) }
}

export const findCsHistory = (customerId: string, orderId?: string) =>
  clone(mockCsHistory.filter((record) =>
    record.customerId === customerId && (!orderId || record.orderId === orderId),
  ))

export const findMerchant = (storeId: string) =>
  clone(mockMerchants.find((merchant) => merchant.storeId === storeId))

export const findEvidenceAnalysis = (evidenceUrl: string) =>
  clone(mockEvidenceAnalyses[evidenceUrl])
