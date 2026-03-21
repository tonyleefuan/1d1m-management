'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './card'

/* ── ChartCard ───────────────────────────────────────
 *  차트를 감싸는 카드 — 제목 + 설명 + 차트 영역
 *
 *  사용법:
 *    <ChartCard title="매출 추이" description="최근 12개월">
 *      <ResponsiveContainer width="100%" height={300}>
 *        <LineChart data={data}>...</LineChart>
 *      </ResponsiveContainer>
 *    </ChartCard>
 * ──────────────────────────────────────────────────── */

interface ChartCardProps {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function ChartCard({ title, description, action, children, className }: ChartCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
