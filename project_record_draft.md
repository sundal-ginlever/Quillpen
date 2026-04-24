# inkcanvas 프로젝트 구축 기록 (초안)

> 이 문서는 Claude와의 대화를 통해 진행된 inkcanvas 프로젝트의 전 과정을 사실 중심으로 기록한 초안입니다.  
> 작성일: 2026년 4월 14일

---

## 1. 프로젝트 개요

### 1.1 최초 구상

사용자가 제시한 초기 아이디어는 다음과 같았다.

- 픽셀 단위로 구성된 자유로운 낙서장
- 마우스 선택 또는 손가락으로 영역을 그려 해당 구역에 메모, 기록, 스케치, 스프레드시트 등을 배치
- 확대/축소 기능으로 전체 낙서장을 한 프레임 안에서 조망
- 웹 형식의 단일 애플리케이션

### 1.2 기획 방향 결정 과정

Claude가 3가지 기획안을 제시하였다.

| 기획안 | 명칭 | 난이도 | 주요 특징 |
|--------|------|--------|-----------|
| A | 블록 기반 정적 캔버스 | 낮음 | 고정 그리드 snap-to-grid, 로컬 저장 |
| B | 자유 좌표 무한 캔버스 | 중간 | 무한 평면, 손가락/마우스 영역 드로잉, 클라우드 동기화 옵션 |
| C | 레이어 기반 하이브리드 워크스페이스 | 높음 | 포토샵식 레이어 분리, 수식 파서, 레이어별 내보내기 |

사용자가 기획안 B를 선택한 이유:
- A로 시작해도 결국 B로 개발해야 함
- 로컬 저장만으로는 의미 없음 — 어떤 기기·상황에서도 동일 데이터에 접근해야 함
- 자유도와 클라우드 동기화가 핵심 요건

### 1.3 "픽셀 하나에 데이터" 개념 명확화

대화 중 사용자가 "픽셀 하나에 어떤 데이터가 들어갈 수 있느냐"는 개념적 질문을 제기하였고, Claude가 다음과 같이 정의를 정리하였다.

- **화면 픽셀**: 물리적 점 1개, RGB 색상값만 저장 가능, 문자조차 들어가지 않음
- **논리 셀(블록 위젯)**: 격자의 칸 하나가 N×M 칸을 점유하는 컨테이너. 내부에 완전한 에디터를 포함하는 개념. Notion의 블록과 동일

사용자가 **블록 위젯** 방향이 자신의 구상과 일치함을 확인하고 이 컨셉으로 확정하였다.

### 1.4 Phase 로드맵

| Phase | 내용 | 최종 파일 |
|-------|------|-----------|
| 1 | 무한 캔버스 + 블록 위젯 3종 | `inkcanvas.html` (1,494줄) |
| 2 | 클라우드 동기화 + 인증 | `inkcanvas-v2.html` (1,696줄) |
| 3 | 공유 링크 + 내보내기 + PWA | `inkcanvas-v3.html` (2,293줄) |
| 4 | Undo/Redo + 이미지 + 검색 등 | `inkcanvas-v4.html` (2,812줄) |

---

## 2. Phase 1 — 무한 캔버스 기반 구축

### 2.1 기술 스택 선택

- **언어**: Vanilla JavaScript (프레임워크 없음)
- **렌더링**: HTML Canvas 2D API + CSS transform
- **상태 관리**: 전역 `state` 객체 + 함수형 직접 조작
- **저장**: localStorage (`inkcanvas_v1` 키)
- **번들러**: 없음 (단일 HTML 파일)

### 2.2 카메라 시스템 (핵심 엔진)

카메라 시스템은 전체 무한 캔버스의 핵심으로, 다음 좌표 변환 수식을 구현하였다.

```
screenToWorld: { x: (sx - camera.x) / camera.zoom, y: (sy - camera.y) / camera.zoom }
worldToScreen: { x: wx * camera.zoom + camera.x, y: wy * camera.zoom + camera.y }
```

- 줌 범위: MIN_ZOOM = 0.05 (5%) ~ MAX_ZOOM = 8 (800%)
- 줌 기준점: 마우스 포인터 위치 (focal point) 기준 확대/축소
- 줌 공식: `camera.x = focal.x - (focal.x - camera.x) * scale`

구현 함수:

| 함수 | 역할 |
|------|------|
| `screenToWorld(sx, sy)` | 화면 좌표 → 월드 좌표 |
| `worldToScreen(wx, wy)` | 월드 좌표 → 화면 좌표 |
| `zoomAt(fx, fy, factor)` | focal point 기준 줌 |
| `pan(dx, dy)` | 카메라 이동 |
| `applyCamera()` | CSS transform 적용 + 그리드 재렌더링 |

### 2.3 그리드 시스템

