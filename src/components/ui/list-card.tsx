'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Button } from './button'

/* ── ListCard ────────────────────────────────────────
 *  리스트 형태 카드 — 거래내역, 할 일, 알림 등에 사용
 *
 *  사용법:
 *    <ListCard title="최근 거래">
 *      <ListCardItem
 *        title="Amazon.com"
 *        subtitle="2023-07-15"
 *        value="-₩129,990"
 *        valueClassName="text-hh-red"
 *      />
 *    </ListCard>
 * ──────────────────────────────────────────────────── */

interface ListCardProps {
  title: string
  action?: { label: string; onClick?: () => void }
  children: React.ReactNode
  className?: string
}

export function ListCard({ title, action, children, className }: ListCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {action && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">{children}</div>
      </CardContent>
    </Card>
  )
}

interface ListCardItemProps {
  title: string
  subtitle?: string
  value?: string
  valueClassName?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  onClick?: () => void
}

export function ListCardItem({
  title,
  subtitle,
  value,
  valueClassName,
  icon,
  action,
  onClick,
}: ListCardItemProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between',
        onClick && 'cursor-pointer rounded-md px-2 py-1.5 -mx-2 hover:bg-muted transition-colors',
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && <div className="flex-shrink-0">{icon}</div>}
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight truncate">{title}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {value && (
          <span className={cn('text-sm font-medium', valueClassName)}>{value}</span>
        )}
        {action}
      </div>
    </div>
  )
}
