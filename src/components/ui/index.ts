/**
 * ═══════════════════════════════════════════════════════════════════
 *  HAVEHAD Design System — Component Catalog
 * ═══════════════════════════════════════════════════════════════════
 *
 *  이 파일은 모든 공통 UI 컴포넌트의 중앙 인덱스입니다.
 *  새 탭이나 기능을 만들 때 반드시 이 파일을 먼저 확인하세요.
 *
 *  import { DataTable, Button, Dialog, StatusBadge } from '@/components/ui'
 *
 *  ⚠️ 규칙:
 *  - 새 컴포넌트 추가 시 반드시 여기에도 export 추가
 *  - 카테고리별 섹션에 배치
 *  - 비슷한 기능의 컴포넌트가 이미 있는지 확인 후 추가
 * ═══════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────
//  0. SHARED TYPES — 여러 컴포넌트에서 공유하는 타입
// ─────────────────────────────────────────────────
export type {
  StatusType as DSStatusType,
  Size as DSSize,
  ModalSize,
  Variant as DSVariant,
  SortDirection,
  CellAlign,
  StatusMapping,
  StatusMap,
} from './types'

// ─────────────────────────────────────────────────
//  1. ACTIONS — 버튼, 클릭 가능한 요소
// ─────────────────────────────────────────────────
/** 기본 버튼 — variant: default|destructive|outline|secondary|ghost|link */
export { Button, type ButtonProps, buttonVariants } from './button'
/** 로딩 상태 포함 버튼 — isLoading prop으로 스피너 자동 표시 */
export { LoadingButton } from './loading-button'
/** 텍스트 복사 버튼 — 클립보드 복사 + 완료 피드백 */
export { CopyButton } from './copy-button'

// ─────────────────────────────────────────────────
//  2. DATA DISPLAY — 테이블, 데이터 표시
// ─────────────────────────────────────────────────
/**
 * 읽기 전용 데이터 테이블 — 검색, 정렬, 페이지네이션, 행 선택, 행 액션
 *
 * 언제 쓰나: 데이터 목록 표시 (주문 내역, 상품 목록, 로그 등)
 * @example
 * <DataTable
 *   columns={[{ key: 'name', label: '이름', sortable: true }]}
 *   data={items}
 *   searchKeys={['name']}
 *   onRowClick={(row) => openDetail(row)}
 * />
 */
export { DataTable, type DataTableColumn } from './data-table'

/**
 * 그룹핑 데이터 테이블 — 1~2단계 그룹, 인라인 편집, 그룹 요약
 *
 * 언제 쓰나: 계층 데이터 (브랜드별 SKU, 카테고리별 상품 등)
 * @example
 * <GroupedDataTable
 *   columns={cols}
 *   data={skus}
 *   groupBy="brand"
 *   showSummary
 * />
 */
export { GroupedDataTable, type GroupedColumn } from './grouped-data-table'

/**
 * 편집 가능 데이터 테이블 — 그룹 탭, 인라인 편집, 행 삭제
 *
 * 언제 쓰나: 데이터 편집이 필요한 테이블 (가격 관리, 설정 등)
 * @example
 * <EditableDataTable
 *   columns={cols}
 *   data={prices}
 *   groupBy="country"
 *   groupTabs
 *   onRowEdit={(row, key, value) => save(row, key, value)}
 * />
 */
export { EditableDataTable, type EditableColumn } from './editable-data-table'

/** shadcn/ui 기본 테이블 — DataTable이 안 맞을 때 직접 조합 */
export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from './table'

/** 간소화 테이블 — 모달/카드 내부 소형 테이블 */
export { MiniTable } from './mini-table'

/** 비교 테이블 — 항목 간 대조 비교 */
export { ComparisonTable } from './comparison-table'

/**
 * 칼럼 타입 레지스트리 — 테이블 셀 자동 렌더링
 *
 * cellType으로 지정: 'code' | 'currency' | 'currency-kr' | 'number' | 'percent'
 *   | 'date' | 'status' | 'custom-status' | 'boolean-flags' | 'brand-dot'
 *   | 'image' | 'link' | 'tags' | 'currency-auto' | 'inherited' | 'toggle'
 *
 * @example
 * { key: 'price', label: '가격', cellType: 'currency' }
 * { key: 'status', label: '상태', cellType: 'status',
 *   cellConfig: { statusMap: { active: { status: 'success', label: '활성' } } } }
 */
