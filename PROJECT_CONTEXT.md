# PROJECT_CONTEXT.md

## 0. 이 문서의 목적

이 문서는 **배달 플랫폼 CS AI Agent PoC** 프로젝트를 이어서 개발하는
Codex/AI 코딩 도구가 프로젝트의 배경, 이미 합의된 설계 원칙, MVP 범위,
사용자 역할, Agent 구조, Tool 계약 방향, 안전장치와 개발 협업 원칙을
빠르게 파악하도록 하기 위한 개발 컨텍스트 문서다.

현재 저장소에 이미 구현된 코드가 있을 수 있다. **이 문서를 읽었다고 기존
코드를 즉시 재작성하거나 대규모 리팩터링하지 않는다. 먼저 저장소 전체를
분석하고, 현재 구현과 이 문서의 목표 구조 사이의 차이를 보고한 뒤 필요한
변경을 제안한다.**

본 프로젝트의 상세 기능 기획은 별도 기획서인 **「배달 플랫폼 CS AI Agent
PoC 기획서 틀」**을 기준으로 한다. 이 문서는 그 기획을 대체하기보다,
특히 구현 과정에서 놓치면 안 되는 합의사항을 보충한다.

------------------------------------------------------------------------

# 1. 프로젝트 개요

## 프로젝트명

**Agentic Delivery CS Resolution System**

## 목적

배달 과정에서 문제가 발생했을 때 고객이 상담원 연결을 기다리지 않고, 앱
내 AI Agent가 주문·배달·고객 CS 이력·정책 등의 데이터를 확인하여
1차적으로 문제를 해결하도록 하는 PoC다.

단순 FAQ 챗봇이 아니라 다음과 같은 업무 흐름을 수행하는 **Agentic CS
Workflow**를 구현한다.

``` text
고객 문의 이해
→ 현재 확보된 정보 확인
→ 필요한 정보/행동 판단
→ 시스템 Tool 호출 또는 추가 질문
→ 결과 관찰
→ 필요 시 증빙 또는 매장 확인
→ 정책 적용
→ Risk Check
→ 자동 처리 / 추가 확인 / 상담원 이관
→ 결과 안내
```

단, 위 순서는 **고정 실행 파이프라인을 의미하지 않는다.** 실제 Agent
구현 원칙은 아래의 Dynamic Agent Loop를 따른다.

------------------------------------------------------------------------

# 2. MVP 범위

초기 PoC에서는 아래 3개 CS 유형만 핵심 범위로 구현한다.

1.  `delivery_delay` --- 배달 지연
2.  `missing_item` --- 메뉴 누락
3.  `wrong_delivery` --- 오배달

범위를 불필요하게 확장하지 않는다.

예를 들어 음식 품질 불만, 결제 오류, 주문 취소 전반, 리뷰 분쟁 등은 MVP
핵심 범위가 아니다.

------------------------------------------------------------------------

# 3. 핵심 사용자와 화면

서비스의 핵심 화면은 세 종류다.

## 3.1 Customer UI

고객이 문제를 신고하고 Agent와 상호작용하는 화면.

주요 기능:

-   로그인한 고객의 주문 조회/선택
-   자연어 CS 문의
-   빠른 문의 유형 선택
-   Agent와 채팅
-   필요한 경우 사진 업로드
-   Agent의 추가 질문에 응답
-   처리 진행 상태 확인
-   처리 결과 확인
-   이전 문의 내역 확인

## 3.2 Merchant UI

Agent가 매장 확인이 필요하다고 판단했을 때 음식점 운영자가 응답하는
화면.

주요 기능:

-   Merchant Confirmation Queue
-   해당 주문 정보 확인
-   고객 주장 확인
-   고객 첨부 사진 확인
-   선택형 응답
    -   `PACKED`
    -   `POSSIBLE_MISSING`
    -   `UNKNOWN`
-   필요 시 추가 코멘트
-   과거 확인 요청 및 최종 결과 확인

## 3.3 Human CS Dashboard

Agent가 자동 처리하지 못하고 상담원에게 이관한 Case를 검토하는 화면.

가능하면 다음 Context를 한 화면에서 확인할 수 있도록 한다.

