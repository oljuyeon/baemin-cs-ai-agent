import type { IssueType, OrderItem } from '../cs'

export type CustomerIssueHint = 'delay' | 'missing' | 'wrong'

export interface MessageUnderstanding {
  issueType: IssueType
  claimedItemName?: string
  confidence: number
  needsClarification: boolean
  issueAmbiguous: boolean
  clarificationQuestion?: string
  detectedLanguage: 'ko' | 'en' | 'other'
}

export interface IssueReassessment {
  action: 'KEEP' | 'CORRECT' | 'CLARIFY'
  issueType: IssueType
  claimedItemName?: string
  confidence: number
  hasNewFacts: boolean
  evidence: string[]
  requiresConfirmation: boolean
  clarificationQuestion?: string
  detectedLanguage: 'ko' | 'en' | 'other'
}

type IntentRule = {
  pattern: RegExp
  weight: number
}

const intentRules: Record<Exclude<IssueType, 'other'>, IntentRule[]> = {
  delivery_delay: [
    { pattern: /배달.{0,10}(늦|지연|안\s*와|안\s*옴|어디)/i, weight: 5 },
    { pattern: /(언제\s*(?:와|와요|오|오나|오냐|도착)|도착.{0,8}언제|몇\s*시.{0,8}(?:와|오|도착))/i, weight: 6 },
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
const receivedCues = ['왔는데', '받았는데', '도착했는데', '있는데']
const arrivalClarification = {
  ko: '배달 전체가 아직 도착하지 않았나요, 아니면 배달은 받았지만 일부 메뉴가 빠졌나요?',
  en: 'Has the delivery not arrived at all, or did it arrive with some items missing?',
}
const missingItemClarification = {
  ko: '어떤 메뉴가 빠졌는지 알려주세요.',
  en: 'Please tell me which item was missing.',
}

const normalize = (value: string) => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^0-9a-z가-힣]+/g, '')

const receivedSuffixPattern = /^(?:은|는|이|가|도|만|은요|는요)?(?:잘)?(?:왔|도착했|받았|있었|포함됐)/
const missingSuffixPattern = /^(?:은|는|이|가|도|만|은요|는요)?(?:안|못|없|누락|빠졌|빠져)/

/**
 * 고객이 특정 주문 상품을 받았다고 명시한 경우를 찾는다.
 * 상품별 고정 문구가 아니라 실제 주문 상품명과 그 별칭 뒤의 수령 표현을 검사한다.
 */
export function isOrderItemExplicitlyReceived(message: string, itemName: string) {
  const compactMessage = normalize(message)
  const aliases = new Set([itemName, ...(aliasesByItem[itemName] ?? [])].map(normalize))

  return [...aliases].some((alias) => findAllIndexes(compactMessage, alias).some((index) => {
    const followingText = compactMessage.slice(index + alias.length, index + alias.length + 16)
    if (missingSuffixPattern.test(followingText)) return false
    return receivedSuffixPattern.test(followingText)
  }))
}

export function isOrderItemExplicitlyMissing(message: string, itemName: string) {
  const compactMessage = normalize(message)
  const aliases = new Set([itemName, ...(aliasesByItem[itemName] ?? [])].map(normalize))

  return [...aliases].some((alias) => findAllIndexes(compactMessage, alias).some((index) => {
    const followingText = compactMessage.slice(index + alias.length, index + alias.length + 16)
    return missingSuffixPattern.test(followingText)
  }))
}

export function latestOrderItemStatement(
  messages: string[],
  itemName: string,
): 'received' | 'missing' | 'conflict' | 'unknown' {
  for (const message of [...messages].reverse()) {
    const received = isOrderItemExplicitlyReceived(message, itemName)
    const missing = isOrderItemExplicitlyMissing(message, itemName)
    if (received && missing) return 'conflict'
    if (received) return 'received'
    if (missing) return 'missing'
  }
  return 'unknown'
}

const detectLanguageWithRules = (message: string): MessageUnderstanding['detectedLanguage'] => {
  const hasKorean = /[가-힣]/.test(message)
  const hasEnglish = /[a-z]/i.test(message)
  if (hasKorean && !hasEnglish) return 'ko'
  if (hasEnglish && !hasKorean) return 'en'
  if (hasKorean) return 'ko'
  return 'other'
}

