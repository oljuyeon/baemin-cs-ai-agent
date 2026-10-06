import type { IssueType, OrderItem } from '../cs'

export type CustomerIssueHint = 'delay' | 'missing' | 'wrong'

export interface MessageUnderstanding {
  issueType: IssueType
  claimedItemName?: string
  confidence: number
  needsClarification: boolean
}

type IntentRule = {
  pattern: RegExp
  weight: number
}

const intentRules: Record<Exclude<IssueType, 'other'>, IntentRule[]> = {
  delivery_delay: [
    { pattern: /배달.{0,10}(늦|지연|안\s*와|안\s*옴|어디)/i, weight: 5 },
    { pattern: /(주문|음식|치킨|피자)(이|가|은|는)?\s*(아직\s*)?(안\s*와|안\s*왔|안\s*옴|못\s*받)/i, weight: 6 },
    { pattern: /아직.{0,12}(도착하지\s*않|도착\s*안|안\s*도착|못\s*받)/i, weight: 5 },
    { pattern: /(도착|예정).{0,12}(시간|시각)?.{0,8}(지났|넘었|늦)/i, weight: 4 },
    { pattern: /(라이더|기사).{0,10}(어디|안\s*와|연락)/i, weight: 3 },
    { pattern: /(주문|음식).{0,8}(전체|전부)?.{0,8}(안\s*와|안\s*옴|못\s*받)/i, weight: 3 },
    { pattern: /(delivery|order).{0,16}(late|delayed|not here|where)/i, weight: 5 },
  ],
  missing_item: [
    { pattern: /(누락|빠졌|빠져|빼먹|덜\s*왔|일부만)/i, weight: 5 },
    { pattern: /(메뉴|음료|콜라|사이다|사이드|소스|밥|튀김|치킨).{0,10}(없|안\s*왔|안\s*옴|못\s*받)/i, weight: 4 },
    { pattern: /(하나|한\s*개|일부).{0,10}(없|안\s*왔|안\s*옴|못\s*받)/i, weight: 3 },
    { pattern: /(missing|left out|not included)/i, weight: 5 },
  ],
  wrong_delivery: [
    { pattern: /(오배달|오배송)/i, weight: 5 },
    { pattern: /(다른|엉뚱|잘못).{0,10}(음식|메뉴|상품|주문)/i, weight: 5 },
    { pattern: /(주문|시킨|시켰).{0,14}(다르|아니|안\s*맞)/i, weight: 4 },
    { pattern: /(wrong|different).{0,16}(food|order|item)/i, weight: 5 },
  ],
}

const hintMap: Record<CustomerIssueHint, Exclude<IssueType, 'other'>> = {
  delay: 'delivery_delay',
  missing: 'missing_item',
  wrong: 'wrong_delivery',
}

const aliasesByItem: Record<string, string[]> = {
  콜라: ['콜라', '코크', '탄산', '음료'],
  사이다: ['사이다', '탄산', '음료'],
  후라이드치킨: ['후라이드치킨', '후라이드 치킨', '후라이드'],
  양념치킨: ['양념치킨', '양념 치킨', '양념'],
  공깃밥: ['공깃밥', '공기밥', '밥'],
  튀김세트: ['튀김세트', '튀김 세트', '튀김'],
  모둠튀김: ['모둠튀김', '모듬튀김', '튀김'],
}

const missingCues = ['누락', '빠졌', '빠져', '빼먹', '없', '안왔', '안옴', '못받', '덜왔']

const normalize = (value: string) => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^0-9a-z가-힣]+/g, '')

const scoreIntent = (message: string, issueType: Exclude<IssueType, 'other'>) =>
  intentRules[issueType].reduce(
    (score, rule) => score + (rule.pattern.test(message) ? rule.weight : 0),
    0,
  )

export function classifyCustomerMessage(
  message: string,
  hint?: CustomerIssueHint | null,
): { issueType: IssueType, confidence: number } {
  const scores = (Object.keys(intentRules) as Array<Exclude<IssueType, 'other'>>)
    .map((issueType) => ({ issueType, score: scoreIntent(message, issueType) }))
    .sort((left, right) => right.score - left.score)

  const [best, second] = scores
  if (!best || best.score === 0) {
    return hint
      ? { issueType: hintMap[hint], confidence: 0.6 }
      : { issueType: 'other', confidence: 0 }
  }

  if (second && best.score === second.score) {
    return hint
      ? { issueType: hintMap[hint], confidence: 0.55 }
      : { issueType: 'other', confidence: 0.35 }
  }

  return {
    issueType: best.issueType,
    confidence: Math.min(0.98, 0.55 + best.score * 0.07),
  }
}

const findAllIndexes = (text: string, needle: string) => {
  const indexes: number[] = []
  let fromIndex = 0
  while (fromIndex < text.length) {
    const index = text.indexOf(needle, fromIndex)
    if (index < 0) break
    indexes.push(index)
    fromIndex = index + Math.max(needle.length, 1)
  }
  return indexes
}

export function resolveOrderItem(message: string, orderItems: OrderItem[]): string | undefined {
  const compactMessage = normalize(message)
  const cueIndexes = missingCues.flatMap((cue) => findAllIndexes(compactMessage, normalize(cue)))

  const candidates = orderItems.flatMap((item) => {
    const aliases = new Set([item.name, ...(aliasesByItem[item.name] ?? [])].map(normalize))
    return [...aliases].flatMap((alias) => findAllIndexes(compactMessage, alias).map((index) => {
      const nearestCueDistance = cueIndexes.length > 0
        ? Math.min(...cueIndexes.map((cueIndex) => Math.abs(cueIndex - (index + alias.length))))
        : 20
      const exactNameBonus = alias === normalize(item.name) ? 4 : 2
      return {
        itemName: item.name,
        score: exactNameBonus + Math.max(0, 12 - nearestCueDistance),
      }
    }))
  })

  if (candidates.length === 0) return undefined
  candidates.sort((left, right) => right.score - left.score)
  const best = candidates[0]
  const competing = candidates.find((candidate) =>
    candidate.itemName !== best.itemName && candidate.score === best.score,
  )
  return competing ? undefined : best.itemName
}

export function understandCustomerMessage(
  message: string,
  orderItems: OrderItem[] = [],
  hint?: CustomerIssueHint | null,
): MessageUnderstanding {
  const intent = classifyCustomerMessage(message, hint)
  const claimedItemName = intent.issueType === 'missing_item'
    ? resolveOrderItem(message, orderItems)
    : undefined

  return {
    ...intent,
    claimedItemName,
    needsClarification:
      intent.issueType === 'other'
      || (intent.issueType === 'missing_item' && !claimedItemName),
  }
}