-   고객 문의 원문
-   주문 정보
-   배달 정보
-   고객 증빙
-   Merchant Response
-   CS History
-   적용된 가상 Policy
-   Risk Flag
-   Agent Summary / 판단 근거
-   이관 사유
-   최종 처리 기능
-   처리 이력

------------------------------------------------------------------------

# 4. 가장 중요한 Architecture 원칙

## Single Agent

이 프로젝트의 핵심 구조는 **Single Agent + Multiple Tools + State +
Dynamic Agent Loop + Human-in-the-loop**이다.

다음처럼 여러 Agent로 쪼개는 것을 기본 구조로 삼지 않는다.

``` text
문의분류 Agent
→ 주문 Agent
→ 정책 Agent
→ Risk Agent
```

`get_order`, `get_delivery`, `get_policy` 등은 Agent가 아니라 **하나의
CS Agent가 사용하는 Tool**이다.

------------------------------------------------------------------------

# 5. 절대 고정 파이프라인으로 만들지 않는다

다음과 같은 구현은 피한다.

``` python
if issue_type == "delivery_delay":
    get_order()
    get_delivery()
    get_policy()

elif issue_type == "missing_item":
    get_order()
    get_cs_history()
    get_policy()
```

이렇게 하면 문의 유형을 분류한 뒤 미리 정해진 순서대로 함수를 실행하는
Workflow가 되고, 본 프로젝트가 의도하는 Agent의 동적 행동 선택이
약해진다.

`issue_type` / Intent는 **State의 한 정보**이지 전체 Tool 순서를
결정하는 고정 routing switch가 아니다.

------------------------------------------------------------------------

# 6. Dynamic Agent Loop

Agent는 매 Step마다 현재 State와 이전 Observation을 보고 **다음에 무엇을
해야 하는지 다시 판단**한다.

개념 구조:

``` text
while goal_not_reached:

    1. 현재 State 관찰

    2. LLM이 next action 판단

    3. 가능한 행동 중 하나 선택
       - ask_customer
       - get_order
       - get_delivery
       - get_cs_history
       - get_policy
       - analyze_evidence
       - request_merchant_confirmation
       - refund
       - redelivery
       - escalate_to_human
       - finish

    4. 선택한 Tool / Action 실행

    5. 결과를 Observation으로 수신

    6. State 갱신

    7. 갱신된 State를 보고 다시 판단
```

따라서 동일한 문의 유형에서도 확보된 정보와 Tool 결과에 따라 실행 경로가
달라질 수 있어야 한다.

### 예시 A --- 배달 지연

``` text
"배달이 너무 늦어요"
→ Agent: 주문 확인 필요
→ get_order()
→ Observation
→ Agent: 배달 상태 필요
→ get_delivery()
→ Observation
→ Agent: 정책 확인 필요
→ get_policy()
→ ...
```

### 예시 B --- 메뉴 누락

``` text
"콜라가 안 왔어요"
→ get_order()
→ Observation: 실제 주문에 콜라 존재
→ Agent가 배달 위치 조회는 불필요하다고 판단할 수 있음
→ get_cs_history()
→ get_policy()
→ ...
```

### 예시 C --- 정보가 모호한 문의

``` text
"주문이 이상해요"
→ Agent가 바로 Tool을 호출하기보다
→ ask_customer
→ 고객 답변
→ State update
→ 다음 행동 재판단
```

------------------------------------------------------------------------

# 7. Merchant Confirmation도 Agent Loop의 일부다

매장 확인은 모든 Case가 반드시 거치는 단계가 아니다.

Agent가 현재 State를 보고 **매장 확인이 필요하다고 판단한 경우에만**
요청한다.

예:

``` text
Customer
→ Agent
→ request_merchant_confirmation()
→ Case status = WAITING_MERCHANT

Merchant UI
→ Merchant Response 입력

Response 저장
→ Agent 재실행
→ 새로운 Observation으로 Merchant Response 사용
→ Policy / Risk / 추가 행동 재판단
```

즉 `WAITING_MERCHANT`는 Agent Workflow의 종료가 아니라 **외부 응답을
기다렸다가 다시 이어지는 상태**다.

------------------------------------------------------------------------

# 8. 정보 부족과 Human Escalation을 구분한다

**정보가 부족하다고 바로 상담원에게 넘기지 않는다.**

정보 부족:

