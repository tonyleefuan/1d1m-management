'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { type LucideIcon, Circle } from 'lucide-react'

/* ── Timeline ─────────────────────────────────────
 *  상품 히스토리, 이벤트 로그 등에 사용하는 타임라인 컴포넌트
 *
 *  사용법:
 *    <Timeline
 *      items={[
 *        { date: '2025-03-15', title: '발주 완료', description: 'PO-001 생성', status: 'success' },
 *        { date: '2025-03-10', title: '입고 예정', description: '3/20 예정', status: 'info' },
 *        { date: '2025-03-05', title: '샘플 검수', status: 'warning' },
 *      ]}
 *    />
 *
 *    <Timeline items={items} variant="compact" />
 * ──────────────────────────────────────────────────── */

type TimelineStatus = 'success' | 'warning' | 'error' | 'info' | 'neutral'

interface TimelineItem {
  date: string
  title: string
  description?: string
  status?: TimelineStatus
  icon?: LucideIcon
  action?: React.ReactNode
}

interface TimelineProps {
  items: TimelineItem[]
  /** default: 풀사이즈, compact: 좁은 간격 */
  variant?: 'default' | 'compact'
  className?: string
}

const dotColors: Record<TimelineStatus, string> = {
  success: 'bg-emerald-500 ring-emerald-500/20',
  warning: 'bg-amber-500 ring-amber-500/20',
  error: 'bg-red-500 ring-red-500/20',
  info: 'bg-blue-500 ring-blue-500/20',
  neutral: 'bg-gray-400 ring-gray-400/20',
}

export function Timeline({ items, variant = 'default', className }: TimelineProps) {
  const isCompact = variant === 'compact'

  return (
    <div className={cn('relative', className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        const status = item.status ?? 'neutral'
        const Icon = item.icon

        return (
          <div key={`${item.date}-${i}`} className="relative flex gap-4">
            {/* 세로 라인 + 점 */}
            <div className="flex flex-col items-center">
              {Icon ? (
                <div className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full ring-4',
                  dotColors[status],
                )}>
                  <Icon className="h-3.5 w-3.5 text-white" />
                </div>
              ) : (
                <div className={cn(
                  'h-2.5 w-2.5 rounded-full ring-4 mt-1.5',
                  dotColors[status],
                )} />
              )}
              {!isLast && (
                <div className="w-px flex-1 bg-border" />
              )}
            </div>

            {/* 콘텐츠 */}
            <div className={cn('pb-6', isCompact && 'pb-4', isLast && 'pb-0')}>
              <div className="flex items-center gap-3">
                <time className="text-xs text-muted-foreground tabular-nums">{item.date}</time>
                {item.action}
              </div>
              <p className={cn('font-medium', isCompact ? 'text-sm' : 'text-sm mt-0.5')}>
                {item.title}
              </p>
              {item.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
