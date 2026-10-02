# 바로해결 AI — 배달 플랫폼 CS AI Agent PoC

배달 지연, 메뉴 누락, 오배달 문의를 Customer, Merchant, Human CS가 하나의 `CsCase`로 이어서 처리하는 모바일 우선 PoC입니다.

현재 공통 데이터·Tool·Policy·Risk·저장 기능과 세 역할 화면은 `main`에 통합되어 있습니다. Customer 문의도 공통 Case로 저장됩니다. 다만 현재 Case와 Observation을 보고 다음 행동을 고르는 **Dynamic Agent Loop는 아직 연결되지 않았습니다.** Merchant 확인 요청과 Human CS 이관은 임시 샘플 버튼으로 화면 흐름을 확인합니다.

데이터 형식, 상태, Tool 입출력, Policy, Risk, Guardrail의 최종 기준은 [`COMMON_AGENT_CONTRACT`](./README/COMMON_AGENT_CONTRACT.md) `ver4.3`입니다.

앞으로 구현할 기능 범위는 `배달 플랫폼 CS AI Agent PoC 기획서 틀`을 따릅니다. 기획서와 공통 계약이 충돌하면 공통 계약을 우선하고, 기획서의 요구사항은 그 경계 안에서 구현합니다.

## 현재 구현 상태

| 영역 | 상태 | 설명 |
| --- | --- | --- |
| 공통 계약·타입 | 구현됨 | `CsCase`, 상태, 결정값, Merchant 응답, 엄격한 `ToolResult<T>` |
| Mock Data·Tool | 부분 구현 | 데이터·Tool은 구현. 고정 날짜·시각 때문에 Demo 시간 판정 보완 필요 |
| Case Store | 구현됨 | 생성·조회·변경·구독, 역할별 조회, `localStorage` 복원, 이력 저장 |
| Policy·Risk | 구현됨 | 허용 Action·제약과 Risk Flag·차단 Action을 분리해 반환 |
| 가상 로그인·역할 권한 | 부분 구현 | 역할별 진입 화면은 있으나 계정 세션, Route 보호, 역할별 접근 제한은 미구현 |
| Customer 화면 | 부분 구현 | Case 생성과 후속 대화 저장. Agent 실행·결과·이전 문의 연결은 남음 |
| Merchant 화면 | 부분 구현 | Queue·응답·이력은 구현. 실제 Agent 요청과 로그인한 사장님의 매장 제한은 남음 |
| Human CS 화면 | 부분 구현 | 이관 Queue, 상세, Policy, 최종 처리·이력. 전체 Risk 표시 보완 필요 |
| Dynamic Agent Loop | 미구현 | 다음 행동 선택, Tool 실행·재판단, 자동 처리·이관 판단 필요 |
| 전체 화면 연결 | 미완료 | 세 화면은 통합됨. 실제 Agent 요청 대신 일부 Queue를 샘플로 생성 |

상세 현황과 역할별 완료 기준은 [`구현현황과_역할분담.md`](./README/구현현황과_역할분담.md)에서 확인합니다.

## 실행

요구 환경:

- Node.js 20 이상
- npm

의존성 설치와 개발 서버 실행:

```bash
npm ci
npm run dev
```

프로덕션 빌드 검증:

```bash
npm run build
```

타입 검사:

```bash
npm run lint
```

## 화면 파일 경로

화면 연결은 [`src/app/router.tsx`](./src/app/router.tsx)에서 관리합니다.

