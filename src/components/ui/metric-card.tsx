'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react'

/* ── MetricCard ──────────────────────────────────────
 *  큰 숫자 + 전기 대비 % + 아이콘
 *
 *  사용법:
 *    <MetricCard
 *      title="총 매출"
 *      value="₩4,523만"
 *      change="+20.1%"
 *      trend="up"
 *      icon={DollarSign}
 *    />
 * ──────────────────────────────────────────────────── */

interface MetricCardProps {
  title: string
  value: string
  change?: string
  description?: string
  /** Dashboard 스타일: 큰 설명 텍스트 (예: "Trending up this month") */
  subtitle?: string
  /** Dashboard 스타일: 부가 설명 (예: "Visitors for the last 6 months") */
  footnote?: string
  trend?: 'up' | 'down' | 'neutral'
  icon?: LucideIcon
  className?: string
}

export function MetricCard({
  title,
  value,
  change,
  description,
  subtitle,
  footnote,
  trend = 'neutral',
  icon: Icon,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {change && (
            <span
              className={cn(
                'flex items-center text-xs font-medium',
                trend === 'up' && 'text-emerald-600',
                trend === 'down' && 'text-hh-red',
                trend === 'neutral' && 'text-muted-foreground',
              )}
            >
              {trend === 'up' && <TrendingUp className="mr-0.5 h-3 w-3" />}
              {trend === 'down' && <TrendingDown className="mr-0.5 h-3 w-3" />}
              {change}
            </span>
          )}
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {/* 기본 스타일: change + description 한 줄 */}
        {!subtitle && description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
        {/* Dashboard 스타일: subtitle + footnote */}
        {subtitle && (
          <div className="mt-2">
            <p className="flex items-center gap-1 text-sm font-medium">
              {subtitle}
              {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />}
              {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-hh-red" />}
            </p>
            {footnote && (
              <p className="text-xs text-muted-foreground">{footnote}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
