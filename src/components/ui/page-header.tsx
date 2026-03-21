'use client'

import React from 'react'
import { cn } from '@/lib/utils'

/* ── PageHeader ──────────────────────────────────────
 *  페이지/섹션 제목 + 우측 액션 영역
 *
 *  사용법:
 *    <PageHeader title="광고 운영">
 *      <DateRangePicker />
 *      <Button>Export</Button>
 *    </PageHeader>
 *
 *    <SectionHeader title="Business Metrics">
 *      <Button variant="outline" size="sm">View Details →</Button>
 *    </SectionHeader>
 * ──────────────────────────────────────────────────── */

interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

interface SectionHeaderProps {
  title: string
  children?: React.ReactNode
  className?: string
}

export function SectionHeader({ title, children, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