| 화면 | 구현 파일 | 연결된 URL | 현재 용도 |
| --- | --- | --- | --- |
| 메인 | [`src/pages/MainPage.tsx`](./src/pages/MainPage.tsx) | `/` | 서비스 소개와 역할별 진입 |
| 역할 선택 | [`src/pages/LoginPage.tsx`](./src/pages/LoginPage.tsx) | `/login` | 가상 로그인 전 단계인 Customer, Merchant, Human CS 진입 선택 |
| Customer | [`src/pages/CustomerPage.tsx`](./src/pages/CustomerPage.tsx) | `/customer` | 문의 유형 선택, 고객 문장·첨부 입력, Case 생성 |
| Merchant | [`src/pages/MerchantPage.tsx`](./src/pages/MerchantPage.tsx) | `/merchant` | 매장별 확인 요청 Queue와 응답 이력 |
| Human CS | [`src/pages/CsPage.tsx`](./src/pages/CsPage.tsx) | `/cs` | 이관 Queue, 상세 검토, 최종 처리 이력 |
| Policy 상세 | [`src/pages/PolicyPage.tsx`](./src/pages/PolicyPage.tsx) | `/cs/cases/:caseId/policy` | 해당 Case에 적용되는 허용 Action과 제약 확인 |
| Demo·미등록 경로 | [`src/pages/PlaceholderPage.tsx`](./src/pages/PlaceholderPage.tsx) | `/demo`, `*` | 전체 Agent Demo 연결 예정·Not Found 표시 |

## 핵심 처리 원칙

### 하나의 Case를 세 화면이 공유

Customer, Merchant, Human CS는 같은 `caseId`와 `CsCase`를 사용합니다. 화면마다 별도 Case를 만들지 않습니다.

```text
Customer 문의 접수
→ Agent가 필요한 정보와 Tool 선택
→ 필요하면 Merchant 확인
→ 같은 Case로 Agent 재개
→ 자동 처리 또는 Human CS 이관
→ Customer 결과·이력 반영
```

현재는 첫 단계인 Customer Case 생성과 Merchant·Human CS 화면이 구현되어 있고, 그 사이를 연결할 Agent Loop가 남아 있습니다.

### 고정 Workflow를 만들지 않음

문의 유형에 따라 Tool 순서를 하드코딩하지 않습니다. Agent는 현재 Case와 이전 Tool Observation을 보고 다음 행동을 선택해야 합니다. Demo A~E도 검증용 예상 결과이며 전용 실행 경로가 아닙니다.

### Tool은 결과만 반환

Tool은 Mock 또는 외부 시스템의 결과만 반환합니다. Case 상태, `history`, `toolHistory`와 다음 행동은 Agent Loop가 관리합니다. `refund`와 `redelivery`도 실제 결제·배달을 호출하지 않는 Mock Tool입니다.

### Policy와 Risk를 분리

- Policy: 현재 Case에서 허용되는 Action과 제약
- Risk: Risk Flag와 그 Flag가 막는 Action

Risk Flag만으로 즉시 Human CS에 이관하지 않습니다. 허용된 추가 질문이나 조회로 해결할 수 있는지 먼저 판단합니다.

## 화면별 구현 내용

### Customer

구현됨:

- 최근 주문 형태의 주문·배달 카드
- 배달 지연, 메뉴 누락, 오배달 빠른 선택
- 자연어 문의와 이미지 파일 선택 UI
- 고객 문장으로 공통 `CsCase` 생성
- 같은 Case에 후속 고객 대화 저장
- 선택한 첨부 파일 이름을 `evidenceUrls`에 저장
- `ready`, `working`, `waiting`, `resolved` 고객용 표시 상태
- 한국어·영어 전환과 모바일 하단 내비게이션

현재 제한:

- 문의 유형에 따라 샘플 주문이 고정되어 있으며 주문 변경 버튼은 아직 연결되지 않음
- 빠른 선택은 세 가지 문의 유형만 제공하며 `other` 진입과 자연어 Intent Classification은 아직 없음
- 파일 내용이나 미리보기가 아니라 파일 이름만 저장
- 모바일 카메라 직접 호출, 이미지 미리보기, 복수 첨부는 아직 연결되지 않음
- Case를 저장한 뒤 Agent Tool을 실행하지 않음
- Case 구독, 최종 결과, 처리 시각, 이전 문의 내역은 아직 화면에 연결되지 않음

### Merchant

경로는 `/merchant`입니다. 한 가상 계정에서 다음 세 매장을 선택할 수 있습니다.

- 한식당 `S001`
- 치킨하우스 `S002`
- 분식연구소 `S003`

구현됨:

