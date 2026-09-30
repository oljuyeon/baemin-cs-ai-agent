export type CustomerIssue = 'delay' | 'missing' | 'wrong'

export type ChatMessageRole = 'agent' | 'user' | 'tool'

export interface ChatMessage {
  id: string
  role: ChatMessageRole
  content: string
  translate?: boolean
  attachment?: string | null
}

export type AgentActionId =
  | 'trackDelivery'
  | 'checkCompensation'
  | 'checkRefund'
  | 'requestMerchant'
  | 'requestRedelivery'
  | 'escalateHuman'
  | 'confirmCoupon'
  | 'confirmRefund'
  | 'cancelAction'

export interface AgentAction {
  id: AgentActionId
  labelKey: string
  primary?: boolean
}

export type AgentCaseState = 'ready' | 'working' | 'waiting' | 'resolved'
