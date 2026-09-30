# CS Policy

이 문서는 `src/features/cs/policy.ts`에 구현된 현재 규칙이다. Policy는 허용 Action만 반환하고, 어떤 Tool을 호출할지는 Agent Loop가 결정한다. `evaluatePolicy`는 Risk Flag를 읽지 않는다. Risk는 `check_risk`가 따로 반환한다.

저가와 고가의 기준은 5,000원이다. 5,000원 이하는 저가이고, 5,000원을 넘으면 고가이다.

재배달은 증빙만으로 허용하지 않는다. Merchant가 `POSSIBLE_MISSING`으로 확인한 뒤에만 `mock_redelivery`를 허용한다.

## 공통 Merchant 응답

문의 유형보다 먼저 본다.

| 응답 | policyId | 허용 Action |
| --- | --- | --- |
| `PACKED` | `MERCHANT_CLAIM_CONFLICT` | `human_review` |
| `UNKNOWN` | `MERCHANT_UNKNOWN` | `human_review` |

`PACKED`는 고객 주장과 매장의 정상 포장 응답이 충돌한 것이다. `UNKNOWN`은 매장이 확인 불가로 응답한 것이므로 상담원 이관 후보이다. 둘 다 환불과 재배달을 허용하지 않는다.

`POSSIBLE_MISSING`은 아래 유형별 규칙에서 매장 확인으로 본다.

## 배달 지연

예상 도착 시각 `expectedAt`은 고정된 시각이다. `delayMinutes`는 배달 완료 시각이 있으면 그 시각에서, 없으면 앱을 연 시각에서 `expectedAt`을 뺀 분이다. 0보다 크면 지연이고, 0 이하면 정상 진행이다. 장기 지연 기준은 없다.

| 조건 | policyId | 허용 Action |
| --- | --- | --- |
| 배달 정보 없음 | `DELIVERY_DELAY_NEEDS_DATA` | `guide_customer`, `human_review` |
| `delayMinutes` > 0 | `DELIVERY_DELAYED` | `guide_customer`, `human_review` |
| `delayMinutes` <= 0 | `DELIVERY_ON_TIME` | `guide_customer`, `human_review` |

고정된 예상 도착 시각은 `A1001` 21:30, `A1006` 20:05, `A1007` 19:05이다. 앱을 21:30 전에 열면 `A1001`은 정상 진행이고, `A1006`과 `A1007`은 지연이다.

## 메뉴 누락

주장한 메뉴가 주문에 없으면 `MISSING_ITEM_NEEDS_MORE_INFO`이고 허용 Action은 `human_review`뿐이다.

메뉴가 주문에 있을 때:

| 조건 | policyId | 허용 Action |
| --- | --- | --- |
| Merchant `POSSIBLE_MISSING` | `MISSING_ITEM_AFTER_MERCHANT_CONFIRMATION` | `mock_refund`, `mock_redelivery`, `human_review` |
| 고가이고 매장 확인 전 | `HIGH_PRICE_MERCHANT_CONFIRMATION` | `human_review`. Merchant Confirmation 필요 |
| 저가이고 매장 확인 전 | `LOW_PRICE_MISSING_REFUND` | `mock_refund`, `human_review` |

저가 누락의 기본 처리는 Mock 부분 환불이다. 저가여도 재배달은 매장이 `POSSIBLE_MISSING`으로 확인한 뒤에만 허용한다. 고가는 매장 확인 후 환불과 재배달을 모두 허용한다.

## 오배달

| 조건 | policyId | 허용 Action |
| --- | --- | --- |
| 증빙이 주장을 뒷받침하고 Merchant `POSSIBLE_MISSING` | `WRONG_DELIVERY_REDELIVERY_AFTER_MERCHANT` | `mock_redelivery`, `human_review` |
| 증빙만 주장을 뒷받침 | `WRONG_DELIVERY_NEEDS_MERCHANT` | `human_review`. Merchant Confirmation 필요 |
| 그 외 | `WRONG_DELIVERY_NEEDS_REVIEW` | `human_review` |

증빙이 맞다는 결과만으로 재배달하지 않는다.

## 그 외 문의

`delivery_delay`, `missing_item`, `wrong_delivery`가 아니면 `OUT_OF_SCOPE`이다. 허용 Action은 `guide_customer`, `human_review`이다.

## Risk

Risk가 하나라도 있으면 `autoActionAllowed`는 false이고, 자동 처리 금지와 `ESCALATE` 후보로 전달한다. Policy의 허용 Action 목록 자체는 Risk 때문에 바뀌지 않는다.

| Flag | 조건 |
| --- | --- |
| `duplicate_refund` | 같은 주문, 같은 메뉴의 완료된 `mock_refund` 이력이 있음 |
| `frequent_refund` | 최근 30일 환불 횟수가 5회 이상. 샘플 고객은 `C008` 김진상 |
| `order_claim_mismatch` | 주장한 메뉴가 주문에 없음 |
| `evidence_mismatch` | 증빙 분석이 `contradicts_claim` |