``` text
Agent
→ 추가 질문
또는
→ 필요한 Tool 호출
또는
→ 필요 시 사진 요청
또는
→ 필요 시 Merchant Confirmation
→ 새로운 Observation
→ 재판단
```

Human Escalation은 주로 다음 상황에 사용한다.

-   고객/매장/시스템 정보가 충돌
-   Risk Flag 발생
-   정책으로 처리할 수 없는 예외
-   충분한 추가 확인 후에도 판단 불가능
-   Guardrail에 의해 자동 Action 차단
-   반복적인 시스템/Agent 실패

------------------------------------------------------------------------

# 9. Policy Check와 Risk Check를 분리한다

두 개념을 하나의 로직으로 섞지 않는다.

## Policy Check

질문:

> 이 상황에서 원래 어떤 조치를 해야 하는가?

예:

``` text
주문에 콜라 존재
+ 누락 처리 조건 충족
→ 해당 품목 부분 환불 가능
```

## Risk Check / Guardrail

질문:

> 그 조치를 Agent가 자동 실행해도 되는가?

예:

``` text
동일 주문의 동일 콜라에 대해 이미 환불 완료
→ duplicate_refund
→ 자동 환불 차단
→ Human Escalation
```

------------------------------------------------------------------------

# 10. 가상 Policy

실제 특정 배달 플랫폼의 내부 CS 정책을 알고 있다고 가정하지 않는다.

프로젝트에서 사용하는 환불 기준, 가격 기준, Merchant Confirmation 조건
등은 필요한 경우:

> **PoC 구현을 위해 설정한 가상 정책**

이라고 명시한다.

가상 정책을 실제 배달 플랫폼의 현재 정책이라고 표현하지 않는다.

예시 정책은 기획 단계에서 다음과 같은 형태가 제안되어 있다.

``` text
저가 메뉴 누락
IF item_price <= project_defined_threshold
AND previous_refund_same_item == false
AND risk_flag == false
THEN AUTO_REFUND
```

가격 임계값 등 구체적인 값은 프로젝트 팀이 최종 확정한다.

------------------------------------------------------------------------

# 11. Risk Rule 원칙

Risk Flag는 **고객의 사기나 거짓말을 판정하는 기능이 아니다.**

의미:

> 자동 처리를 중단하고 사람이 추가 검토할 필요가 있다는 신호.

PoC 후보:

-   `duplicate_refund`
    -   동일 주문/동일 품목에 기존 환불 존재
-   `frequent_refund`
    -   프로젝트에서 정의한 기간 내 반복 보상 요청
-   `order_claim_mismatch`
    -   주문에 존재하지 않는 품목에 대한 누락 주장 등
-   `evidence_mismatch`
    -   증빙과 주문/진술 간 명확한 불일치
-   `policy_exception`
    -   정의된 정책으로 처리할 수 없는 사례

Risk Flag 발생 시 기본 원칙:

``` text
AUTO_RESOLVE 금지
→ Guardrail
→ ESCALATE
```

------------------------------------------------------------------------

# 12. Guardrail 우선순위

최종 안전 통제는 LLM의 자연어 판단에만 맡기지 않는다.

``` text
LLM Decision < Code-level Guardrail
```

예:

``` text
LLM next_action = refund

BUT

risk_flags contains duplicate_refund

→ refund 실행 차단
→ escalate_to_human
```

위험하거나 제한된 Action은 실행 직전에 코드 수준 검증을 거치도록
설계한다.

------------------------------------------------------------------------

# 13. 주요 Tool 후보

현재 프로젝트의 핵심 Tool 후보:

``` text
get_order(order_id)

get_delivery(order_id)

get_cs_history(customer_id, order_id)

get_policy(context)

analyze_evidence(image)

request_merchant_confirmation(...)

refund(order_id, item, amount)

redelivery(order_id)

escalate_to_human(case)

ask_customer(question)

finish(result)
```

실제 코드의 기존 함수명/구조가 이미 있다면 먼저 분석하고, 무조건 위
이름으로 재작성하지 않는다.

------------------------------------------------------------------------

# 14. Tool Interface 공동 계약

A/B가 병렬 개발할 수 있도록 Tool의 입력과 출력 형식을 먼저 고정한다.

Tool 내부 구현은 다른 담당자가 몰라도 사용할 수 있어야 한다.

예:

``` json
{
  "success": true,
  "error_code": null,
  "message": null,
  "data": {}
}
```

