# Design System — Notion-Inspired

> 1D1M Management 대시보드 디자인 시스템
> Notion의 warm neutral 철학을 기반으로 한 관리도구 UI

## 1. Visual Theme & Atmosphere

관리도구지만 차갑지 않다. Notion처럼 warm neutral 팔레트로 "따뜻한 종이" 느낌을 구현.
텍스트는 순수 검정이 아닌 near-black(`rgba(0,0,0,0.95)`)으로 부드러운 읽기 경험.
보더는 "whisper" — `1px solid rgba(0,0,0,0.1)`, 존재하되 무게감 없이.
그림자는 multi-layer, 개별 opacity 0.01~0.05로 자연광 같은 깊이.

**핵심 특성:**
- Inter 폰트 + 한국어 Pretendard 폴백
- Warm neutral 팔레트: gray에 yellow-brown 언더톤
- Near-black text: `rgba(0,0,0,0.95)` — 순수 검정 아님
- Whisper border: `1px solid rgba(0,0,0,0.1)`
- Multi-layer shadow: sub-0.05 opacity
- Notion Blue(`#0075de`) — 유일한 채도 높은 CTA 컬러
- 8px base spacing unit

## 2. Color Palette & Roles

### Primary
| Token | Value | Role |
|-------|-------|------|
| `--foreground` | `rgba(0,0,0,0.95)` | 본문, 제목 (near-black) |
| `--background` | `#ffffff` | 페이지 배경 |
| `--primary` | `#0075de` | CTA, 링크, 인터랙티브 액센트 (Notion Blue) |
| `--primary-foreground` | `#ffffff` | primary 위 텍스트 |

### Warm Neutral Scale
| Token | Value | Role |
|-------|-------|------|
| `--warm-white` | `#f6f5f4` | 배경 서피스, 섹션 교대, 카드 배경 |
| `--warm-dark` | `#31302e` | 다크 서피스, 강조 배경 |
| `--warm-gray-500` | `#615d59` | 보조 텍스트, 설명 |
| `--warm-gray-300` | `#a39e98` | 플레이스홀더, 비활성 상태 |

### Semantic Colors
| Token | Value | Role |
|-------|-------|------|
| `--success` | `#2a9d99` | 성공, 발송중 |
| `--warning` | `#dd5b00` | 경고, 대기 |
| `--destructive` | `#e5484d` | 에러, 삭제, 취소 |
| `--info` | `#0075de` | 정보 (Notion Blue 공유) |

### Interactive
| Token | Value | Role |
|-------|-------|------|
| `--link` | `#0075de` | 링크 텍스트 |
| `--focus` | `#097fe8` | 포커스 링 |
| `--badge-bg` | `#f2f9ff` | 뱃지 배경 (tinted blue) |
| `--badge-text` | `#097fe8` | 뱃지 텍스트 |
| `--active-blue` | `#005bab` | 버튼 active/pressed |

### Borders & Shadows
| Token | Value | Role |
|-------|-------|------|
| `--border` | `rgba(0,0,0,0.1)` | 표준 whisper border |
| `--border-input` | `#dddddd` | 입력 필드 보더 |
| `--shadow-card` | 4-layer stack | 카드 elevation |
| `--shadow-deep` | 5-layer stack | 모달, 주요 패널 |

## 3. Typography Rules

### Font Family
- **Primary**: `Inter, "Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif`
- **Mono**: `"SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace`

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | 용도 |
|------|------|--------|-------------|----------------|------|
| Page Title | 28px (1.75rem) | 700 | 1.15 | -0.5px | 페이지 제목 |
| Section Heading | 22px (1.375rem) | 700 | 1.25 | -0.25px | 섹션 제목, 카드 타이틀 |
| Sub-heading | 18px (1.125rem) | 600 | 1.35 | -0.125px | 서브 섹션 |
| Body Large | 16px (1rem) | 500 | 1.5 | normal | 강조 본문, 네비게이션 |
| Body | 14px (0.875rem) | 400 | 1.5 | normal | 표준 본문, 테이블 셀 |
| Caption | 13px (0.8125rem) | 500 | 1.4 | normal | 메타데이터, 보조 라벨 |
| Badge | 12px (0.75rem) | 600 | 1.33 | 0.125px | 뱃지, 태그, 상태 |
| Micro | 11px (0.6875rem) | 400 | 1.33 | 0.125px | 타임스탬프, 작은 메타 |

