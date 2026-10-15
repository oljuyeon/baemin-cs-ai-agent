import {
  findCustomer,
  FREQUENT_REFUND_LIMIT_30D,
  type CsCase,
  type RiskResult,
} from '../cs'

export const customerRiskEscalationMessage = (
  caseData: CsCase,
  risk: RiskResult,
  fallbackKo: string,
  fallbackEn: string,
) => {
  if (!risk.flags.includes('frequent_refund')) {
    return caseData.customerLanguage === 'en' ? fallbackEn : fallbackKo
  }

  const refundCount = findCustomer(caseData.customerId)?.refundCount30d
  const countKo = typeof refundCount === 'number'
    ? `현재 확인된 완료 환불은 ${refundCount}회이며, `
    : ''
  const countEn = typeof refundCount === 'number'
    ? `There are ${refundCount} completed refunds on the account in the last 30 days. `
    : ''

  return caseData.customerLanguage === 'en'
    ? `${countEn}Automatic refund and redelivery are available only when completed refunds in the last 30 days are ${FREQUENT_REFUND_LIMIT_30D} or fewer. Because this case exceeds that threshold, a support agent will review it. This does not by itself mean misuse.`
    : `최근 30일 ${countKo}자동 환불·재배달 기준은 완료 환불 ${FREQUENT_REFUND_LIMIT_30D}회 이하입니다. 기준을 초과해 자동 처리는 진행하지 않고 상담원이 확인합니다. 이 기준 초과만으로 부정 이용을 단정하지는 않습니다.`
}