그리드는 `<canvas>` 요소에 직접 렌더링하며 카메라와 연동된다.

- **minor grid**: SNAP(20px) × zoom 단위, 줌 레벨 8px 미만일 때 숨김
- **major grid**: SNAP×5(100px) × zoom 단위
- **origin axes**: 원점(0,0)을 지나는 십자선, 보라색(`rgba(99,102,241,0.22)`)으로 표시
- 그리드 선 색상: minor `rgba(203,213,225,0.55)`, major `rgba(148,163,184,0.4)`

### 2.4 블록 위젯 시스템

#### 위젯 공통 데이터 구조

```javascript
{
  id,        // nanoid() 생성
  type,      // 'memo' | 'sketch' | 'spreadsheet' | 'image'
  x, y,      // 월드 좌표 (왼쪽 상단)
  w, h,      // 픽셀 크기 (월드 단위)
  zIndex,    // 렌더 순서
  locked,    // Phase 4 추가: 잠금 여부
  createdAt, updatedAt
}
```

#### 2.4.1 메모 위젯 (`type: 'memo'`)

- 추가 필드: `content` (텍스트), `color` (배경색), `fontSize`
- 배경색 6종 선택: `#fefce8`(노랑), `#f0fdf4`(초록), `#eff6ff`(파랑), `#fdf4ff`(보라), `#fff1f2`(핑크), `#f8fafc`(회색)
- 32px 높이의 드래그 바(제목 영역) + `<textarea>` 입력 영역 구성
- 색상 피커: 드래그 바 우측 버튼 클릭으로 6색 팔레트 표시

#### 2.4.2 스케치 위젯 (`type: 'sketch'`)

- 추가 필드: `strokes[]` (획 배열), `strokeColor`, `strokeWidth`
- `<canvas>` 요소에 직접 필기 렌더링
- 8가지 색상 팔레트, 4가지 굵기(1/2/4/8px)
- 지우개 모드: `globalCompositeOperation = 'destination-out'`
- 스트로크 렌더링: quadraticCurveTo 사용 (베지어 곡선으로 부드럽게 처리)
- 획 데이터: `{ points: [{x,y}...], color, width }`

#### 2.4.3 스프레드시트 위젯 (`type: 'spreadsheet'`) — Phase 1 초기 버전

초기 Phase 1 구현 시 누락된 기능:

| 기능 | 상태 |
|------|------|
| 셀 더블클릭 편집 | ✅ 구현 |
| =SUM, =AVG, =MIN, =MAX | ✅ 구현 |
| 방향키 탐색 | ❌ 누락 |
| 범위 선택 | ❌ 누락 |
| 수식바(formula bar) | ❌ 누락 |
| 열/행 너비 드래그 조절 | ❌ 누락 |
| 서식(굵기/기울임/숫자포맷) | ❌ 누락 |
| 행/열 삭제 | ❌ 누락 |
| 복사/붙여넣기 | ❌ 누락 |
| 우클릭 컨텍스트 메뉴 | ❌ 누락 |

사용자가 이 누락 사항을 지적하였고, **Phase 1 보완(A안)**으로 즉시 수정하기로 결정하였다.

### 2.5 Phase 1 보완 1차 — 드래그-투-크리에이트 + 그리드 스냅

#### 문제: 블록 위젯 컨셉 불일치

초기 Phase 1에서 위젯 생성 방식이 "클릭 한 번에 고정 크기로 생성"이었으나, 블록 위젯 컨셉에는 "영역을 드래그해서 그리면 그 크기로 위젯 생성"이 맞다는 판단 하에 보완하였다.

#### 추가된 기능

**그리드 스냅 시스템**
- `SNAP = 20` (20px 월드 좌표 단위)
- `snap(v)`: 값을 SNAP 단위로 반올림
- `snapRect(x,y,w,h)`: 사각형 전체를 격자에 스냅
- 위젯 이동 시 손 놓을 때 자동 스냅 적용
- 리사이즈 핸들 놓을 때도 자동 스냅 적용
- 툴바에 `⊹` 버튼으로 스냅 ON/OFF 토글

**드래그-투-크리에이트**
- 도구 선택 후 빈 캔버스에 드래그 → 파란 점선 고스트 프리뷰 표시
- 고스트에 `📝 메모 · N×M 블록` 형태로 블록 크기 실시간 표시
- 마우스 릴리즈 시 스냅 정렬된 크기로 위젯 생성
- 최소 크기 설정: memo `160×100`, sketch `200×140`, spreadsheet `240×160`

**그리드 개선**
- minor(20px)/major(100px) 2단계 그리드
- 이전 단일 그리드에서 계층형으로 교체

### 2.6 Phase 1 보완 2차 — 스프레드시트 전면 재작성