### 원칙
- **Weight 4단계**: 400(읽기), 500(UI/인터랙티브), 600(강조/네비), 700(제목)
- **Letter-spacing**: 큰 글씨일수록 타이트하게 (-0.5px at 28px → normal at 14px)
- **Line-height**: 큰 글씨일수록 타이트 (1.15 at 28px → 1.5 at 14px)

## 4. Component Stylings

### Buttons

**Primary (Notion Blue)**
- Background: `#0075de`
- Text: `#ffffff`
- Padding: `8px 16px`
- Radius: `4px`
- Hover: `#005bab`
- Active: `scale(0.98)`
- Focus: `2px solid #097fe8` outline

**Secondary (Warm Gray)**
- Background: `rgba(0,0,0,0.05)`
- Text: `rgba(0,0,0,0.95)`
- Hover: `rgba(0,0,0,0.08)`

**Ghost**
- Background: `transparent`
- Text: `rgba(0,0,0,0.95)`
- Hover: `rgba(0,0,0,0.04)`

**Destructive**
- Background: `#e5484d`
- Text: `#ffffff`
- Hover: `#dc3d43`

**Outline**
- Background: `transparent`
- Border: `1px solid rgba(0,0,0,0.15)`
- Text: `rgba(0,0,0,0.95)`
- Hover: `rgba(0,0,0,0.04)` background

### Cards
- Background: `#ffffff`
- Border: `1px solid rgba(0,0,0,0.1)` (whisper)
- Radius: `12px`
- Shadow: `rgba(0,0,0,0.04) 0 4px 18px, rgba(0,0,0,0.027) 0 2px 7.85px, rgba(0,0,0,0.02) 0 0.8px 2.93px, rgba(0,0,0,0.01) 0 0.175px 1.04px`
- Padding: `24px`

### Inputs
- Background: `#ffffff`
- Border: `1px solid #dddddd`
- Radius: `4px`
- Padding: `6px 12px`
- Focus: `2px solid #097fe8` outline
- Placeholder: `#a39e98`

### Badges (Pill)
- Background: `#f2f9ff` (tinted blue)
- Text: `#097fe8`
- Radius: `9999px` (full pill)
- Padding: `4px 8px`
- Font: 12px weight 600

### Status Badge Colors
| Status | Background | Text |
|--------|-----------|------|
| success | `#e6f7f5` | `#1a7a72` |
| warning | `#fef3e5` | `#b44d00` |
| error | `#fde8e8` | `#c33` |
| info | `#f2f9ff` | `#097fe8` |
| neutral | `#f4f3f2` | `#615d59` |

## 5. Layout Principles

### Spacing (8px base)
| Token | Value | 용도 |
|-------|-------|------|
| `space-1` | 4px | 인라인 간격, 아이콘 갭 |
| `space-2` | 8px | 컴팩트 패딩 |
| `space-3` | 12px | 인풋 패딩 |
| `space-4` | 16px | 카드 내부 패딩, 섹션 간격 |
| `space-6` | 24px | 카드 패딩, 섹션 간 |
| `space-8` | 32px | 주요 섹션 간격 |
| `space-12` | 48px | 페이지 섹션 간격 |

### Container
- Max width: `1400px`
- Horizontal padding: `16px` (mobile) / `24px` (desktop)
- Content area: `py-6`

### Border Radius Scale
| Token | Value | 용도 |
|-------|-------|------|
| `radius-sm` | `4px` | 버튼, 인풋, 기능 요소 |
| `radius-md` | `8px` | 작은 카드, 컨테이너 |
| `radius-lg` | `12px` | 표준 카드, 패널 |
| `radius-full` | `9999px` | 뱃지, 필, 아바타 |

## 6. Depth & Elevation

| Level | Treatment | 용도 |
|-------|-----------|------|
| Flat | 없음 | 페이지 배경, 텍스트 블록 |
| Whisper | `1px solid rgba(0,0,0,0.1)` | 카드 테두리, 구분선 |
| Card | 4-layer shadow (max 0.04) | 콘텐츠 카드, 테이블 |
| Deep | 5-layer shadow (max 0.05, 52px blur) | 모달, 드롭다운 |
| Focus | `2px solid #097fe8` outline | 키보드 포커스 |