실패 예:

``` json
{
  "success": false,
  "error_code": "ORDER_NOT_FOUND",
  "message": "주문 정보를 찾을 수 없음",
  "data": null
}
```

구체적인 Schema는 기존 코드 분석 후 팀이 최종 확정한다.

### 중요

-   Tool 이름을 혼자 변경하지 않는다.
-   입력 parameter를 혼자 변경하지 않는다.
-   반환 JSON key를 혼자 변경하지 않는다.
-   Interface 변경은 두 담당자가 합의한다.

------------------------------------------------------------------------

# 15. State 원칙

Agent가 Case 처리 과정에서 필요한 Context를 누적 관리한다.

초기 예시:

``` json
{
  "case_id": null,
  "customer_message": null,
  "issue_type": null,
  "order_id": null,

  "order_info": null,
  "delivery_info": null,
  "cs_history": null,
  "evidence": null,
  "merchant_confirmation": null,

  "policy": null,
  "risk_flags": [],

  "conversation": [],
  "tool_history": [],

  "status": "NEW"
}
```

기존 저장소에 State 구조가 이미 있다면 먼저 비교 분석한다.

### State 수정 책임

권장 원칙:

``` text
Tool
→ 결과만 반환

Agent Controller / Workflow Controller
→ Tool 결과를 받아 State 갱신
```

여러 Tool이 제각각 핵심 State를 직접 수정하는 구조는 피한다.

------------------------------------------------------------------------

# 16. null / unknown / not_found 등의 의미

데이터 상태 표현을 팀 내에서 통일한다.

예:

-   `null` --- 아직 값이 없거나 아직 조회하지 않은 상태
-   `unknown` --- 확인을 시도했으나 현재 알 수 없음
-   `not_found` --- 조회했으나 해당 데이터가 존재하지 않음

실제 표현 방식은 기존 코드 확인 후 팀이 확정하되, **동일 의미를
화면/Tool마다 다르게 사용하지 않는다.**

------------------------------------------------------------------------

# 17. Case Status

기획서에서 제안된 상태 예:

``` text
NEW
COLLECTING_INFO
WAITING_EVIDENCE
CHECKING_DATA
WAITING_MERCHANT
POLICY_CHECK
RISK_CHECK
AUTO_RESOLVED
ESCALATED
CLOSED
```

상태는 UI 장식이 아니라 다음 용도로 활용한다.

-   Case 진행상태 표시
-   Merchant 응답 대기
-   Agent Workflow 재개
-   Human CS Queue
-   처리 이력
-   상태 변경 로그

다만 이 Status 목록 역시 **Agent가 반드시 이 순서대로 이동해야 한다는
뜻은 아니다.**

------------------------------------------------------------------------

# 18. Vision / 고객 사진 처리 원칙

사진은 특히 메뉴 누락/오배달에서 보조 증빙으로 사용할 수 있다.

`analyze_evidence()`는 가능하면 **사진에서 관찰 가능한 사실**을
구조화해서 반환한다.

예:

``` json
{
  "visible_items": ["pizza"],
  "observation": "사진에서 피자로 보이는 음식이 확인됨",
  "cannot_verify": [
    "사진 밖에 다른 음식이 존재하는지 여부"
  ]
}
```

피해야 할 판단:

``` text
"콜라가 사진에 없으므로 반드시 누락됐다."
"고객이 거짓말하고 있다."
```

사진에서 보이지 않는다는 사실과 실제 누락 여부는 동일하지 않다.

Vision 결과는 다른 State:

-   주문정보
-   고객 설명
-   Merchant Response
-   Policy
-   CS History

등과 함께 사용한다.

PoC에서는 고도화된 이미지 위변조 탐지는 범위에서 제외한다.

------------------------------------------------------------------------

# 19. Mock Action 원칙

PoC에서는 실제 배달 플랫폼, 카드 결제, 환불, 라이더 시스템 등에 연결하지
않는다.

예:

``` text
refund()
→ Mock 데이터에 refund action 기록

redelivery()
→ Mock redelivery request 생성
```

UI에서도 실제 운영 처리와 혼동되지 않도록 Mock임을 명확히 한다.

------------------------------------------------------------------------

# 20. Customer Response와 Agent Trace를 분리한다