- 선택한 매장의 `WAITING_MERCHANT` Case만 Queue에 표시
- 주문 메뉴, 고객 주장, 첨부 증빙 상세
- 다음 네 가지 구조화 응답
  - `ADMITTED_MISSING`: 누락 인정
  - `CLAIMS_PACKED`: 포장했다고 진술
  - `POSSIBLE_MISSING`: 누락 가능성
  - `UNKNOWN`: 확인 어려움
- 선택 없이 자연어로 답하거나 선택 뒤 설명 추가
- 선택 응답과 Merchant 대화를 같은 Case에 저장
- 선택을 저장해도 확인을 닫지 않고 `waiting` 유지
- 응답 이력, 새 요청 알림, 요청 후 3분 미응답 표시

Agent Loop가 아직 없으므로 현재는 샘플 버튼으로 임시 확인 요청을 만듭니다. 한 화면에서 세 매장을 바꿀 수 있는 Store Switcher도 데모 편의 기능이며 역할 기반 접근 제어가 아닙니다. 실제 연결과 가상 계정 권한 적용 후 샘플 버튼과 fixture를 제거합니다.

### Human CS

경로는 `/cs`이며 가상 처리 계정은 `CS001`입니다.

구현됨:

- `ESCALATED` Case Queue와 Human CS가 처리한 `CLOSED` 이력
- 주문, 배달, 고객 주장, 증빙 분석, Merchant 응답·대화 표시
- 이관 사유와 Agent Summary 분리
- 해당 상황의 Policy 상세 페이지
- 반복 환불 고객 표시
- Tool Trace 요약
- 다음 다섯 가지 처리 Action
  - 환불 승인
  - 환불 거절
  - 재배달 승인
  - 추가 정보 요청
  - 추가 확인 요청
- 처리 계정·시각·의견 저장 후 Case를 `CLOSED`로 전환
- 새 이관 알림, 3분 미처리 표시, 상담 진행 표시

모든 환불과 재배달은 가상 기록입니다. 현재 계약에서는 다섯 Action 모두 최종 처리이며, 추가 요청 뒤 Customer 채팅을 다시 여는 흐름은 포함하지 않습니다. Agent Loop가 아직 없으므로 이관 Queue도 샘플 버튼으로 확인합니다.

## 공통 모듈

공통 구현은 [`src/features/cs`](./src/features/cs)에 있습니다.

| 파일 | 역할 |
| --- | --- |
| `types.ts` | Case, 상태, Tool, Policy, Risk와 Agent 인터페이스 |
| `demoData.ts` | Customer, Order, Delivery, CS 이력, Merchant, 증빙 Mock Data |
| `caseStore.ts` | Case 저장·조회·변경·구독, 역할별 조회, 각종 처리 결과 저장 |
| `tools.ts` | Mock Tool 구현. Case를 직접 변경하지 않고 결과만 반환 |
| `policy.ts` | Policy와 Risk 계산 |
| `README.md` | 공통 모듈 사용 방법과 계약 요약 |

주요 Tool:

- `get_order`
- `get_delivery`
- `get_cs_history`
- `get_policy`
- `check_risk`
- `analyze_evidence`
- `request_merchant_confirmation`
- `refund`
- `redelivery`
- `escalate_to_human`

## 저장 방식

- Case와 처리 이력: 브라우저 `localStorage`
- 언어 선택: 브라우저 `localStorage`
- 선택한 Merchant 매장: 브라우저 `sessionStorage`
- 같은 브라우저의 다른 탭: `storage` 이벤트와 주기적 화면 갱신으로 변경 반영

서버 데이터베이스나 실제 인증은 사용하지 않습니다. 브라우저 저장소를 지우면 PoC 데이터도 사라질 수 있습니다.

## 프로젝트 구조

