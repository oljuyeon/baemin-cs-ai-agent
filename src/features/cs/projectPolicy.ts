/**
 * 수업용 프로젝트 시뮬레이션 정책.
 * 실제 배달 플랫폼의 비공개 운영 기준을 의미하지 않는다.
 */
export const PROJECT_SIMULATION_POLICY = Object.freeze({
  autoRefundMaxAmount: 5_000,
  autoRefundMaxOrderRatio: 0.3,
  maxSimilarClaims30d: 2,
  delayCompensationThresholdMinutes: 30,
  delayCompensationAmount: 3_000,
  merchantWarningSeconds: 120,
  merchantTimeoutSeconds: 180,
  maxMerchantFollowUp: 1,
  delayCouponPerOrder: 1,
})

export type ProjectSimulationPolicy = typeof PROJECT_SIMULATION_POLICY