사용자 지적으로 스프레드시트 위젯을 완전히 새로 구현하였다. 이 작업이 Phase 2 이후가 아닌 Phase 1 범위에서 먼저 처리되었다.

#### 새로 구현된 기능 목록

**수식바 (Formula Bar)**
- 셀 주소 표시 영역 (A1, B3 등)
- `fx` 아이콘 + 입력 필드로 구성
- 셀 클릭 시 raw 값(수식 포함) 표시
- 수식 입력 중 참조 셀을 노란색(`#fef08a`)으로 하이라이트

**셀 탐색**
- 방향키(↑↓←→)로 이동
- Enter(아래), Tab(오른쪽), Shift+Tab(왼쪽)
- 클릭 활성화, 더블클릭 수식바 포커스

**범위 선택**
- 마우스 드래그로 범위 선택
- Shift+클릭으로 범위 확장
- 행 번호 클릭 → 행 전체 선택 (파란 배경)
- 열 헤더 클릭 → 열 전체 선택
- 좌상단 코너 클릭 → 전체 선택

**서식**
- `B` 버튼: 굵게 토글 (`boldCells: Set<string>`)
- `I` 버튼: 기울임 토글 (`italicCells: Set<string>`)
- `%` 버튼: 백분율 포맷 (`num * 100 + '%'`)
- `₩` 버튼: 통화 포맷 (`toLocaleString()`)
- `.0` 버튼: 소수 2자리 (`toFixed(2)`)

**열/행 크기 조절**
- 열 헤더 우측 경계 드래그: `colWidths[c]` 딕셔너리에 px 저장
- 행 번호 하단 경계 드래그: `rowHeights[r]` 딕셔너리에 px 저장

**행/열 조작**
- `+행`, `+열` 버튼 (이전부터 존재)
- `-행`, `-열` 버튼 추가 (선택된 행/열 삭제 시 인덱스 재정렬)
- `insertRow(at)`, `insertCol(at)`: 인덱스 이후 전체 셀 키 재매핑

**복사/붙여넣기**
- `Ctrl+C`: 선택 범위를 탭 구분 텍스트로 클립보드에 복사 (Excel 호환)
- `Ctrl+V`: 클립보드에서 붙여넣기 (멀티셀 지원)
- `Delete`/`Backspace`: 선택 셀 내용 삭제

**우클릭 컨텍스트 메뉴**
- 복사, 붙여넣기
- 행 삽입(위/아래), 행 삭제
- 열 삽입(앞/뒤), 열 삭제
- 셀 지우기

**수식 엔진 확장**

| 수식 | 설명 |
|------|------|
| `=SUM(A1:C5)` | 범위 합계 |
| `=AVG(A1:A10)` / `=AVERAGE` | 평균 |
| `=MIN(B1:B10)` | 최솟값 |
| `=MAX(B1:B10)` | 최댓값 |
| `=COUNT(A1:C5)` | 숫자 개수 |
| `=COUNTA(A1:A10)` | 비어있지 않은 셀 수 |
| `=PRODUCT(A1:A5)` | 곱 |
| `=IF(A1>10,"크다","작다")` | 조건 |
| `=CONCAT(A1,B1)` / `=CONCATENATE` | 텍스트 결합 |
| `=ABS(A1)` | 절댓값 |
| `=SQRT(A1)` | 제곱근 |
| `=ROUND(A1)` | 반올림 |
| `=INT(A1)` | 버림(정수화) |
| `=LEN(A1)` | 문자열 길이 |
| `=A1+B2*3` | 셀 참조 사칙연산 |

**오류 처리**
- `#ERR`: 수식 파싱 오류
- `#CIRC`: 순환 참조 (visited Set으로 감지)
- `#DIV/0`: 0 나누기
- `#NUM`: 음수 제곱근

**기타**
- `colLabel(c)`: 다중 알파벳 열 레이블 지원 (A~Z 이후 AA, AB... 처리)
- `parseRef(ref)`: 셀 주소 파싱 (다중 알파벳 컬럼 지원)
- `splitArgs(s)`: 괄호 깊이를 고려한 함수 인수 분리

### 2.7 Phase 1 최종 상태

**파일**: `inkcanvas.html` — 1,494줄

**구현된 기능 요약**:
- 카메라 시스템 (pan/zoom, 5%~800%)
- 마우스 휠 줌 / 핀치 줌 (모바일)
- 드래그-투-크리에이트로 위젯 생성
- 20px 격자 스냅 (ON/OFF 토글)
- 메모 위젯 (색상 6종, 리사이즈)
- 스케치 위젯 (8색/4굵기, 지우개, 베지어 곡선)
- 스프레드시트 위젯 (수식 16종, 수식바, 범위선택, 서식, 우클릭 메뉴)
- 영역 드래그 다중 선택, Shift+클릭 다중 선택
- Delete 삭제, Esc 취소
- `V`/`H`/`M`/`S`/`T` 단축키
- 그리드 ON/OFF 토글
- localStorage 자동 저장/복원