### Shadow Stacks
```css
/* Card */
rgba(0,0,0,0.04) 0 4px 18px,
rgba(0,0,0,0.027) 0 2px 7.85px,
rgba(0,0,0,0.02) 0 0.8px 2.93px,
rgba(0,0,0,0.01) 0 0.175px 1.04px

/* Deep (modal/dropdown) */
rgba(0,0,0,0.01) 0 1px 3px,
rgba(0,0,0,0.02) 0 3px 7px,
rgba(0,0,0,0.02) 0 7px 15px,
rgba(0,0,0,0.04) 0 14px 28px,
rgba(0,0,0,0.05) 0 23px 52px
```

## 7. Accessibility & States

### Interactive States
| State | Treatment |
|-------|-----------|
| Default | 표준 표시 |
| Hover | 배경 미세 변화, 텍스트/보더 색상 시프트 |
| Active | `scale(0.98)`, 약간 어두운 배경 |
| Focus | `2px solid #097fe8` outline + shadow |
| Disabled | `#a39e98` 텍스트, `opacity: 0.5` |

### Color Contrast
- Primary text on white: ~18:1 (WCAG AAA)
- Secondary text (#615d59) on white: ~5.5:1 (WCAG AA)
- Blue CTA (#0075de) on white: ~4.6:1 (WCAG AA large)

## 8. Agent Quick Reference

### 색상 빠른 참조
```
Primary CTA:     #0075de (Notion Blue)
Background:      #ffffff
Surface:         #f6f5f4 (warm white)
Heading text:    rgba(0,0,0,0.95) (near-black)
Body text:       rgba(0,0,0,0.95)
Secondary text:  #615d59 (warm gray)
Muted text:      #a39e98
Border:          1px solid rgba(0,0,0,0.1)
Focus ring:      #097fe8
```

### 반복 가이드
1. warm neutral 사용 — gray에 yellow-brown 언더톤 (`#f6f5f4`, `#615d59`, `#a39e98`)
2. 보더는 whisper: `1px solid rgba(0,0,0,0.1)` — 절대 더 굵지 않게
3. 그림자는 4-5 layer, 개별 opacity 0.05 이하
4. Weight 4단계: 400(읽기), 500(UI), 600(강조), 700(제목)
5. Notion Blue(`#0075de`)는 CTA와 링크에만 — 절제하여 사용
6. warm white(`#f6f5f4`)로 섹션 배경 교대하여 시각적 리듬
7. 뱃지는 pill(9999px), 버튼/인풋은 4px radius
8. 카드는 12px radius + whisper border + 4-layer shadow

---

## 9. Data Components (백오피스 전용)

> Notion 앱의 데이터베이스 뷰를 참고하여 백오피스 테이블/카드/필터 등 데이터 UI 패턴 정의

### 9.1 Table (데이터 테이블)

**기본 스타일:**
- 배경: `#ffffff` (카드 내부)
- 전체 테이블 래핑: `12px radius` 카드 + whisper border + card shadow
- 행 높이: 최소 `44px` (터치 타겟 호환)
- 행 구분: `1px solid rgba(0,0,0,0.06)` — 테이블 내부는 더 연한 구분선
- 행 hover: `rgba(0,0,0,0.02)` 배경 — 거의 인지 못할 정도로 미세
- 선택된 행: `#f2f9ff` 배경 (tinted blue)

**헤더:**
- 배경: `#f6f5f4` (warm white)
- 텍스트: `13px` weight `500`, color `#615d59`
- 아이콘: `14px`, 헤더 텍스트 앞에 property-type 아이콘 (선택사항)
- 정렬 인디케이터: `▲▼` 또는 lucide `ArrowUpDown`, color `#a39e98`
- 상단 border-radius: `12px 12px 0 0` (카드 상단과 일치)
- 패딩: `12px 16px`

**셀:**
- 텍스트: `14px` weight `400`, color `rgba(0,0,0,0.95)`
- 패딩: `10px 16px`
- 숫자 셀: `tabular-nums`, 오른쪽 정렬
- 날짜 셀: `#615d59` 색상, `13px`
- 링크 셀: `#0075de` 색상, hover 시 underline
- 빈 셀: `—` 또는 비워둠, `#a39e98` 색상

**셀 내 상태 뱃지 (Notion Select 스타일):**
```
배경색 있는 rounded pill — 노션의 Select property 스타일
- 패딩: 2px 8px
- Radius: 4px (pill이 아닌 subtle rounded)
- Font: 12px weight 500
- 각 상태별 고유 배경+텍스트 색상 (아래 팔레트 참조)
```

**Select 뱃지 컬러 팔레트 (Notion 스타일):**
| 이름 | Background | Text | 용도 예시 |
|------|-----------|------|----------|
| Light Gray | `#f1f1ef` | `#787774` | 기본/중립 |
| Brown | `#f4eeee` | `#976d57` | 참고/보류 |
| Orange | `#faebdd` | `#d9730d` | 경고/주의 |
| Yellow | `#fbf3db` | `#cb912f` | 대기/계획됨 |
| Green | `#dbeddb` | `#448361` | 활성/완료/발송중 |
| Blue | `#d3e5ef` | `#2e7eb8` | 정보/진행중 |
| Purple | `#e8deee` | `#8854b8` | 특별/프리미엄 |
| Pink | `#f5e0e9` | `#b84f7a` | 긴급/중요 |
| Red | `#ffe2dd` | `#e03e3e` | 에러/취소/지연 |

**인라인 편집:**
- 더블클릭 또는 셀 클릭 시 편집 모드 진입
- 편집 중: `2px solid #0075de` 포커스 링
- Select 편집: 드롭다운으로 옵션 표시
- 저장: 포커스 아웃 시 자동 저장, 변경 셀 잠깐 `#f2f9ff` 배경 flash

**페이지네이션:**
- 테이블 하단, 카드 바깥
- `이전` / `다음` ghost 버튼 + 현재 페이지 표시
- 총 개수: `#615d59` 텍스트, `13px`

### 9.2 Grouped Table (그룹핑 테이블)

**그룹 헤더:**
- 배경: `transparent`
- 왼쪽에 토글 삼각형 (`▶` / `▼`)
- 그룹 이름: `14px` weight `600`, color `rgba(0,0,0,0.95)`
- 그룹 카운트: `(N)`, `13px` weight `400`, color `#a39e98`
- 하단 구분: `1px solid rgba(0,0,0,0.1)`
- 클릭 시 접기/펼치기 (Collapsible)

**그룹 요약:**
- 그룹 하단 또는 헤더 오른쪽에 합계/평균 등 표시
- `13px` weight `500`, color `#615d59`

### 9.3 Card Grid (갤러리/카드 뷰)

**카드 레이아웃:**
- 그리드: `repeat(auto-fill, minmax(280px, 1fr))`
- 간격: `16px`
- 카드: whisper border + card shadow + `12px` radius
- 패딩: `16px`
- hover: shadow 약간 강화 (`card-hover`)

**카드 내부 구조:**
```
┌─────────────────────────┐
│ 🏢 Title (16px, 600)    │ ← 아이콘 + 제목
│ ┌──────┐                │
│ │Status│ (select badge) │ ← 상태 뱃지
│ └──────┘                │
│ US$4,200,000.00         │ ← 주요 금액 (14px, 500)
│ US$620,000.00           │ ← 보조 금액 (13px, 400, #615d59)
│ 9                       │ ← 카운트 (13px, #a39e98)
│ ┌────┐                  │
│ │High│ (priority badge) │ ← 우선순위 뱃지
│ └────┘                  │
└─────────────────────────┘
```

### 9.4 Kanban Board (칸반/보드 뷰)

**컬럼 헤더:**
- 상태 뱃지(Select 스타일) + 카운트
- 패딩: `8px 0`
- 하단: `2px solid` (상태 색상)

**칸반 카드:**
- 배경: `#ffffff`
- Border: `1px solid rgba(0,0,0,0.08)`
- Radius: `8px`
- 패딩: `12px`
- Shadow: `subtle`
- Drag handle: 왼쪽 점 6개 (hover 시 표시)
- 간격: `8px` (카드 간)

### 9.5 Metric Card (통계 카드)

**레이아웃:**
```
┌─────────────────────────┐
│ Total Deals Value       │ ← 라벨 (14px, 500, #615d59)
│                         │
│ US$201...               │ ← 값 (32px, 700, near-black)
│                         │
│ ┌──────────────────┐    │
│ │ Total Pipeline   │    │ ← 세그먼트 pill (선택사항)
│ └──────────────────┘    │
└─────────────────────────┘
```

- 배경: `#ffffff` 또는 `#f6f5f4`
- Border: whisper
- Radius: `12px`
- 값 텍스트: `28-40px` weight `700`, `letter-spacing: -0.5px`
- 라벨: `14px` weight `500`, color `#615d59`
- 변화율: 상승 `#2a9d99`, 하강 `#e5484d`, `13px` weight `500`

### 9.6 Filter Bar (필터 바)

**구조:**
```
┌──────────────────────────────────────────────────┐
│ 🔍 검색...  │ [필터▾] [정렬▾] [속성▾]    [+ 새로 만들기] │
└──────────────────────────────────────────────────┘
```

- 배경: `transparent` (테이블 위에 직접)
- 검색 입력: ghost 스타일, 왼쪽 돋보기 아이콘, placeholder `#a39e98`
- 필터 버튼: ghost + 아이콘 (≡ filter, ↕ sort, ⊞ properties)
- 액션 버튼(새로 만들기): `primary` 스타일, 오른쪽 정렬
- 간격: `8px` between items
- 높이: `36px`

**활성 필터 칩:**
- 필터 적용 시 아래에 pill chip으로 표시
- 배경: `#f2f9ff`, 텍스트: `#097fe8`, 닫기(×) 버튼
- Radius: `9999px`

### 9.7 View Tabs (뷰 전환 탭)

**스타일 (Notion 데이터베이스 뷰 탭):**
- 위치: 테이블/카드 영역 바로 위
- 각 탭: 아이콘 + 라벨
- 아이콘: `14px`, 뷰 타입별 (≡ 테이블, 📅 캘린더, ▦ 보드, ⊞ 갤러리)
- 텍스트: `14px` weight `500`
- 활성 탭: `rgba(0,0,0,0.95)` + 하단 `2px solid`
- 비활성: `#a39e98`, hover 시 `#615d59`
- 간격: `4px` between tabs
- 높이: `32px`
- 테두리: 하단 `1px solid rgba(0,0,0,0.06)`

### 9.8 Modal / Sheet (모달/사이드 시트)

**모달:**
- Overlay: `rgba(0,0,0,0.4)`
- 배경: `#ffffff`
- Radius: `12px`
- Shadow: deep shadow (5-layer)
- 패딩: `24px`
- 헤더: `22px` weight `700`, 닫기 버튼 오른쪽
- 푸터: 우측 정렬 버튼 그룹, `16px` 상단 보더

**사이드 시트 (Sheet):**
- 너비: `400px` (sm), `560px` (md), `720px` (lg)
- 오른쪽에서 슬라이드 인
- 상단 핸들: `40px × 4px`, `rgba(0,0,0,0.2)`, `9999px` radius (선택)
- 내부 레이아웃: 스크롤 가능한 본문 + 고정 헤더/푸터

### 9.9 Progress & Timeline

**프로그레스 바 (Notion 스타일):**
- 높이: `6px`
- 배경: `rgba(0,0,0,0.06)` (트랙)
- 채움: `#2a9d99` (성공), `#0075de` (진행중), `#dd5b00` (경고)
- Radius: `9999px`
- 퍼센트 텍스트: 바 오른쪽, `13px` weight `500`

**타임라인 (그룹핑 테이블 참고):**
- 왼쪽 수직 라인: `2px solid rgba(0,0,0,0.08)`
- 노드: `8px` 원, 상태별 색상
- 날짜: `13px` weight `400`, `#a39e98`
- 내용: `14px` weight `400`
- 간격: `16px` between events

### 9.10 Empty State

**빈 상태:**
- 중앙 정렬
- 아이콘: `48px`, `#a39e98` 색상
- 제목: `16px` weight `600`, `rgba(0,0,0,0.95)`
- 설명: `14px` weight `400`, `#615d59`
- CTA 버튼: `primary` 스타일 (선택사항)
- 전체 높이: 최소 `200px`
