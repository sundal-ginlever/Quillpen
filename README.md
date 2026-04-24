# inkcanvas — 배포 및 사용 가이드

## 파일 구성

| 파일 | 설명 |
|------|------|
| `inkcanvas.html` | Phase 1 — 무한 캔버스 (로컬 전용) |
| `inkcanvas-v2.html` | Phase 2 — 클라우드 동기화 + 인증 |
| `inkcanvas-v3.html` | Phase 3 — 공유 링크 + 내보내기 + PWA |
| `inkcanvas-v4.html` | Phase 4 — Undo/Redo + 이미지 + 검색 등 **최종 완성본** |
| `supabase_setup.sql` | Supabase DB 스키마 (Phase 2~4 사용 시 실행) |

---

## 빠른 시작 (로컬 모드)

Supabase 설정 없이도 바로 사용 가능합니다.

1. `inkcanvas-v4.html` 을 브라우저에서 열기
2. 자동으로 **로컬 모드**로 진입 (localStorage 저장)
3. 클라우드 동기화는 동작하지 않지만 모든 기능 사용 가능

---

## 클라우드 동기화 설정 (Supabase)

### 1단계 — Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) 접속 → 무료 계정 생성
2. **New Project** → 프로젝트 이름 입력 → 리전 선택 (Northeast Asia 권장)
3. 프로젝트 생성 완료까지 약 1분 대기

### 2단계 — DB 스키마 적용

1. 대시보드 좌측 → **SQL Editor**
2. `supabase_setup.sql` 전체 내용 붙여넣기 → **Run**
3. 성공 메시지 확인

### 3단계 — Realtime 활성화 (Publication)

1. 대시보드 → **Database** → **Publications**
2. `supabase_realtime` 설정에서 `widgets` 테이블의 `INSERT`, `UPDATE`, `DELETE` 토글 모두 ON

### 4단계 — API 키 복사

1. 대시보드 → **Settings** → **API**
2. **Project URL** 복사
3. **anon public** 키 복사

### 5단계 — inkcanvas-v4.html 수정

파일 상단 2줄 교체:

```javascript
const SUPABASE_URL  = 'https://abcdefgh.supabase.co';  // ← 본인 URL
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR...';   // ← 본인 anon key
```

### 6단계 — Google OAuth 설정 (선택)

1. 대시보드 → **Authentication** → **Providers** → **Google** 활성화
2. Google Cloud Console에서 OAuth 클라이언트 생성
3. 콜백 URL에 `https://[프로젝트ID].supabase.co/auth/v1/callback` 추가

---

## 배포 방법

### Netlify Drop (가장 빠름, 무료)

1. [drop.netlify.com](https://drop.netlify.com) 접속
2. `inkcanvas-v4.html` 파일을 드래그 앤 드롭
3. 즉시 HTTPS URL 발급 — 완료

### GitHub Pages (무료)

```bash
# 저장소 생성 후
cp inkcanvas-v4.html index.html
git add index.html
git commit -m "deploy inkcanvas"
git push origin main
# Settings → Pages → Branch: main 활성화
```

### Vercel (무료)

```bash
npx vercel --name inkcanvas
# 파일 하나짜리 배포라 설정 불필요
```

---

## 전체 단축키

### 도구 선택
| 단축키 | 기능 |
|--------|------|
| `V` | 선택 도구 |
| `H` | 손 도구 (캔버스 이동) |
| `M` | 메모 블록 |
| `S` | 스케치 블록 |
| `T` | 스프레드시트 블록 |
| `I` | 이미지 블록 |

### 편집
| 단축키 | 기능 |
|--------|------|
| `Ctrl+Z` | 실행 취소 (최대 60단계) |
| `Ctrl+Y` / `Ctrl+Shift+Z` | 다시 실행 |
| `Ctrl+D` | 위젯 복제 |
| `Ctrl+L` | 위젯 잠금 / 해제 |
| `Delete` / `Backspace` | 선택 위젯 삭제 |
| `Shift+클릭` | 다중 선택 |
| `Ctrl+A` | 전체 선택 |

### 뷰
| 단축키 | 기능 |
|--------|------|
| `Ctrl+휠` | 줌 인/아웃 |
| `Ctrl+0` | 뷰 초기화 (원점 100%) |
| `Ctrl+Shift+F` | 전체 위젯 화면 맞춤 |

### 검색/공유/내보내기
| 단축키 | 기능 |
|--------|------|
| `Ctrl+F` | 텍스트 검색 |
| `Ctrl+Shift+S` | 공유 링크 |
| `Ctrl+Shift+E` | 내보내기 (PNG/JSON/CSV) |
| `?` | 단축키 도움말 |

---

## 스프레드시트 수식

```
=SUM(A1:C5)       범위 합계
=AVG(A1:A10)      평균
=MIN(B1:B10)      최솟값
=MAX(B1:B10)      최댓값
=COUNT(A1:C5)     숫자 개수
=COUNTA(A1:A10)   비어있지 않은 셀 수
=PRODUCT(A1:A5)   범위 곱
=IF(A1>10,"크다","작다")   조건
=CONCAT(A1,B1)    텍스트 결합
=ABS(A1)          절댓값
=SQRT(A1)         제곱근
=ROUND(A1)        반올림
=INT(A1)          버림
=LEN(A1)          문자열 길이
=A1+B2*3          셀 참조 사칙연산
```

---

## Phase 로드맵 (완성)

```
Phase 1  ✅  무한 캔버스 + 블록 위젯 (메모·스케치·스프레드시트)
Phase 2  ✅  클라우드 동기화 + 인증 + 멀티 캔버스 + Realtime
Phase 3  ✅  공유 링크 + PNG/JSON/CSV 내보내기 + PWA + 이름 편집
Phase 4  ✅  Undo/Redo + 이미지 위젯 + 복제 + 잠금 + 검색 + 화면 맞춤
```

---

## 기술 스택

- **프론트엔드** — Vanilla JS + Canvas 2D API (프레임워크 없음)
- **상태 관리** — 전역 `state` 객체 + 함수형 패치 패턴
- **클라우드** — Supabase (PostgreSQL + Auth + Realtime WebSocket)
- **오프라인** — localStorage 자동 폴백
- **배포** — 단일 HTML 파일 (CDN 의존성 없음, Supabase SDK만 런타임 로드)
- **번들 크기** — ~2,800 lines, 의존성 0개 (Supabase SDK 제외)