---

## 3. Phase 2 — 클라우드 동기화 + 인증

### 3.1 설계 방향

- **BaaS 선택**: Supabase (DB + Auth + Storage + Realtime 내장)
- **이유**: 혼자 개발하는 상황에서 백엔드를 직접 구축하지 않아도 됨
- **저장 전략**: `save()` / `load()` 함수만 localStorage → 클라우드로 교체
- **오프라인 지원**: localStorage 폴백 (연결 끊겨도 로컬 작동, 재연결 시 sync)

### 3.2 Supabase DB 스키마

**canvases 테이블**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid PK | gen_random_uuid() |
| `user_id` | uuid FK | auth.users 참조 |
| `name` | text | 캔버스 이름 |
| `camera` | jsonb | `{x, y, zoom}` |
| `settings` | jsonb | `{showGrid, snapOn}` |
| `created_at`, `updated_at` | timestamptz | 자동 갱신 |

**widgets 테이블**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | text PK | nanoid() 생성 |
| `canvas_id` | uuid FK | canvases 참조 |
| `user_id` | uuid FK | auth.users 참조 |
| `type` | text | memo/sketch/spreadsheet/image |
| `x`, `y`, `w`, `h` | float8 | 위치/크기 |
| `z_index` | int | 렌더 순서 |
| `data` | jsonb | 타입별 데이터 |

**RLS (Row Level Security)**
- canvases, widgets 모두 RLS 활성화
- `user_id = auth.uid()` 정책으로 본인 데이터만 접근

### 3.3 Auth 시스템

구현된 인증 방식:
1. **이메일/비밀번호** 로그인 및 회원가입
2. **Google OAuth** 로그인 (`signInWithOAuth`)
3. 세션 자동 복원 (`getSession()`, `onAuthStateChange`)
4. 로그아웃 (툴바 계정명 클릭)

Auth UI 구성:
- 로그인/회원가입 전환 토글
- 오류 메시지 표시 (`auth-error`)
- 이메일 확인 메시지 표시 (`auth-msg`)
- 화면 전환 fade 애니메이션

### 3.4 동기화 엔진

**저장 흐름**:
```
사용자 조작 → save() 호출 → saveLocal() (즉시) → schedulePush() (1.2초 debounce) → flushToCloud()
```

**`flushToCloud()` 동작**:
1. 현재 state의 모든 위젯을 Supabase에 upsert (onConflict: 'id')
2. 원격에만 있는 위젯(로컬에서 삭제된 것) 감지 후 DELETE
3. 캔버스 메타(camera, settings) update

**`widgetData(w)` 직렬화**:
- 타입별로 필요한 필드만 `data` jsonb에 저장
- 스프레드시트: `boldCells`, `italicCells`는 Set → Array로 변환 필요

**`rowToWidget(row)` 역직렬화**:
- Supabase row → 위젯 객체 복원
- 스프레드시트: Array → Set 복원

### 3.5 Realtime 동기화

Supabase Realtime PostgreSQL Changes를 구독:

```javascript
sb.channel('canvas-' + currentCanvasId)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'widgets',
    filter: `canvas_id=eq.${currentCanvasId}`
  }, handleRealtimeChange)
  .subscribe()
```

`handleRealtimeChange()` 처리:
- `DELETE`: 로컬 위젯 DOM 제거
- `INSERT`/`UPDATE`: `updatedAt` 비교 후 더 최신인 경우만 적용
  - memo: textarea가 포커스 중이 아닐 때만 내용 갱신
  - spreadsheet: DOM 제거 후 전체 리빌드
  - 기타: position/size/zIndex 소프트 업데이트

### 3.6 멀티 캔버스 관리

- 우상단 sync indicator 클릭 → 캔버스 목록 팝업
- 캔버스 간 전환: `switchCanvas(id, name)` — 현재 캔버스 저장 후 새 캔버스 로드
- 새 캔버스 생성: Supabase insert 후 빈 캔버스로 전환
- 마지막 열었던 캔버스 자동 복원: localStorage에 `inkcanvas_last_canvas_{userId}` 저장

### 3.7 Phase 2 재점검 (v2 → v2 수정본)

Phase 1 스프레드시트 보완 이후, Phase 2 파일이 구버전 스프레드시트 기준으로 작성되어 있다는 문제가 발견되었다. 다음 6가지 항목이 수정되었다.

