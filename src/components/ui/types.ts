/**
 * ═══════════════════════════════════════════════════════════════════
 *  HAVEHAD Design System — Shared Types
 * ═══════════════════════════════════════════════════════════════════
 *
 *  여러 컴포넌트에서 공유하는 타입 정의.
 *  Montage의 types.ts 패턴을 따르되, 폴더 분리 없이 한 곳에서 관리.
 *
 *  import type { StatusType, Size, Variant } from '@/components/ui/types'
 * ═══════════════════════════════════════════════════════════════════
 */

/** 상태 유형 — StatusBadge, CellStatus 등에서 공통 사용 */
export type StatusType = 'success' | 'warning' | 'error' | 'info' | 'neutral'

/** 컴포넌트 크기 — 작은 것부터 */
export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/** 모달/다이얼로그 크기 */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

/** 뱃지/배너 variant */
export type Variant = 'default' | 'destructive' | 'outline' | 'secondary'

/** 정렬 방향 */
export type SortDirection = 'asc' | 'desc'

/** 테이블 셀 정렬 */
export type CellAlign = 'left' | 'center' | 'right'

/** 공통 컴포넌트 기본 Props */
export interface BaseProps {
  className?: string
  children?: React.ReactNode
}

/** 제어/비제어 패턴 */
export interface ControllableProps<T> {
  value?: T
  defaultValue?: T
  onChange?: (value: T) => void
}

/** 비즈니스 상태 매핑 — 탭에서 StatusBadge에 연결할 때 */
export interface StatusMapping {
  label: string
  status: StatusType
  icon?: React.ComponentType<{ className?: string }>
}

/** 비즈니스 상태 맵 타입 */
export type StatusMap = Record<string, StatusMapping>