export {
  renderCellByType,
  type CellDisplayType,
  type CellTypeConfig,
  // 개별 셀 컴포넌트 (render 함수에서 직접 사용 시)
  CellCode, CellCurrency, CellCurrencyKr, CellCurrencyAuto,
  CellNumber, CellPercent, CellDate, CellStatus, CellCustomStatus,
  CellBooleanFlags, CellBrandDot, CellImage, CellLink, CellTags,
  CellInherited, CellToggle,
  // 인터랙티브 셀 (onChange 콜백 필요, render 함수로 사용)
  CellEditableTags, CellSortedTags, CellSearchSelect, CellMultiSelect,
} from './column-types'

// ─────────────────────────────────────────────────
//  3. OVERLAYS — 모달, 다이얼로그, 시트, 팝오버
// ─────────────────────────────────────────────────
/**
 * ┌─ 오버레이 의사결정 트리 ─────────────────────────┐
 * │                                                  │
 * │  "내용이 뭐야?"                                   │
 * │    ├─ 확인/취소 질문 → ConfirmDialog              │
 * │    ├─ 폼 입력 (생성/수정) → FormDialog            │
 * │    ├─ 상세 보기 (탭 포함) → DetailModal            │
 * │    ├─ 좌우 분할 상세 → SplitDetailModal            │
 * │    ├─ 사이드 패널 → Sheet                         │
 * │    ├─ 마법사 (단계별) → WizardDialog               │
 * │    └─ 기타 커스텀 → Dialog (베이스)               │
 * │                                                  │
 * └──────────────────────────────────────────────────┘
 */

/** 기본 다이얼로그 — 커스텀 모달이 필요할 때 (가장 저수준) */
export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogTrigger, DialogClose } from './dialog'
/** 확인/취소 다이얼로그 — window.confirm() 대체. useConfirmDialog() 훅 제공 */
export { ConfirmDialog, useConfirmDialog } from './confirm-dialog'
/** 폼 다이얼로그 — 생성/수정 폼. size: sm|md|lg, 유효성 검증, 로딩 상태 */
export { FormDialog } from './form-dialog'
/** 상세 모달 — 탭 시스템, 브레드크럼, size: sm|md|lg|xl|full */
export { DetailModal } from './detail-modal'
/** 분할 상세 모달 — 좌우 2패널, split: '4:6'|'5:5'|'6:4' */
export { SplitDetailModal } from './split-detail-modal'
/** 단계별 마법사 — 다단계 폼/프로세스 */
export { WizardDialog } from './wizard-dialog'
/** 경고 다이얼로그 — 위험한 작업 확인 (삭제 등) */
export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './alert-dialog'

/** 시트 (슬라이드 패널) — side: top|bottom|left|right, size: sm|md|lg|xl|full */
export { Sheet, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription, SheetTrigger, SheetClose } from './sheet'

/** 팝오버 — 클릭 시 나타나는 플로팅 콘텐츠 */
export { Popover, PopoverContent, PopoverTrigger } from './popover'
/** 드롭다운 메뉴 — 액션 목록 (우클릭 메뉴, 더보기 메뉴) */
export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuGroup } from './dropdown-menu'
/** 툴팁 — 호버 시 도움말 */
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

// ─────────────────────────────────────────────────
//  4. FORMS — 입력 필드, 선택, 체크박스
// ─────────────────────────────────────────────────
/** 텍스트 입력 */
export { Input } from './input'
/** 텍스트 영역 */
export { Textarea } from './textarea'
/** 숫자 입력 — 증감 버튼, 만원 단위 변환 등 */
export { NumberInput } from './number-input'
/** 기본 셀렉트 (단일 선택) */
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from './select'
/**
 * 스마트 셀렉트 — 검색, 멀티선택, 관리 모드(추가/편집/삭제/정렬)
 *
 * 언제 쓰나: 옵션이 많거나 동적 관리가 필요할 때
 * @example
 * <SmartSelect options={options} value={val} onChange={setVal} searchable multiple />
 */