| 수정 번호 | 항목 | 문제 | 수정 내용 |
|-----------|------|------|-----------|
| FIX 1 | `widgetData()` | 스프레드시트 메타 누락 | `colWidths`, `rowHeights`, `cellFmt`, `boldCells`, `italicCells` 추가 |
| FIX 2 | `rowToWidget()` | Set 복원 없음 | `boldCells`, `italicCells` Array → Set 복원 추가 |
| FIX 3 | `handleRealtimeChange()` | 스프레드시트 소프트 업데이트 없음 | 스프레드시트는 전체 리빌드, 메모는 포커스 체크 분기 추가 |
| FIX 4 | pan 이중 실행 버그 | `pointermove` 리스너 2개 등록 → 이동 속도 2배 | 단일 리스너로 통합, `lastPanPt` 기반 델타 계산 |
| FIX 5 | `saveLocal()` | `Set`은 JSON.stringify 시 `{}` 로 변환 | localStorage 저장 전 `[...Set]` 배열로 변환 |
| FIX 6 | `loadLocal()` | 배열을 Set으로 복원하지 않음 | 로드 시 `new Set(array)` 복원 추가 |

### 3.8 Phase 2 최종 상태

**파일**: `inkcanvas-v2.html` — 1,696줄 (수정 후)

---

## 4. Phase 3 — 공유 링크 + 내보내기 + PWA

### 4.1 Supabase 스키마 추가

canvases 테이블에 2개 컬럼 추가:

```sql
share_enabled  boolean not null default false
share_token    text unique
```

RLS 정책 2개 추가:
- `canvases: shared read` — `share_enabled = true`인 캔버스 비로그인 읽기 허용
- `widgets: shared read` — 공유된 캔버스의 위젯 비로그인 읽기 허용

### 4.2 공유 링크 시스템

**URL 형식**: `https://...inkcanvas.html?share={token}`

**토큰 생성**:
```javascript
token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
// → 약 22자 랜덤 문자열
```

**공유 모드 진입 (`checkShareMode()`)**:
1. URL 쿼리에서 `share` 파라미터 추출
2. Supabase에서 `share_token` 일치하는 캔버스 조회 (비로그인으로 가능)
3. 캔버스 및 위젯 데이터 로드
4. 상단에 "읽기 전용 공유 캔버스" 배너 표시
5. 편집 UI 비활성화 (`disableEditing()`)
   - 삭제 버튼, 리사이즈 핸들 `pointer-events: none`
   - 편집 관련 tool-btn 숨김

**공유 ON/OFF 토글**: `Ctrl+Shift+S` 단축키 또는 툴바 `🔗 공유` 버튼

### 4.3 내보내기 기능

#### PNG 내보내기 (`exportPNG()`)

- 모든 위젯의 월드 좌표 기준 바운딩 박스 계산
- 여백(PAD=40px) 포함, scale = min(2, 2000/maxDim)
- `<canvas>` 요소에 직접 재렌더링:
  - 배경: `#f8fafc`
  - 격자 점(20px 간격, 반투명)
  - 위젯별 배경/테두리 (`roundRect()` 함수로 둥근 모서리)
  - 스케치 위젯: 모든 stroke 재렌더링 (quadraticCurveTo)
  - 타입 레이블 표시
- `canvas.toBlob()` → 파일 다운로드

#### JSON 백업 (`exportJSON()`)

저장 구조:
```json
{
  "version": 3,
  "exportedAt": "ISO 날짜",
  "canvasName": "...",
  "camera": { "x": ..., "y": ..., "zoom": ... },
  "settings": { "showGrid": ..., "snapOn": ... },
  "widgets": [ ... ]
}
```

- `boldCells`, `italicCells`: Set → Array 변환 후 직렬화

#### JSON 가져오기 (`importJSON()`)

- `<input type="file" accept=".json">` 트리거
- confirm() 다이얼로그로 확인
- 현재 캔버스 전체 교체
- Set 타입 복원 포함

#### CSV 내보내기 (`exportCSV()`)

- 캔버스 내 모든 스프레드시트 위젯 대상
- 수식은 계산된 결과값으로 출력 (`evalFormula()` 호출)
- 멀티 시트: `# Sheet 1`, `# Sheet 2` ... 구분자로 연결
- Excel 호환 형식 (쌍따옴표로 값 감싸기, 내부 쌍따옴표 이스케이프)

### 4.4 PWA (Progressive Web App)

**manifest 인라인 삽입** (별도 파일 불필요):
```html
<link rel="manifest" href="data:application/json,{...}"/>
```

manifest 내용:
- `display: "standalone"` (주소창 없는 전체화면)
- `theme_color: "#6366f1"` (인디고)
- SVG 아이콘 (data: URL로 인라인)

**설치 흐름**:
1. `beforeinstallprompt` 이벤트 수신 → `deferredInstallPrompt` 저장
2. 툴바에 `📲 앱 설치` 버튼 자동 표시
3. 버튼 클릭 → `deferredInstallPrompt.prompt()` 호출
4. 설치 완료 후 버튼 숨김

