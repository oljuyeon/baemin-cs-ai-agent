# CS 공통 실행 환경

Customer, Merchant, Human CS가 같은 Case, Mock Data, Tool, Policy, Risk, 저장 계약을 사용하기 위한 공통 모듈이다.

이 모듈은 AI Agent가 아니다. 다음 Tool 선택, 추가 질문, 종료, 고객 문장 생성은 이후 Customer 영역의 Agent Loop가 담당한다.

## 포함

- `types.ts`: 공통 계약 타입
- `demoData.ts`: 주문, 배달, 고객, 매장, 과거 CS 이력, URL별 증빙 분석
- `policy.ts`: 사람이 정한 Policy와 Risk. 결과만 반환한다.
- `caseStore.ts`: Case 저장, 업무 이력, Tool 이력, 구독, Merchant 응답 저장
- `tools.ts`: 요청된 작업의 결과만 반환한다. Case를 직접 바꾸지 않는다.

고객 문의는 `createCase` 또는 `appendConversation`으로 런타임에 들어온다. 데모 문장을 미리 넣은 Case로 스토어를 시작하지 않는다.

## Tool 사용

```ts
import { agentTools, caseStore } from './features/cs'

const caseData = caseStore.createCase({
  customerId: 'C002',
  orderId: 'A1002',
  storeId: 'S002',
  issueType: 'missing_item',
  customerClaim: message,
})

const result = await agentTools.getOrder({ orderId: caseData.orderId })
if (result.status === 'success') {
  console.log(result.data)
}
```

Tool을 호출해도 Case와 `toolHistory`는 바뀌지 않는다. Agent Loop가 Tool 결과를 Observation으로 저장한다.

`refund`와 `redelivery`는 실제 결제나 배달 시스템에 연결되지 않는다. 주문 일치와 금액 같은 요청 검증 후 Mock 결과만 반환한다. Policy와 Risk로 실행 여부를 결정하지 않는다.

## 역할별 Queue

```ts
caseStore.getCasesForRole('customer', 'C001')
caseStore.getCasesForRole('merchant', 'M001')
caseStore.getCasesForRole('cs')
```

## Merchant 응답 저장

선택지는 `recordMerchantResponse`로 저장한다. 이 호출은 확인을 끝내지 않고 `WAITING_MERCHANT`를 유지한다. 설명과 후속 답변은 `appendMerchantConversation`에 쌓인다. 후속 질문이 끝난 뒤에만 `completeMerchantConfirmation`이 확인 상태를 `completed`로 바꾼다. 그 다음 행동 선택은 Agent Loop가 한다.

```ts
caseStore.recordMerchantResponse(caseId, 'POSSIBLE')
caseStore.appendMerchantConversation(caseId, 'merchant', '해당 시간대는 다시 확인해 보겠습니다.')
caseStore.completeMerchantConfirmation(caseId)
```