export { SmartSelect, type SelectOption } from './smart-select'
/** 체크박스 */
export { Checkbox } from './checkbox'
/** 스위치 토글 */
export { Switch } from './switch'
/** 라벨 */
export { Label } from './label'
/** 태그 입력 — 다중 태그 입력 + 자동완성 */
export { TagInput } from './tag-input'
/** 날짜 선택기 */
export { DatePicker } from './date-picker'
/** 날짜 범위 선택기 */
export { DateRangePicker } from './date-range-picker'
/** 캘린더 (DatePicker 내부 + 독립 사용 가능) */
export { Calendar } from './calendar'

// ─────────────────────────────────────────────────
//  5. LAYOUT — 카드, 구분선, 스크롤, 영역 분할
// ─────────────────────────────────────────────────
/** 카드 */
export { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './card'
/** 탭 */
export { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'
/** 접기/펼치기 (Collapsible + CollapsibleCard) */
export { Collapsible, CollapsibleContent, CollapsibleTrigger, CollapsibleCard } from './collapsible'
/** 구분선 */
export { Separator } from './separator'
/** 섹션 구분선 — 제목 포함 */
export { SectionDivider } from './section-divider'
/** 스크롤 영역 */
export { ScrollArea, ScrollBar } from './scroll-area'
/** 아바타 — name, src, size: xs|sm|md|lg */
export { Avatar, AvatarGroup } from './avatar'

// ─────────────────────────────────────────────────
//  6. FEEDBACK — 로딩, 빈 상태, 알림, 진행률
// ─────────────────────────────────────────────────
/**
 * 로딩 컴포넌트 3종:
 * - Loading: 전체 페이지 로딩 (bbuggu 캐릭터 + 메시지)
 * - Skeleton: 인라인 로딩 플레이스홀더
 * - SkeletonTable: 테이블 형태 로딩
 */
export { Loading, Skeleton, SkeletonTable } from './skeleton'
/** 스피너 — 인라인 로딩 아이콘 */
export { Spinner } from './spinner'
/** 빈 상태 — 데이터 없을 때 아이콘 + 메시지 + 액션 버튼 */
export { EmptyState } from './empty-state'
/** 프로그레스 바 */
export { Progress } from './progress'
/** 인라인 배너 — 페이지 내 info/warning/error 알림 */
export { InlineBanner } from './inline-banner'
/** 토스트 알림 */
export { Toast } from './Toast'

// ─────────────────────────────────────────────────
//  7. BADGES & STATUS — 뱃지, 상태 표시
// ─────────────────────────────────────────────────
/**
 * Badge vs StatusBadge 차이:
 * - Badge: 범용 태그/라벨 (variant: default|secondary|destructive|outline)
 * - StatusBadge: 시맨틱 상태 (status: success|warning|error|info|neutral)
 *               → variant: filled|outline|subtle|dot / size: xs|sm|md
 */
export { Badge, badgeVariants } from './badge'
export { StatusBadge, type StatusType } from './status-badge'
/** 단계 인디케이터 — 프로세스 진행 상태 */
export { StepIndicator } from './step-indicator'

// ─────────────────────────────────────────────────
//  8. NAVIGATION & FILTERS — 필터, 기간 선택, 탭
// ─────────────────────────────────────────────────
/**
 * 필터 바 — 검색 + 퀵필터 + 커스텀 필터 + 액션 버튼
 *
 * @example
 * <FilterBar
 *   search={{ value: q, onChange: setQ, placeholder: '검색...' }}
 *   quickFilters={[{ label: '전체', value: 'all', count: 100 }]}
 *   filters={<Select>...</Select>}
 *   actions={<Button>추가</Button>}
 * />
 */
export { FilterBar } from './filter-bar'
/** 기간 탭 — 오늘|7일|30일|커스텀 */
export { PeriodTabs } from './period-tabs'
/** 성별 토글 — 남/여 필터 */
export { GenderToggle, GenderDots } from './gender-toggle'
/** 시즌 토글 — SS/FW 필터 */
export { SeasonToggle, SeasonDots } from './season-toggle'
/** 브레드크럼 — items 배열로 경로 표시 */
export { Breadcrumb } from './breadcrumb'
/** 커맨드 다이얼로그 — Cmd+K 스타일 검색/명령 */
export { CommandDialog } from './command-dialog'

// ─────────────────────────────────────────────────
//  9. PAGE STRUCTURE — 페이지/섹션 헤더, 상세 영역
// ─────────────────────────────────────────────────
/** 페이지 헤더 (제목 + 설명 + 액션) / 섹션 헤더 (소제목) */
export { PageHeader, SectionHeader } from './page-header'
/**
 * 상세 섹션 — 모달/페이지에서 라벨-값 쌍 표시
 * - DetailSection: 그리드 컨테이너 (1~4열)
 * - FormRow: 라벨 + 입력 필드 래퍼
 * - InfoRow: 읽기/편집 전환 가능한 행
 */
export { DetailSection, FormRow } from './detail-section'

// ─────────────────────────────────────────────────
// 10. DASHBOARD — 지표 카드, 차트, 통계
// ─────────────────────────────────────────────────
/** 메트릭 카드 — KPI 숫자 + 전기간 대비 변화율 */
export { MetricCard } from './metric-card'
/** 통계 그룹 — MetricCard 여러 개를 한 줄에 배치 */
export { StatGroup } from './stat-group'
/** 차트 카드 — 제목 + Recharts 차트 래퍼 */
export { ChartCard } from './chart-card'
/** 프로그레스 카드 — 목표 대비 진행률 */
export { ProgressCard } from './progress-card'
/** 탭 카드 — 탭으로 전환되는 카드 */
export { TabbedCard } from './tabbed-card'
/** 키-값 표시 — 간단한 라벨:값 쌍 */
export { KeyValue } from './key-value'
/** 리스트 카드 — 항목 목록 카드 */
export { ListCard } from './list-card'
/** 미디어 카드 — 이미지 + 텍스트 카드 */
export { MediaCard } from './media-card'

// ─────────────────────────────────────────────────
// 11. CHARTS — Recharts 래핑 차트 컴포넌트
// ─────────────────────────────────────────────────
/** 추세 라인 차트 */
export { TrendLineChart } from './trend-line-chart'
/** 누적 영역 차트 */
export { StackedAreaChart } from './stacked-area-chart'
/** 누적 바 차트 */
export { StackedBarChart } from './stacked-bar-chart'
/** 이중 축 차트 */
export { DualAxisChart } from './dual-axis-chart'
/** 비교 바 차트 */
export { ComparisonBarChart } from './comparison-bar-chart'
/** 도넛 차트 */
export { DonutChart } from './donut-chart'
/** 게이지 차트 */
export { GaugeChart } from './gauge-chart'
/** 산점도 */
export { ScatterPlot } from './scatter-plot'
/** 워터폴 차트 */
export { WaterfallChart } from './waterfall-chart'
/** 미니 스파크라인 — 테이블 셀/카드 내부 소형 차트 */
export { MiniSparkline } from './mini-sparkline'
/** 매출 차트 툴팁 */
export { SalesChartTooltip } from './sales-chart-tooltip'
/** 점수 바 — 수평 점수 시각화 */
export { ScoreBar } from './score-bar'

// ─────────────────────────────────────────────────
// 12. MISC — 유틸리티 컴포넌트
// ─────────────────────────────────────────────────
/** 타임라인 — 이벤트 히스토리 표시 */
export { Timeline } from './timeline'
/** 텍스트 잘라내기 — 말줄임 + 호버 시 전체 표시 */
export { TruncateText } from './truncate-text'
/** 사진 선택 버튼 — 사진 라이브러리 피커 트리거 */
export { PhotoPickerButton } from './photo-picker-button'
/** 이미지 캐러셀 — 좌우 스와이프 이미지 뷰어 */
export { ImageCarousel } from './image-carousel'
/** 이미지 프리뷰 다이얼로그 — 전체화면 이미지 보기 */
export { ImagePreviewDialog } from './image-preview-dialog'
/** 플로팅 채팅 버튼 — AI 챗봇 */
export { FloatingChatButton } from './floating-chat'
/** 배치 선택 액션 바 — 다중 선택 시 하단 플로팅 바 */
export { ActionBar } from './action-bar'
/** 카드 그리드 — 반응형 카드 격자 배치 */
export { CardGrid } from './card-grid'
/** 체크박스 그룹 아코디언 — 접기 가능한 체크박스 그룹 */
export { CheckboxGroupAccordion } from './checkbox-group-accordion'
/** AI 태스크 카드 — 처리 필요 목록, 의견 충돌 표시 */
export { TaskCard } from './task-card'
