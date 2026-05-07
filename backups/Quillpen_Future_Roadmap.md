# 🚀 Quillpen 향후 개발 로드맵 (Gemini 3.1 Flash 연동용)

이 문서는 기존의 선택적 구현 계획(`optional_implementation_plan.md`)과 아키텍처 감사 결과를 통합하여, **경량 AI 모델(Gemini 3.1 Flash)이 순차적으로 코드를 리팩토링하고 고도화할 수 있도록 작성된 가이드 문서**입니다.

향후 개발 시 아래의 Phase 중 하나를 선택하여 "Phase 1.1 작업을 진행해줘" 와 같이 지시하시면 됩니다.

---

## 📦 Phase 1: 아키텍처 리팩토링 및 모듈화
현재 약 4,000줄의 단일 `index.html` 파일을 프론트엔드 모범 사례에 맞게 분리합니다.

- [ ] **1.1 Vite 기반 프로젝트 구조 전환**
  - 기존 단일 파일을 모듈화 (`src/css`, `src/js`, `src/components`).
  - Vite의 `vite-plugin-singlefile`을 사용하여 개발은 분리하되 배포는 단일 HTML 출력 유지.
  - TypeScript 전면 도입을 통해 데이터 타입(위젯 스키마 등) 안정성 확보.
- [ ] **1.2 상태 관리(State Management) 고도화**
  - 기존 전역 `state` 객체와 수동 `save()`, `renderWidget()` 패턴 철폐.
  - Proxy 객체나 경량 상태 관리(예: Zustand 패턴)를 도입해 상태가 변경되면 UI가 자동으로 렌더링되도록 개편.

---

## ⚡ Phase 2: 핵심 성능 및 Realtime 최적화
무한 캔버스의 퍼포먼스와 다중 접속자 환경에서의 동기화 효율성을 높입니다.

- [ ] **2.1 스케치 데이터 렌더링 최적화**
  - 확정된 과거의 선(Stroke)들은 `OffscreenCanvas` 또는 이미지 버퍼에 캐싱.
  - `redraw()` 시 전체 스트로크를 다시 그리지 않고, 현재 그리고 있는 획만 렌더링하여 모바일 및 저사양 환경 GPU 부하 감소.
- [ ] **2.2 부분 동기화 (Delta Sync) 및 CRDT 도입**
  - Supabase Realtime으로 위젯 JSON 전체를 덮어쓰는(Upsert) 기존 방식 탈피.
  - 추가된 '획'이나 변경된 '셀' 데이터만 전송하는 Delta Sync 로직 구현.
  - 동시 편집 충돌 방지를 위한 Operational Transformation(OT) 또는 Yjs 같은 CRDT 적용.
- [ ] **2.3 이미지 Storage 분리**
  - Base64 인코딩 이미지를 Supabase DB JSON에 직접 저장하는 방식 제거.
  - 이미지를 Supabase Storage에 업로드 후, DB에는 이미지 URL만 저장하도록 수정.

---

## 📊 Phase 3: 스프레드시트 엔진 및 UX 고도화
스프레드시트의 한계를 극복하고 앱 전반의 UX를 강화합니다.

- [ ] **3.1 가상 렌더링 (Virtual Scrolling) 적용**
  - 수천 개의 스프레드시트 셀 렌더링 시 발생하는 DOM 성능 저하 해결.
  - 화면(Viewport)에 노출되는 셀 구간만 동적으로 렌더링하는 가상 스크롤 기법 구현.
- [ ] **3.2 수식 파서 안정화**
  - 기존 정규식 기반 `evalFormula`를 폐기하고, AST(추상 구문 트리) 기반의 전용 파서 엔진 구현 (또는 `hot-formula-parser` 연동).
- [ ] **3.3 오프라인 모드 및 PWA 강화**
  - IndexedDB를 연동하여 `localStorage`의 5MB 한계 극복.
  - Service Worker 캐싱 고도화 및 Background Sync를 통한 완벽한 오프라인-퍼스트 환경 구축.

---

## 🛡️ Phase 4: 보안 및 부가 기능
보안 취약점 대응 및 추가 활용성 확장 기능을 도입합니다.

- [ ] **4.1 XSS 방어벽 구축 (DOMPurify)**
  - 메모 위젯과 스프레드시트에 사용자가 입력한 데이터 렌더링 시 악성 스크립트 실행을 방지하기 위한 `DOMPurify` 샌드박싱 추가.
- [ ] **4.2 스마트 템플릿 시스템**
  - 칸반 보드, 마인드맵, 회의록 등 미리 정의된 위젯 배치와 디자인을 불러오는 템플릿 로더 제공.
- [ ] **4.3 연결선(Connection) 스마트 라우팅**
  - 위젯을 연결하는 화살표가 위젯 본체를 관통하지 않고 직각(Orthogonal)으로 우회하여 그려지는 경로 탐색 알고리즘(A* 등) 적용.

---
💡 **Gemini 3.1 Flash 활용 팁**: 위 로드맵의 세부 체크리스트 단위로 프롬프트를 입력하면 컨텍스트 유실 없이 안정적이고 정밀한 코드 리팩토링 결과를 얻을 수 있습니다.
