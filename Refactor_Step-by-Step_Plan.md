# 📋 Quillpen 모듈화 정밀 작업 계획서 (Refactor Roadmap)

원본 `inkcanvas-v4.html`의 방대한 로직(3,866라인)을 기능 저하 없이 안정적으로 모듈화하기 위한 최종 가이드라인입니다.

---

## 🎯 목표 (Objectives)
1. **기능 100% 보존:** 원본의 수식 엔진, 스케치 최적화, UNDO/REDO 로직을 그대로 유지.
2. **디자인 일관성:** 프리미엄 글래스모피즘 CSS와 마이크로 애니메이션 복구.
3. **확장성 확보:** 위젯 종류 추가 및 협업 기능 확장이 용이한 구조로 재설계.

---

## 🏗️ 1단계: 아키텍처 설계 (Architecture Design)

### 1.1 파일 구조 정의
```text
src/
├── main.js             # 진입점, 앱 부팅 및 모듈 오케스트레이션
├── styles/
│   └── main.css        # 디자인 시스템 (Variables, Global Styles)
├── js/
│   ├── core/           # 핵심 엔진
│   │   ├── state.js    # 중앙 상태 관리 (Zustand 스타일)
│   │   ├── camera.js   # 뷰포트 (Pan, Zoom, Lerp)
│   │   ├── sync.js     # Supabase 실시간 동기화 및 오프라인 저장
│   │   ├── widgets.js  # 위젯 렌더링 및 생명주기 관리
│   │   └── interaction.js # 전역 이벤트 핸들러 (Event Delegation)
│   ├── components/     # 독립 위젯 로직
│   │   ├── Spreadsheet.js # 엑셀 엔진 (Formula, Formatter)
│   │   ├── Sketch.js      # 드로잉 엔진 (RDP, Pressure)
│   │   └── Toolbar.js     # UI 컨트롤러
│   └── utils/          # 범용 함수
│       ├── formulas.js    # 수식 파서 (Shunting-yard 알고리즘)
│       └── helpers.js     # 좌표 변환, DOM 유틸
```

---

## 🛠️ 2단계: 핵심 기능 이식 전략 (Core Migration)

### 2.1 이벤트 위임(Event Delegation) 방식 채택
*   **문제:** 각 위젯에 `onpointerdown`을 걸면 모듈 로드 시점에 따라 이벤트가 누락되거나 충돌함.
*   **해결:** `#root`나 `#world` 레벨에서 하나의 리스너로 모든 위젯과 앵커 포인트의 인터랙션을 제어함.

### 2.2 수식 엔진(Formula Engine)의 독립화
*   원본의 `evalFormula`, `safeEval` 로직을 `utils/formulas.js`로 분리.
*   위젯 데이터 구조를 원본과 100% 동일하게 유지하여 데이터 마이그레이션 오류 방지.

### 2.3 실시간 동기화(Sync) 안전 장치
*   `pendingChanges` Set을 이용한 디바운스(Debounce) 저장 방식 유지.
*   테이블 이름 규칙(`q_canvases`, `q_widgets`) 전역 상수로 정의하여 실수 방지.

---

## 🚀 3단계: 단계별 작업 순서 (Implementation Steps)

| 단계 | 작업 내용 | 검증 포인트 |
|:---:|:---|:---|
| **Step 1** | CSS 토큰 및 전역 상태(`state.js`) 구축 | 다크모드 및 기본 테마 정상 반영 확인 |
| **Step 2** | 카메라 모듈(`camera.js`) 및 그리드 렌더링 | 무한 캔버스 이동 및 줌 기능 원본 대조 |
| **Step 3** | 위젯 렌더링 파이프라인(`widgets.js`) 구축 | 위젯 생성 및 기본 드래그 기능 확인 |
| **Step 4** | 스프레드시트 컴포넌트(`Spreadsheet.js`) 이식 | 수식 계산 및 행/열 추가 기능 작동 확인 |
| **Step 5** | 연결선(`connections.js`) 및 앵커 포인트 시스템 | 위젯 간 베지어 곡선 연결 및 실시간 추적 |
| **Step 6** | 시스템 모달 및 PWA 설정 | 공유, 내보내기, 설치 기능 복구 |

---

## ⚠️ 주의 사항 (Critical Gotchas)
*   **Scope:** 모듈(`type="module"`) 내 함수는 HTML 인라인 `onclick`에서 보이지 않으므로 반드시 `window` 객체에 노출하거나 동적 리스너를 사용해야 함.
*   **Table Prefix:** 모든 Supabase 호출 시 `q_` 접두사를 반드시 확인.
*   **Performance:** 대량의 위젯 렌더링 시 `requestAnimationFrame`을 통한 렌더링 최적화 루프 유지 필요.

---

> [!TIP]
> **성공적인 모듈화를 위한 팁**
> 코드를 먼저 작성하기보다, 원본의 특정 함수(예: `fitToAll`)를 찾아서 해당 함수가 의존하는 변수가 무엇인지 먼저 파악한 뒤 모듈에 배치하십시오.
