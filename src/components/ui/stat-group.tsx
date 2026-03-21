'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { MetricCard } from './metric-card'
import { type LucideIcon } from 'lucide-react'

/* ── StatGroup ─────────────────────────────────────
 *  MetricCard를 그리드로 묶어주는 래퍼
 *  cols, variant로 레이아웃 변경 가능
 *
 *  사용법:
 *    <StatGroup
 *      stats={[
 *        { title: '매출', value: '₩4,523만', change: '+20%', trend: 'up', icon: DollarSign },
 *        { title: '주문', value: '2,350', change: '-3%', trend: 'down', icon: ShoppingCart },
 *      ]}
 *    />
 *
 *    <StatGroup stats={stats} cols={3} variant="compact" />
 * ──────────────────────────────────────────────────── */

interface Stat {
  title: string
  value: string
  change?: string
  description?: string
  subtitle?: string
  footnote?: string
  trend?: 'up' | 'down' | 'neutral'
  icon?: LucideIcon
}

interface StatGroupProps {
  stats: Stat[]
  /** 그리드 칼럼 수 (기본: stats 개수, 최대 6) */
  cols?: 2 | 3 | 4 | 5 | 6
  /** compact: 작은 카드, default: 기본, dashboard: subtitle 스타일 */
  variant?: 'default' | 'compact' | 'dashboard'
  className?: string
}

const colsClass: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
}

export function StatGroup({ stats, cols, variant = 'default', className }: StatGroupProps) {
  const gridCols = cols ?? Math.min(stats.length, 4)

  if (variant === 'compact') {
    return (
      <div className={cn('grid gap-3', colsClass[gridCols], className)}>
        {stats.map((s) => (
          <div key={s.title} className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.title}</span>
              {s.change && (
                <span className={cn(
                  'text-[10px] font-medium',
                  s.trend === 'up' ? 'text-emerald-600' : s.trend === 'down' ? 'text-hh-red' : 'text-muted-foreground',
                )}>
                  {s.change}
                </span>
              )}
            </div>
            <div className="mt-1 text-lg font-bold">{s.value}</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('grid gap-4', colsClass[gridCols], className)}>
      {stats.map((s) => (
        <MetricCard key={s.title} {...s} />
      ))}
    </div>
  )
}
