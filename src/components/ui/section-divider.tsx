import React from 'react'
import { cn } from '@/lib/utils'

/* ── SectionDivider ─────────────────────────────────
 *  라벨이 있는 구분선 — 폼/페이지 내 섹션 구분
 *
 *  사용법:
 *    // 기본 (가운데 라벨)
 *    <SectionDivider label="기본 정보" />
 *
 *    // 좌측 라벨
 *    <SectionDivider label="SKU 목록" align="left" />
 *
 *    // 라벨 없이 구분선만
 *    <SectionDivider />
 *
 *    // 간격 조절
 *    <SectionDivider label="설정" spacing="lg" />
 *
 *    // 접힌 형태 (텍스트 + 점선)
 *    <SectionDivider label="고급 설정" variant="dashed" />
 * ──────────────────────────────────────────────────── */

interface SectionDividerProps {
  /** 구분선 라벨 */
  label?: string
  /** 라벨 위치 */
  align?: 'left' | 'center' | 'right'
  /** 선 스타일 */
  variant?: 'solid' | 'dashed' | 'dotted'
  /** 상하 간격 */
  spacing?: 'sm' | 'md' | 'lg'
  className?: string
}

const spacingMap: Record<string, string> = {
  sm: 'my-3',
  md: 'my-5',
  lg: 'my-8',
}

const lineStyle: Record<string, string> = {
  solid: 'border-border',
  dashed: 'border-dashed border-border',
  dotted: 'border-dotted border-border',
}

export function SectionDivider({
  label,
  align = 'center',
  variant = 'solid',
  spacing = 'md',
  className,
}: SectionDividerProps) {
  if (!label) {
    return (
      <div className={cn(spacingMap[spacing], className)}>
        <div className={cn('border-t', lineStyle[variant])} />
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-3', spacingMap[spacing], className)}>
      {align !== 'left' && (
        <div className={cn('flex-1 border-t', lineStyle[variant])} />
      )}
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
        {label}
      </span>
      {align !== 'right' && (
        <div className={cn('flex-1 border-t', lineStyle[variant])} />
      )}
    </div>
  )
}
