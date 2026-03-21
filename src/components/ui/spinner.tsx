import React from 'react'
import { cn } from '@/lib/utils'

/* ── Spinner ────────────────────────────────────────
 *  인라인 로딩 스피너 — 버튼/셀/인라인 위치에서 사용
 *
 *  사용법:
 *    <Spinner />                         // 기본 (16px)
 *    <Spinner size="sm" />               // 작은 (12px)
 *    <Spinner size="lg" />               // 큰 (24px)
 *    <Spinner size="xl" />               // 매우 큰 (32px)
 *    <Spinner className="text-hh-blue" /> // 색상 커스텀
 *
 *    // 텍스트와 함께
 *    <span className="flex items-center gap-2">
 *      <Spinner size="sm" /> 불러오는 중...
 *    </span>
 * ──────────────────────────────────────────────────── */

type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const sizeMap: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3 border-[1.5px]',
  sm: 'h-3.5 w-3.5 border-[1.5px]',
  md: 'h-4 w-4 border-2',
  lg: 'h-6 w-6 border-2',
  xl: 'h-8 w-8 border-[2.5px]',
}

interface SpinnerProps {
  size?: SpinnerSize
  className?: string
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-current border-t-transparent',
        sizeMap[size],
        className,
      )}
      role="status"
      aria-label="로딩 중"
    />
  )
}