고객에게 보여주는 자연어 답변과 내부 실행 로그를 구분한다.

예:

## Customer UI

``` text
주문 및 배달 상황을 확인하고 있어요.
```

## Agent Trace / Human CS Context

``` text
Decision: delivery status required
Tool: get_delivery(A1024)
Observation: expected_at=18:50, delivered_at=null
Next Decision: policy lookup required
```

개발용 내부 추론 텍스트 전체를 그대로 사용자에게 노출하지 않는다.

Trace는 다음과 같은 **행동 기록 중심**으로 구성한다.

``` text
State
→ Selected Action
→ Tool Call
→ Tool Result / Observation
→ Next Action
→ Final Action
```

------------------------------------------------------------------------

# 21. 오류 및 Loop 안전장치

Agent는 무한히 Tool을 호출해서는 안 된다.

구현 시 다음을 고려한다.

-   최대 Agent Step 설정 (예: 8\~10회, 최종 값은 팀 합의)
-   존재하지 않는 Tool 호출 → 실행 금지
-   잘못된 arguments → 검증
-   API timeout → 제한된 재시도
-   JSON / structured output parsing 실패 → 제한된 재시도
-   동일 Tool/동일 arguments의 비정상 반복 → Loop 감지
-   반복 실패 → 사용자 오류 안내 또는 Human Escalation

------------------------------------------------------------------------

# 22. 화면 간 하나의 Case를 유지한다

Customer / Merchant / Human CS 화면은 서로 독립적인 앱처럼 동작하면 안
된다.

하나의 CS Case가 화면 사이에서 이어져야 한다.

예:

``` text
Customer UI
case_id = CS001
고객 메뉴 누락 신고
        ↓
Agent
        ↓
Merchant Confirmation 생성
        ↓
Merchant UI
같은 CS001 관련 요청 표시
        ↓
Merchant Response
        ↓
CS001 State에 결과 반영
        ↓
Agent Workflow 재개
        ↓
Risk 발생
        ↓
Human CS Dashboard
같은 CS001의 전체 Context 표시
```

따라서 `case_id`, 상태, 화면 간 전달 데이터 형식은 공동 계약 사항이다.

------------------------------------------------------------------------

# 23. 로그인 / 권한 범위

PoC에서는 가상 계정 기반 로그인을 사용할 수 있다.

역할:

-   Customer
-   Merchant
-   Human CS

기본 접근 원칙:

-   고객: 본인 주문/문의
-   Merchant: 본인 매장 관련 주문/확인 요청
-   Human CS: 이관된 Case 및 처리 이력

프로덕션 수준 인증 시스템 구축은 PoC 핵심 목표가 아니다.

------------------------------------------------------------------------

# 24. 역할 분담 방향

최종 역할 분담은 저장소의 현재 구현 상태를 확인한 뒤 결정한다.

기획상 두 영역은 다음처럼 생각할 수 있다.

## Agent / 업무 판단 영역

-   가상 CS Policy
-   Risk Rule
-   State 설계
-   System Prompt
-   LLM API
-   Dynamic Tool Calling
-   Agent Loop
-   Guardrail
-   Merchant Confirmation 필요 여부 판단
-   Human Escalation 판단
-   Agent Trace

## 서비스 환경 / UI / Tool 영역

-   Mock Customer / Order / Delivery / CS History / Merchant 데이터
-   조회 Tool
-   Mock Action Tool
-   Customer UI
-   Merchant UI
-   Human CS Dashboard
-   이미지 업로드
-   Vision Tool
-   화면 간 Case 상태 연결

단, 현재 저장소에 이미 많은 기능이 구현되어 있을 수 있으므로 **기존
코드의 실제 상태를 보고 작업량을 다시 배분한다.**

------------------------------------------------------------------------

# 25. 반드시 공동 합의해야 하는 사항

아래 항목은 특정 담당자가 단독으로 변경하지 않는다.

1.  MVP 범위
2.  `case_id` 및 주요 ID 규칙
3.  State Schema
4.  Case Status
5.  Tool 이름
6.  Tool 입력 parameter
7.  Tool 반환 Schema
8.  Error Schema
9.  Policy JSON Schema
10. Risk Flag Schema
11. Merchant Response Schema
12. 화면 간 Case 전달 방식
13. Agent Workflow 재개 방식
14. Guardrail 기준
15. Mock Action 의미
16. Agent 최대 Step / 오류 처리 원칙

