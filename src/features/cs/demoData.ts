import type {
  CsHistoryData,
  CustomerData,
  DeliveryData,
  EvidenceAnalysis,
  MerchantData,
  OrderData,
} from './types'

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

export const findDelivery = (orderId: string) =>
  clone(mockDeliveries.find((delivery) => delivery.orderId === orderId))

export const findCsHistory = (customerId: string, orderId?: string) =>
  clone(mockCsHistory.filter((record) =>
    record.customerId === customerId && (!orderId || record.orderId === orderId),
  ))

export const findMerchant = (storeId: string) =>
  clone(mockMerchants.find((merchant) => merchant.storeId === storeId))

export const findEvidenceAnalysis = (evidenceUrl: string) =>
  clone(mockEvidenceAnalyses[evidenceUrl])