const noNewIssueFactPattern = /^(네|넵|예|응|알겠(?:어|어요|습니다)?|확인했(?:어|어요|습니다)?|고마워(?:요)?|감사(?:해요|합니다)?|사진(?:을)?\s*(?:보냈|첨부했)(?:어|어요|습니다)?|ok(?:ay)?|yes|got it|thanks?|thank you)[.!?\s]*$/i

export const hasPotentialIssueUpdate = (message: string) => {
  const trimmed = message.trim()
  return trimmed.length > 0 && !noNewIssueFactPattern.test(trimmed)
}

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
    if (isOrderItemExplicitlyReceived(message, item.name)) return []
    const aliases = new Set([item.name, ...(aliasesByItem[item.name] ?? [])].map(normalize))
    return [...aliases].flatMap((alias) => findAllIndexes(compactMessage, alias).flatMap((index) => {
      const nearestCueDistance = cueIndexes.length > 0
        ? Math.min(...cueIndexes.map((cueIndex) => Math.abs(cueIndex - (index + alias.length))))
        : 20
      const exactNameBonus = alias === normalize(item.name) ? 4 : 2
      return [{
        itemName: item.name,
        score: exactNameBonus + Math.max(0, 12 - nearestCueDistance),
      }]
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
  const referencedItemName = resolveOrderItem(message, orderItems)
  const compactMessage = normalize(message)
  const hasMissingCue = missingCues.some((cue) => compactMessage.includes(normalize(cue)))
  const issueType = referencedItemName && hasMissingCue
    ? 'missing_item'
    : intent.issueType
  const claimedItemName = issueType === 'missing_item'
    ? referencedItemName
    : undefined
  const explicitlyPartial = /(누락|빠졌|빠져|빼먹|덜\s*왔|일부만)/i.test(message)
    || receivedCues.some((cue) => compactMessage.includes(normalize(cue)))
  const mentionsGenericMainItem = /(치킨|피자|버거|햄버거|메뉴)/i.test(message)
  const ambiguousMainItemArrival = orderItems.length > 1
    && (Boolean(referencedItemName) || mentionsGenericMainItem)
    && /(안\s*와|안\s*왔|안\s*옴|못\s*받)/i.test(message)
    && !explicitlyPartial
  const issueAmbiguous = issueType === 'other' || ambiguousMainItemArrival

  return {
    issueType,
    confidence: issueType !== intent.issueType
      ? Math.max(intent.confidence, 0.9)
      : intent.confidence,
    claimedItemName,
    needsClarification:
      issueAmbiguous
      || (issueType === 'missing_item' && !claimedItemName),
    issueAmbiguous,
    clarificationQuestion: issueAmbiguous
      ? arrivalClarification[detectLanguageWithRules(message) === 'en' ? 'en' : 'ko']
      : issueType === 'missing_item' && !claimedItemName
        ? missingItemClarification[detectLanguageWithRules(message) === 'en' ? 'en' : 'ko']
        : undefined,
    detectedLanguage: detectLanguageWithRules(message),
  }
}

export function reassessCustomerIssueWithRules(
  messages: string[],
  currentIssueType: IssueType,
  orderItems: OrderItem[] = [],
  hasAskedArrivalClarification = false,
): IssueReassessment {
  const latestMessage = messages.at(-1) ?? ''
  const detectedLanguage = detectLanguageWithRules(latestMessage)
  if (!hasPotentialIssueUpdate(latestMessage)) {
    return {
      action: 'KEEP',
      issueType: currentIssueType,
      confidence: 1,
      hasNewFacts: false,
      evidence: [],
      requiresConfirmation: false,
      detectedLanguage,
    }
  }

  const hint = currentIssueType === 'delivery_delay'
    ? 'delay'
    : currentIssueType === 'missing_item'
      ? 'missing'
      : currentIssueType === 'wrong_delivery'
        ? 'wrong'
        : null
  const latest = understandCustomerMessage(latestMessage, orderItems, hint)
  const combined = understandCustomerMessage(messages.join(' '), orderItems, hint)

  if (hasAskedArrivalClarification) {
    const normalizedLatest = normalize(latestMessage)
    const namesAMissingItem = Boolean(latest.claimedItemName)
      && (
        missingCues.some((cue) => normalizedLatest.includes(normalize(cue)))
        || /(missing|didn'?t\s*(?:arrive|come)|not\s*(?:included|delivered))/i.test(latestMessage)
      )
    const saysSomeItemsAreMissing = /(일부|메뉴|하나|한\s*개).{0,12}(누락|빠졌|없|안\s*왔|못\s*받)/i.test(latestMessage)
      || /(some|one|an?)\s+(?:item|menu).{0,16}(?:missing|didn'?t\s*(?:arrive|come))/i.test(latestMessage)
    const saysWholeDeliveryIsMissing = /(배달|주문|음식)(?:이|가|은|는)?(?:.{0,10}(전체|전부|자체|아무것도))?.{0,12}(안\s*왔|안\s*와|못\s*받|도착하지\s*않)/i.test(latestMessage)
      || /(?:entire|whole)\s+(?:delivery|order).{0,16}(?:not\s*(?:arrived|here)|didn'?t\s*(?:arrive|come))/i.test(latestMessage)

    if (namesAMissingItem) {
      return {
        action: currentIssueType === 'missing_item' ? 'KEEP' : 'CORRECT',
        issueType: 'missing_item',
        claimedItemName: latest.claimedItemName,
        confidence: Math.max(0.92, latest.confidence),
        hasNewFacts: true,
        evidence: [`고객이 제공한 누락 메뉴명: ${latest.claimedItemName}`],
        requiresConfirmation: false,
        detectedLanguage,
      }
    }

    if (saysWholeDeliveryIsMissing) {
      return {
        action: currentIssueType === 'delivery_delay' ? 'KEEP' : 'CORRECT',
        issueType: 'delivery_delay',
        confidence: 0.94,
        hasNewFacts: true,
        evidence: ['고객이 주문 배달 전체를 받지 못했다고 명시함'],
        requiresConfirmation: false,
        detectedLanguage,
      }
    }

    if (saysSomeItemsAreMissing) {
      return {
        action: 'CLARIFY',
        issueType: 'missing_item',
        confidence: 0.82,
        hasNewFacts: true,
        evidence: ['고객이 배달은 받았지만 일부 메뉴가 빠졌다고 설명함'],
        requiresConfirmation: false,
        clarificationQuestion: missingItemClarification[detectedLanguage === 'en' ? 'en' : 'ko'],
        detectedLanguage,
      }
    }
  }

  const candidate = latest.issueType !== 'other' && latest.confidence >= 0.8
    ? latest
    : combined

  if (candidate.issueType === 'other' || candidate.confidence < 0.72) {
    return {
      action: 'CLARIFY',
      issueType: currentIssueType,
      confidence: candidate.confidence,
      hasNewFacts: true,
      evidence: latestMessage ? [`고객의 최신 설명: ${latestMessage.slice(0, 200)}`] : [],
      requiresConfirmation: false,
      clarificationQuestion: detectedLanguage === 'en'
        ? 'Please clarify whether the delivery has not arrived, an item is missing, or you received a different order.'
        : '배달이 아직 도착하지 않은 건지, 일부 메뉴가 빠진 건지, 다른 음식이 도착한 건지 조금 더 알려주세요.',
      detectedLanguage,
    }
  }

  return {
    action: candidate.issueType === currentIssueType ? 'KEEP' : 'CORRECT',
    issueType: candidate.issueType,
    claimedItemName: candidate.claimedItemName,
    confidence: candidate.confidence,
    hasNewFacts: true,
    evidence: latestMessage ? [`고객의 최신 설명: ${latestMessage.slice(0, 200)}`] : [],
    // API를 쓸 수 없을 때의 규칙 판정은 자동 정정하지 않고 보수적으로 확인한다.
    requiresConfirmation: candidate.issueType !== currentIssueType,
    clarificationQuestion: candidate.needsClarification
      ? candidate.clarificationQuestion
      : candidate.issueType !== currentIssueType
        ? candidate.issueType === 'wrong_delivery'
          ? (detectedLanguage === 'en'
              ? 'Did your order arrive, but with food different from what you ordered?'
              : '주문은 도착했지만 주문하신 것과 다른 음식이 온 상황인가요?')
          : candidate.issueType === 'missing_item'
            ? (detectedLanguage === 'en'
                ? 'Did the order arrive with only some of the items missing?'
                : '주문은 도착했지만 일부 메뉴만 빠진 상황인가요?')
            : (detectedLanguage === 'en'
                ? 'Has the order itself still not arrived?'
                : '주문 전체가 아직 도착하지 않은 상황인가요?')
        : undefined,
    detectedLanguage,
  }
}