**메타 태그 추가**:
- `theme-color`
- `mobile-web-app-capable`
- `apple-mobile-web-app-capable`
- `apple-mobile-web-app-status-bar-style`

### 4.5 캔버스 이름 편집

- 툴바에 `<input class="canvas-name-edit">` 인라인 배치
- hover 시 밑줄(`border-bottom: 2px solid #c7d2fe`) 표시
- focus 시 인디고 밑줄(`border-bottom: 2px solid #6366f1`)
- Enter 확정 → `renameCanvas()` 호출 → Supabase update + `document.title` 변경
- Esc 취소 → 이전 이름 복원

### 4.6 단축키 도움말

- `?` 키로 모달 팝업
- 2열 그리드 레이아웃으로 단축키 목록 표시
- `Esc`로 닫기

### 4.7 Phase 3 최종 상태

**파일**: `inkcanvas-v3.html` — 2,293줄

**추가된 단축키**:
- `Ctrl+Shift+S`: 공유 링크
- `Ctrl+Shift+E`: 내보내기
- `?`: 단축키 도움말
- `Esc`: 모든 모달 닫기

---

## 5. Phase 4 — 생산성 기능 완성

### 5.1 Undo / Redo 시스템

**스택 구조**:
- `undoStack[]`: 최대 60개 스냅샷
- `redoStack[]`: 다시 실행 스냅샷
- `undoBlocked` 플래그: undo 실행 중 재귀 스냅샷 방지

**스냅샷 저장 방식**:
```javascript
{
  widgets: JSON.stringify([...widgetArray]),  // Set은 Array로 직렬화
  camera: { x, y, zoom }
}
```

**`save()` 패치**:
```javascript
const _origSave = save;
function save() {
  snapshotForUndo();  // 저장 전 스냅샷
  _origSave();
}
```

**`applySnapshot()` 동작**:
1. 현재 world의 모든 위젯 DOM 제거
2. `state.widgets` 초기화
3. 스냅샷에서 위젯 복원 (Set 타입 재생성 포함)
4. 모든 위젯 renderWidget() 재호출
5. 카메라 위치 복원 + applyCamera()

**단축키**:
- `Ctrl+Z`: undo
- `Ctrl+Y` 또는 `Ctrl+Shift+Z`: redo

**UX**: 하단 토스트 메시지로 "실행 취소" / "다시 실행" / "더 이상 되돌릴 수 없습니다" 표시 (1.4초 후 자동 사라짐)

### 5.2 위젯 복제 (`Ctrl+D`)

```javascript
function duplicateSelected() {
  state.selectedIds.forEach(id => {
    const copy = JSON.parse(JSON.stringify(w, (k,v) => v instanceof Set ? [...v] : v));
    copy.id = nanoid();
    copy.x += 24; copy.y += 24;  // 오른쪽 아래 24px 오프셋
    copy.zIndex = state.nextZ++;
    copy.locked = false;
    // Set 복원
    state.widgets[copy.id] = copy;
    renderWidget(copy);
  });
}
```

- 다중 선택 시 선택된 모든 위젯 동시 복제
- 복제 후 복제본들이 자동 선택 상태

### 5.3 이미지 위젯 (`type: 'image'`)

**추가 필드**: `src` (base64 data URL), `alt` (파일명), `objectFit` (contain/cover/fill)

**이미지 로드 방법 2가지**:
1. 위젯 내 드롭 존 클릭 → `<input type="file">` 트리거
2. 파일을 드롭 존에 직접 드래그 앤 드롭
3. (Phase 4 추가) 캔버스 빈 영역에 이미지 파일 드롭 → 자동 위젯 생성

**파일 처리**: `FileReader.readAsDataURL()` → base64로 인코딩 후 `data` jsonb에 저장

**표시 모드 전환**:
- 헤더의 `<select>` 드롭다운: contain / cover / fill
- 변경 시 `<img>` 의 `object-fit` CSS 속성 즉시 변경

**단축키**: `I` 키로 이미지 도구 활성화

**Supabase 저장 시**: `widgetData()` 에서 `{ src, alt, objectFit }` 반환

> 주의: base64 이미지는 크기가 매우 크므로 대용량 이미지의 경우 Supabase 5MB jsonb 제한에 주의 필요.

### 5.4 위젯 잠금 (`Ctrl+L`)

**잠금 시각 표시**: CSS로 `outline: 2px dashed #f59e0b` 주황색 점선 테두리 + `🔒` 이모지

**`deleteWidget()` 패치**:
```javascript
const _origDeleteWidget = deleteWidget;
function deleteWidget(id) {
  if (state.widgets[id]?.locked) {
    showUndoToast('잠긴 위젯은 삭제할 수 없습니다 (Ctrl+L)');
    return;
  }
  _origDeleteWidget(id);
}
```

