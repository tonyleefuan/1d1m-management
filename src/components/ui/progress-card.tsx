'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Badge } from './badge'
import { type LucideIcon } from 'lucide-react'

/* ── ProgressCard ────────────────────────────────────
 *  상태 뱃지 + 프로그레스 바 + 달성률
 *
 *  사용법:
 *    <ProgressCard
 *      title="매출 목표"
 *      subtitle="월간 목표 대비"
 *      status="on-track"
 *      current={7500}
 *      target={10000}
 *      unit="만원"
 *      icon={TrendingUp}
 *    />
 * ──────────────────────────────────────────────────── */

type Status = 'on-track' | 'behind' | 'ahead' | 'at-risk'

const statusConfig: Record<Status, { label: string; className: string }> = {
  'on-track': { label: '정상', className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' },
  behind: { label: '미달', className: 'bg-red-100 text-red-800 hover:bg-red-100' },
  ahead: { label: '초과', className: 'bg-blue-100 text-blue-800 hover:bg-blue-100' },
  'at-risk': { label: '주의', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
}

interface ProgressCardProps {
  title: string
  subtitle?: string
  status: Status
  current: number
  target: number
  unit?: string
  icon?: LucideIcon
  formatValue?: (v: number) => string
  className?: string
}

export function ProgressCard({
  title,
  subtitle,
  status,
  current,
  target,
  unit = '',
  icon: Icon,
  formatValue,
  className,
}: ProgressCardProps) {
  const pct = target > 0 ? Math.round((current / target) * 100) : 0
  const fmt = formatValue ?? ((v: number) => v.toLocaleString())
  const sc = statusConfig[status]

  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <Badge variant="secondary" className={cn('font-normal', sc.className)}>
              {sc.label}
            </Badge>
            <span className="text-muted-foreground">
              {fmt(current)} / {fmt(target)} {unit}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {unit}{fmt(target)}
            </span>
            <span className="text-muted-foreground">{pct}% 달성</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