가능하면 `SYSTEM_SPEC.md` 또는 이에 준하는 공통 명세 파일에서 관리한다.

------------------------------------------------------------------------

# 26. Git / 협업 원칙

-   담당 파일을 가능한 한 분리한다.
-   공통 Interface 변경 전 상대방과 합의한다.
-   State Schema를 임의 변경하지 않는다.
-   Tool 반환 key를 임의 변경하지 않는다.
-   공통 파일의 대규모 변경 전 공유한다.
-   통합 가능한 작은 단위로 commit한다.
-   상대방 코드가 이미 구현되어 있으면 먼저 이해하고 최대한 보존한다.
-   기능 구현 때문에 필요하지 않은 대규모 리팩터링은 피한다.

------------------------------------------------------------------------

# 27. 개발 우선순위

처음부터 모든 기능을 동시에 완성하지 않는다.

우선 **하나의 Case가 End-to-End로 실제 Agent Loop를 통해 처리되는 것**을
첫 목표로 한다.

추천 첫 Case:

``` text
고객: "콜라가 안 왔어요."
→ Agent
→ 필요한 Tool 선택
→ 주문 확인
→ Observation
→ 다음 Tool/Action 재판단
→ Policy / Risk
→ Mock Action 또는 추가 확인
→ 고객 결과
→ CLOSED
```

이 한 Case가 실제 Dynamic Loop로 끝까지 동작하면:

1.  배달 지연
2.  오배달
3.  Vision
4.  Merchant Confirmation
5.  Risk / Human Escalation

순으로 확장한다.

------------------------------------------------------------------------

# 28. Demo에서 보여줄 핵심

최종 Demo에서는 기능 개수보다 **Agent가 상황에 따라 다른 행동을
선택한다는 것**이 보여야 한다.

추천 Case:

### Case 1 --- 배달 지연

``` text
Agent
→ get_order
→ get_delivery
→ 상황 판단
→ 안내 / 정책 확인
```

### Case 2 --- 메뉴 누락

``` text
Agent
→ get_order
→ get_cs_history
→ policy
→ Mock partial refund
```

### Case 3 --- 오배달 + 사진

``` text
Agent
→ 주문 확인
→ 사진 필요 판단
→ analyze_evidence
→ Observation
→ 다음 행동 판단
```

### Case 4 --- Merchant Confirmation

``` text
Agent
→ Merchant 확인 필요 판단
→ WAITING_MERCHANT
→ Merchant Response
→ Agent Workflow 재개
```

### Case 5 --- Risk / Conflict

``` text
Agent
→ Risk Flag
→ Guardrail
→ 자동 Action 차단
→ Human CS Dashboard로 Context 전달
```

모든 Case가 동일한 고정 Tool 순서를 거쳐서는 안 된다.

------------------------------------------------------------------------

# 29. PoC 성공 기준

기획서 기준의 핵심 성공 조건:

-   자연어 문의를 MVP CS 유형으로 이해할 수 있음
-   부족한 정보를 추가 질문할 수 있음
-   Mock DB에서 주문/배달/CS 이력을 조회할 수 있음
-   상황에 따라 필요한 Tool을 선택할 수 있음
-   필요한 경우 Merchant Confirmation을 생성할 수 있음
-   Merchant Response를 받은 뒤 같은 Case의 Agent Workflow를 재개할 수
    있음
-   Policy와 Risk Rule을 적용할 수 있음
-   자동 처리 / 추가 확인 / 매장 대기 / 상담원 이관을 구분할 수 있음
-   Human CS Dashboard에 필요한 Context를 전달할 수 있음
-   Agent의 Tool Call 및 상태 변경을 기록할 수 있음

------------------------------------------------------------------------

# 30. Codex가 저장소를 처음 받았을 때 해야 할 일

**바로 수정하지 말고 먼저 분석한다.**

다음 항목을 확인해서 보고한다.