**이동 차단**: 인터랙션 핸들러에서 드래그 시작 시 `w.locked` 체크 (Phase 4에서 추가 예정이나 현재는 delete만 차단)

**토글 동작**: 선택된 모든 위젯이 잠긴 상태면 전체 해제, 아니면 전체 잠금

### 5.5 화면 맞춤 (`Ctrl+Shift+F`)

**알고리즘**:
1. 모든 위젯의 바운딩 박스 계산 (minX, minY, maxX, maxY)
2. 여백 PAD = 80px
3. `newZoom = Math.min(4, Math.max(0.05, Math.min(vw/bw, vh/bh)))`
4. 중앙 정렬: `camera.x = (vw - (maxX+minX)*zoom) / 2`

**UX**: 실행 시 화면 전체에 인디고 반투명 플래시 애니메이션 (`fitFlash` @keyframes, 0.4초)

### 5.6 텍스트 검색 (`Ctrl+F`)

**검색 대상**:
- 메모 위젯: `content` 필드 (대소문자 구분 없음)
- 스프레드시트 위젯: `cells` 딕셔너리의 모든 값
- 이미지 위젯: `alt` 파일명

**UI 구성**:
- 툴바 아래 검색 바 표시 (`top: 76px`)
- 🔍 아이콘 + 텍스트 입력 + 결과 카운트 + ↑↓ 네비게이션 버튼 + × 닫기

**결과 처리**:
- 히트 위젯 ID 배열 `searchResults[]` 저장
- `jumpToSearch(idx)`: 카메라를 위젯 중앙으로 이동 + `.search-highlight` 클래스 (노란 outline) 적용
- `searchNav(dir)`: ↑↓ 버튼 또는 Enter로 결과 간 이동

### 5.7 Phase 4 기술 구현 패턴

Phase 4에서는 기존 함수를 래핑(wrapping)하는 패턴을 일관되게 사용하였다.

```javascript
// 패턴: _orig 변수로 원본 저장 → 동명 함수로 덮어쓰기
const _origSave        = save;
const _origRenderWidget = renderWidget;
const _origDeleteWidget = deleteWidget;
// ... etc
```

이 방식의 장점:
- 이전 Phase 코드를 수정하지 않고 기능 추가 가능
- 체인 형태로 여러 Phase의 확장이 연결됨

단점/주의사항:
- 함수가 여러 개 선언되어 보이지만 JavaScript hoisting으로 마지막 선언이 유효
- `function` 선언식은 hoisted되므로, 실제로는 `_orig`에 저장된 이전 버전이 올바르게 참조됨

### 5.8 Phase 4 최종 상태

**파일**: `inkcanvas-v4.html` — 2,812줄

**전체 함수 수**: 약 90개 (중복 래핑 포함)

---

## 6. Supabase 설정 파일

**파일**: `supabase_setup.sql` — 94줄

**포함 내용**:
1. `canvases` 테이블 생성
2. `widgets` 테이블 생성
3. 인덱스 5개 (`user_id`, `share_token`, `canvas_id`)
4. RLS 활성화 및 정책 4개
5. `updated_at` 자동 갱신 트리거 2개
6. Phase 3 share 컬럼 추가용 ALTER TABLE (주석 처리)

---

## 7. 전체 기술 아키텍처

### 7.1 레이어 구조

```
┌─────────────────────────────────────────────────┐
│  클라이언트 (브라우저 / 모바일)                    │
│  ┌───────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Camera    │ │ Widget   │ │ Interaction    │  │
│  │ System    │ │ Engine   │ │ (Pointer/Touch)│  │
│  └───────────┘ └──────────┘ └────────────────┘  │
│  ┌───────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Undo/Redo │ │ Search   │ │ Export/Share   │  │
│  └───────────┘ └──────────┘ └────────────────┘  │
└───────────────────┬─────────────────────────────┘
                    │ Supabase SDK (CDN)
┌───────────────────▼─────────────────────────────┐
│  Supabase (클라우드)                              │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐   │
│  │ Auth     │ │ Database │ │ Realtime      │   │
│  │ (JWT)    │ │ (PG)     │ │ (WebSocket)   │   │
│  └──────────┘ └──────────┘ └───────────────┘   │
└─────────────────────────────────────────────────┘
```

### 7.2 데이터 흐름

```
사용자 조작
    ↓
state.widgets 업데이트 (updateWidget)
    ↓
DOM 업데이트 (직접 style 조작 or rebuildTable)
    ↓
save() 호출
    ├→ snapshotForUndo() [Phase 4]
    ├→ saveLocal() → localStorage
    └→ schedulePush() → 1.2초 debounce → flushToCloud() → Supabase

Supabase Realtime 수신
    ↓
handleRealtimeChange()
    ├→ DELETE: DOM 제거
    └→ INSERT/UPDATE: updatedAt 비교 → 최신이면 상태 갱신
```

