'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react'

/* ── MetricCard ──────────────────────────────────────
 *  Notion-style 통계 카드: 큰 숫자 + 전기 대비 % + 아이콘
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
  subtitle?: string
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
        <CardTitle className="text-[14px] font-medium text-[#615d59]">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {change && (
            <span
              className={cn(
                'flex items-center text-[13px] font-medium',
                trend === 'up' && 'text-[#2a9d99]',
                trend === 'down' && 'text-[#e5484d]',
                trend === 'neutral' && 'text-[#a39e98]',
              )}
            >
              {trend === 'up' && <TrendingUp className="mr-0.5 h-3 w-3" />}
              {trend === 'down' && <TrendingDown className="mr-0.5 h-3 w-3" />}
              {change}
            </span>
          )}
          {Icon && <Icon className="h-4 w-4 text-[#a39e98]" />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-[28px] font-bold tracking-[-0.5px]">{value}</div>
        {!subtitle && description && (
          <p className="mt-1 text-[13px] text-[#a39e98]">{description}</p>
        )}
        {subtitle && (
          <div className="mt-2">
            <p className="flex items-center gap-1 text-[14px] font-medium">
              {subtitle}
              {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-[#2a9d99]" />}
              {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-[#e5484d]" />}
            </p>
            {footnote && (
              <p className="text-[13px] text-[#a39e98]">{footnote}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
