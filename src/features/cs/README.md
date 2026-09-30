# CS 공통 실행 환경

Customer, Merchant, Human CS가 같은 Case와 Mock Tool을 사용하기 위한 공통 모듈이다.

## 기본 사용

```ts
import { agentTools, caseStore } from './features/cs'

const caseData = caseStore.getCase('CASE-B')
if (caseData) {
  const orderResult = await agentTools.getOrder({ orderId: caseData.orderId })
  if (orderResult.status === 'success') {
    console.log(orderResult.data)
  }
}
```

## 대화와 증빙

```ts
caseStore.appendConversation('CASE-C', 'customer', '불고기정식이 누락됐어요.')

const evidenceResult = await agentTools.analyzeEvidence({
  evidenceUrl: 'mock://evidence/case-c.jpg',
})
```

## Policy와 Risk 분리 실행

```ts
const caseData = caseStore.getCase('CASE-B')
if (caseData) {
  await agentTools.checkRisk({ caseData })
  const updatedCase = caseStore.getCase(caseData.caseId)
  if (updatedCase) await agentTools.getPolicy({ caseData: updatedCase })
}
```

## 역할별 조회

```ts
caseStore.getCasesForRole('customer', 'C001')
caseStore.getCasesForRole('merchant', 'M001')
caseStore.getCasesForRole('cs')
```

## 독립 화면 검증

```ts
caseStore.loadDemoStage('C', 'waiting_merchant')
caseStore.loadDemoStage('D', 'escalated')
```

## 응답과 최종 처리

```ts
caseStore.recordMerchantResponse('CASE-C', 'POSSIBLE_MISSING', '누락 가능성이 있습니다.')
caseStore.recordHumanCsResolution('CASE-D', 'reject_refund', 'CS001', '매장 포장 확인')
```

Case와 로그는 브라우저 `localStorage`에 저장된다. `resetCase` 또는 `resetAllDemoCases`를 명시적으로 호출할 때만 Demo 실행 로그가 초기화된다.

`checkRisk`와 `getPolicy`는 별도 Tool이다. Agent가 현재 Case를 보고 호출 시점을 선택하며, 공통 환경은 두 Tool의 실행 순서를 고정하지 않는다.