### 7.3 위젯 라이프사이클

```
도구 선택 (setTool) → 드래그-투-크리에이트 → createWidget()
    ↓
state.widgets[id] = widget
    ↓
renderWidget(w) → renderMemo/renderSketch/renderSpreadsheet/renderImage
    ↓ (사용자 편집)
updateWidget(id, updates)
    ↓
save() → localStorage + Supabase
    ↓ (삭제)
deleteWidget(id) → DOM 제거 + state에서 제거 + save()
```

---

## 8. 전체 단축키 목록 (최종)

### 도구 선택
| 단축키 | 기능 |
|--------|------|
| `V` | 선택 도구 |
| `H` | 손 도구 |
| `M` | 메모 블록 |
| `S` | 스케치 블록 |
| `T` | 스프레드시트 블록 |
| `I` | 이미지 블록 (Phase 4) |

### 편집 (전역)
| 단축키 | 기능 |
|--------|------|
| `Ctrl+Z` | 실행 취소 |
| `Ctrl+Y` / `Ctrl+Shift+Z` | 다시 실행 |
| `Ctrl+D` | 위젯 복제 |
| `Ctrl+L` | 위젯 잠금/해제 |
| `Delete` / `Backspace` | 위젯 삭제 |
| `Shift+클릭` | 다중 선택 추가 |
| `Ctrl+A` | 전체 선택 |
| `Esc` | 선택 취소 / 도구 해제 / 모달 닫기 |

### 뷰
| 단축키 | 기능 |
|--------|------|
| `Ctrl+휠` | 줌 인/아웃 |
| `Ctrl+0` | 뷰 초기화 (원점, zoom 100%) |
| `Ctrl+Shift+F` | 전체 위젯 화면 맞춤 |
| `Alt+드래그` | 임시 캔버스 이동 |

### 검색/공유/내보내기
| 단축키 | 기능 |
|--------|------|
| `Ctrl+F` | 텍스트 검색 |
| `Ctrl+Shift+S` | 공유 링크 |
| `Ctrl+Shift+E` | 내보내기 |
| `?` | 단축키 도움말 |

### 스프레드시트 내부
| 단축키 | 기능 |
|--------|------|
| `↑↓←→` | 셀 이동 |
| `Tab` / `Shift+Tab` | 오른쪽/왼쪽 이동 |
| `Enter` / `Shift+Enter` | 아래/위 이동 |
| `더블클릭` | 수식바 편집 모드 |
| `Ctrl+C` | 선택 범위 복사 |
| `Ctrl+V` | 붙여넣기 |
| `Ctrl+A` | 전체 선택 |
| `Delete`/`Backspace` | 셀 내용 삭제 |
| `Esc` | 편집 취소 |
| `우클릭` | 컨텍스트 메뉴 |

---

## 9. 알려진 한계 및 향후 과제

### 9.1 현재 한계

| 항목 | 내용 |
|------|------|
| 이미지 저장 | base64 인코딩으로 Supabase jsonb에 저장 — 대용량 이미지 시 5MB 제한 초과 가능 |
| 위젯 잠금 | delete만 차단, 이동은 미차단 (구현 일부 미완성) |
| Undo 범위 | 스케치 획 단위 undo 불가 (획 완성 시점에 스냅샷) |
| 스프레드시트 | 셀 병합 미구현 |
| 공유 링크 | Realtime 구독 미지원 (공유 뷰에서 자동 업데이트 없음) |
| 이미지 위젯 | S3/Storage 연동 없이 base64만 지원 |

### 9.2 향후 확장 가능 기능

- 스프레드시트 셀 병합
- 이미지를 Supabase Storage에 업로드 후 URL 참조
- 공유 캔버스 Realtime 업데이트
- 위젯 연결선(화살표/선)
- 텍스트 위젯 (리치 텍스트)
- 캔버스 썸네일 자동 생성
- 모바일 터치 제스처 개선 (롱프레스 컨텍스트 메뉴)

---

## 10. 파일 목록 (최종)

| 파일명 | 줄 수 | 설명 |
|--------|-------|------|
| `inkcanvas.html` | 1,494 | Phase 1 완성본 (로컬 전용) |
| `inkcanvas-v2.html` | 1,696 | Phase 2 완성본 (클라우드 동기화) |
| `inkcanvas-v3.html` | 2,293 | Phase 3 완성본 (공유/내보내기/PWA) |
| `inkcanvas-v4.html` | 2,812 | Phase 4 최종 완성본 |
| `supabase_setup.sql` | 94 | Supabase DB 스키마 전체 |
| `README.md` | - | 배포 및 사용 가이드 |

---

*이 문서는 초안으로, 실제 내용과 다를 수 있는 부분은 직접 코드를 참조하여 검토 및 수정을 권장합니다.*