1.  현재 사용 기술 / 프레임워크
2.  실행 방법
3.  폴더 및 파일별 역할
4.  현재 실제 구현되어 동작하는 기능
5.  UI만 존재하고 mock/hardcoding인 기능
6.  Customer UI 구현 상태
7.  Merchant UI 구현 상태
8.  Human CS Dashboard 구현 상태
9.  Mock DB / persistence 구조
10. LLM API 연결 여부
11. Agent Loop 존재 여부
12. Tool Calling 존재 여부
13. Tool 목록 및 실제 구현 상태
14. Policy 구현 상태
15. Risk / Guardrail 구현 상태
16. Merchant Confirmation 구현 상태
17. Merchant Response 후 Agent Workflow 재개 여부
18. 이미지 업로드 구현 상태
19. 실제 Vision 분석 연결 여부
20. State / Case 관리 구조
21. 화면 간 Case 공유 방식
22. 테스트 코드/테스트 데이터 존재 여부
23. 이 문서의 목표 구조와 현재 구현의 차이

분석 결과는 가능하면 다음처럼 분류한다.

``` text
[이미 구현됨]
그대로 활용 가능

[부분 구현]
수정/연결 필요

[UI/Mock만 존재]
실제 로직 필요

[미구현]
신규 구현 필요

[설계와 충돌]
수정 필요
```

------------------------------------------------------------------------

# 31. Codex 작업 원칙

이후 코드를 수정할 때:

1.  기존 코드 구조를 최대한 보존한다.
2.  한 번에 프로젝트 전체를 재작성하지 않는다.
3.  변경 전에 관련 파일을 먼저 읽는다.
4.  변경 범위를 명확히 설명한다.
5.  기존 기능을 깨지 않는 작은 단위로 구현한다.
6.  가능하면 각 단계마다 실행/테스트한다.
7.  고정 Pipeline으로 Agent를 단순화하지 않는다.
8.  실제 배달 플랫폼 내부 정책을 추측해서 넣지 않는다.
9.  가상 정책은 명시적으로 PoC용으로 관리한다.
10. 새로운 Architecture를 임의로 추가하기 전에 기존 합의와의 필요성을
    확인한다.

------------------------------------------------------------------------

# 32. 첫 Codex 요청 예시

프로젝트 폴더에 이 파일을 넣은 뒤 Codex에 다음과 같이 요청한다.

``` text
PROJECT_CONTEXT.md를 먼저 읽고 현재 저장소 전체 구조를 분석해주세요.

PROJECT_CONTEXT.md는 이 프로젝트에서 이미 논의하고 합의한 개발 방향과
구현 원칙을 정리한 문서입니다.

특히 다음 원칙을 중요하게 봐주세요.

- Single Agent
- State-based Dynamic Tool Calling
- Tool 결과를 Observation으로 받은 뒤 다음 행동 재판단
- 문의 유형별 고정 Tool Pipeline 금지
- Policy Check와 Risk Check 분리
- Code-level Guardrail 우선
- Customer / Merchant / Human CS가 하나의 Case를 공유
- Merchant Response 후 Agent Workflow 재개
- 기존 구현 최대한 보존

아직 코드를 수정하지 마세요.

먼저 다음을 분석해서 보고해주세요.

1. 프로젝트 구조와 실행 방법
2. 파일별 역할
3. 이미 구현된 기능
4. UI 또는 Mock만 존재하는 기능
5. 아직 구현되지 않은 기능
6. LLM / Agent / Tool Calling의 실제 구현 여부
7. Customer / Merchant / Human CS 화면 구현 상태
8. State와 Case 관리 방식
9. PROJECT_CONTEXT.md와 현재 코드의 차이
10. 앞으로 구현할 작업을 의존관계 순서대로 정리

화면에 'Agent 작업 완료', 주문 조회, 정책 확인 등이 표시되더라도
실제 Agent/Tool 실행 결과인지 단순 하드코딩 UI인지 코드를 근거로 구분해주세요.
```

------------------------------------------------------------------------

## 마지막 핵심 요약

이 프로젝트에서 가장 중요한 것은 화면 수나 Tool 수가 아니다.

``` text
현재 State
↓
Agent가 다음 행동 선택
↓
Tool / 질문 / 외부 확인
↓
Observation
↓
State 갱신
↓
Agent 재판단
↓
필요하면 반복
↓
Policy + Risk + Guardrail
↓
Action / Human Escalation
```

이 구조가 실제 코드에서 동작해야 한다.

**Customer / Merchant / Human CS의 세 화면은 이 하나의 CS Case와 Agent
Workflow를 서로 다른 역할에서 사용하는 인터페이스다.**
