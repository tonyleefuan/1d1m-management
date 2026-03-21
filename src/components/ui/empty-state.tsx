import React from 'react'
import { cn } from '@/lib/utils'
import { type LucideIcon, Inbox } from 'lucide-react'
import { Button } from './button'

/* ── EmptyState ──────────────────────────────────────
 *  데이터가 없을 때 표시하는 안내 UI
 *
 *  사용법:
 *    <EmptyState
 *      icon={PackageSearch}
 *      title="상품이 없습니다"
 *      description="새 상품을 등록해보세요"
 *      action={{ label: "상품 등록", onClick: () => {} }}
 *    />
 * ──────────────────────────────────────────────────── */

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  className?: string
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="rounded-full bg-muted p-3 mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-[280px]">{description}</p>
      )}
      {action && (
        <Button size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