```text
.
├── README.md                       # 프로젝트 대표 문서
├── README/                         # 계약·정책·구현 현황 문서
├── public/fonts/                   # 배민 폰트와 라이선스
└── src/
    ├── app/                        # 전역 Router
    ├── components/
    │   ├── common/                 # 공통 UI
    │   ├── main/                   # 메인 화면
    │   ├── customer/               # Customer 화면
    │   ├── merchant/               # Merchant 화면
    │   └── cs/                     # Human CS 화면
    ├── features/
    │   ├── cs/                     # 공통 계약, Store, Tool, Policy, Risk
    │   ├── merchant/               # Merchant Queue와 임시 샘플
    │   ├── csDesk/                 # Human CS Queue와 임시 샘플
    │   └── roles/                  # 역할 정의와 진입 경로
    ├── i18n/                       # i18next 설정
    ├── locales/ko, locales/en/     # 역할별 다국어 문구
    ├── pages/                      # 각 Route의 페이지
    ├── styles/                     # 공통·역할별 스타일
    └── types/                      # Customer UI 전용 타입
```

## 문서

대표 `README.md`를 제외한 최상위 프로젝트 문서는 [`README/`](./README) 폴더에 모았습니다.

| 문서 | 내용 |
| --- | --- |
| [`COMMON_AGENT_CONTRACT.md`](./README/COMMON_AGENT_CONTRACT.md) | 모든 구현 판단의 기준이 되는 공통 계약. 현재 문서 버전은 `ver4.3` |
| [`POLICY.md`](./README/POLICY.md) | 현재 `policy.ts`에 구현된 Policy·Risk 규칙 |
| [`구현현황과_역할분담.md`](./README/구현현황과_역할분담.md) | 현재 구현 상태, 역할 경계, 남은 작업의 상세 범위 |

공통 모듈 자체의 사용 예시는 [`src/features/cs/README.md`](./src/features/cs/README.md)에 있습니다.

## i18n과 디자인

- 기본 언어: 한국어
- 추가 언어: 영어
- 번역 namespace: `common`, `main`, `customer`, `merchant`, `cs`
- 언어 변경은 새로고침 없이 반영되며 선택을 저장
- 메인 UI 글꼴은 우아한형제들의 배민 한나체 Pro 사용
- 공식 TTF와 라이선스 전문은 `public/fonts`에 포함

배달의민족의 민트 계열 친근한 UX 톤을 참고했으며 실제 로고나 운영 화면을 복제하지 않았습니다.

## 남은 핵심 작업

1. 자연어 Intent Classification과 Dynamic Agent Loop 구현
2. 가상 계정 로그인, 세션 유지, 역할별 Route·데이터 접근 제한
3. Customer의 `other` 문의 진입, 최근 주문 선택·가장 최근 주문 자동 제안
4. Customer의 Case 구독, 진행 상태, 최종 결과, 처리 시각, 문의 이력 연결
5. 모바일 카메라 직접 호출, 이미지 미리보기, 복수 첨부 범위 확정과 증빙 분석 연결
6. 실제 Merchant 확인 요청과 응답 후 같은 Case의 Agent Loop 재개
7. 실제 Human CS 이관과 Customer 결과 반영, 전체 Risk Flag 표시
8. 고정된 샘플 날짜·시각을 실행 시점과 무관하게 Demo A~E가 재현되도록 수정
9. Demo A~E 회귀 테스트와 공통 계약 완료 기준 자동화
10. 실제 흐름 검증 후 Merchant·Human CS 샘플 기능 제거

세부 범위와 완료 기준은 [`구현현황과_역할분담.md의 남은 작업 상세`](./README/구현현황과_역할분담.md#남은-작업-상세)를 따릅니다.

## PoC 제한 사항

- 외부 LLM API와 Dynamic Agent Loop 미연결
- 가상 로그인 세션과 역할 기반 Route·데이터 접근 제한 미구현
- 실제 주문·배달·CS·결제 시스템 미연동
- 실제 이미지 분석 대신 URL별 Mock 증빙 분석 사용
- 샘플 주문·배달 시각이 `2026-09-30`으로 고정되어 실행 날짜에 따라 Demo A 판정이 달라질 수 있음
- 환불과 재배달은 Mock 결과만 생성
- 음성 입력·STT는 현재 범위에서 제외
- `/demo`는 아직 Placeholder
