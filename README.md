# 바로해결 AI — Main Page PoC

Google PRD **배달 플랫폼 CS AI Agent PoC 기획서 틀**을 기준으로 만든 모바일 우선 메인페이지입니다. 배달 지연, 메뉴 누락, 오배달을 다루는 AI 고객센터의 개념과 고객·음식점 사장님·플랫폼 CS 담당자 역할별 진입점을 제공합니다.

전체 UI 글꼴은 우아한형제들의 **배민 한나체 Pro**를 사용합니다. 공식 TTF 파일과 라이선스 전문은 `public/fonts`에 포함되어 있습니다.

## 실행

```bash
npm install
npm run dev
```

프로덕션 빌드 검증:

```bash
npm run build
```

## 구조

```text
src/
├── app/                 # 전역 라우팅
├── components/
│   ├── common/          # Header, Footer, Button, 언어 전환, 아이콘
│   ├── main/            # 메인페이지 전용 섹션
│   └── customer/        # 고객 주문·문의·AI 처리 플로우
├── features/
│   ├── cs/              # Case, Mock Tool, Policy, Risk, 저장 계약
│   └── roles/           # 역할 정의 및 진입 경로
├── i18n/                # i18next 초기화
├── locales/
│   ├── ko/              # common.json, main.json, customer.json
│   └── en/              # common.json, main.json, customer.json
├── pages/               # Main, Customer, Login, Placeholder 페이지
├── public/fonts/        # 배민 한나체 Pro TTF 및 공식 라이선스 전문
├── styles/              # 디자인 토큰 및 전역/반응형 스타일
└── types/               # 공유 TypeScript 타입
```

## 메인페이지 구성

- 공통 헤더: 브랜드, 서비스/역할 앵커, 언어 전환, 로그인
- Hero: 서비스 핵심 가치와 AI 처리 상태 미리보기
- 역할별 진입: 고객, 음식점 사장님, 플랫폼 CS 담당자
- 주요 기능: 문의 이해 → 정보 확인 → 해결 연결
- PoC 범위: 배달 지연, 메뉴 누락, 오배달
- Agentic workflow 소개
- 데모 모드 CTA와 공통 푸터

## 고객 화면 구성

- 최근 주문 정보와 현재 배달 상태
- 배달 지연, 메뉴 누락, 오배달 빠른 선택
- 빠른 선택 시 입력 초안만 생성하며, 사용자가 직접 전송해야 Agent가 시작
- 자연어 상세 설명과 사진 첨부 UI
- 채팅 문장으로 `CsCase`를 생성한다. 문의 유형별 고정 Tool 순서는 없다
- 공통 Tool, Policy, Risk, Mock 주문 데이터를 Agent가 나중에 사용할 수 있다
- 조치가 끝나도 대화와 주문 맥락을 유지해 후속 요청 가능
- 모바일 하단 내비게이션과 영어 실시간 전환

## i18n

- 기본 언어는 `ko`, 추가 언어는 `en`입니다.
- 메인페이지 문구는 `locales/{lang}/main.json`, 공통 UI는 `locales/{lang}/common.json`에서 관리합니다.
- 헤더 언어 버튼은 새로고침 없이 언어를 전환하며 선택을 `localStorage`에 보존합니다.
- 새 페이지를 추가할 때 `locales/ko/{page}.json`과 `locales/en/{page}.json`을 만들고 `src/i18n/index.ts`의 resources에 namespace를 등록합니다.

## 다른 페이지 추가 방법

1. `src/pages`에 페이지 엔트리를 생성합니다.
2. 페이지 전용 UI는 `src/components/{page}`에 둡니다.
3. 공용으로 승격할 요소만 `src/components/common`에 둡니다.
4. `src/app/router.tsx`에 route를 등록합니다.
5. 역할/도메인 데이터는 `src/features` 아래 별도 모듈로 유지합니다.
6. 새 문구는 페이지 namespace locale JSON에 추가합니다.

## Assumptions / TODO

- 현재 로그인은 가상 계정 진입점이며, 사장님·CS 담당자 페이지는 placeholder입니다.
- 고객 화면의 주문과 고객명은 Mock Data입니다. 고객 문장은 채팅 입력으로 Case에 저장됩니다.
- 다음 Tool을 고르는 AI Agent Loop와 외부 LLM API는 아직 연결하지 않았습니다.
- 실제 인증, 역할 기반 접근 제어, 주문·배달·CS 데이터 연동은 후속 구현 대상입니다.
- 데모 버튼은 `/demo` placeholder로 연결됩니다. 실제 Agent workflow 시뮬레이션은 별도 페이지에서 구현합니다.
- 배달의민족의 민트 계열 친근한 UX 톤을 참고했으며 로고와 실제 화면은 복제하지 않았습니다. 글꼴은 사용자 요청에 따라 공식 배포되는 배민 한나체 Pro를 적용했습니다.
