'use client'

import * as React from 'react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Collapsible ────────────────────────────────────
 *  접기/펼치기 컨테이너 (Radix UI 기반)
 *
 *  기본 사용법:
 *    <Collapsible>
 *      <CollapsibleTrigger>제목</CollapsibleTrigger>
 *      <CollapsibleContent>내용</CollapsibleContent>
 *    </Collapsible>
 *
 *  카드 스타일 (CollapsibleCard):
 *    <CollapsibleCard title="모듈명" description="설명" badge="3/5개">
 *      <div>내용</div>
 *    </CollapsibleCard>
 * ──────────────────────────────────────────────────── */

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = CollapsiblePrimitive.Trigger

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.Content
    ref={ref}
    className={cn(
      'overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down',
      className,
    )}
    {...props}
  />
))
CollapsibleContent.displayName = 'CollapsibleContent'

/* ── CollapsibleCard ────────────────────────────────
 *  카드 스타일의 아코디언 — 제목 + 설명 + 뱃지 + 액션 내장
 *
 *  사용법:
 *    <CollapsibleCard
 *      title="상품 마스터"
 *      description="15개 테이블"
 *      badge="3/15개 선택"
 *      action={<Button size="sm">전체 선택</Button>}
 *      defaultOpen
 *    >
 *      <div>내용</div>
 *    </CollapsibleCard>
 * ──────────────────────────────────────────────────── */

interface CollapsibleCardProps {
  title: string
  description?: string
  badge?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  /** 열림/닫힘 상태에 따라 테두리 색상 강조 */
  highlighted?: boolean
}

function CollapsibleCard({
  title,
  description,
  badge,
  action,
  children,
  defaultOpen,
  open,
  onOpenChange,
  className,
  highlighted,
}: CollapsibleCardProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      <div
        className={cn(
          'rounded-lg border bg-card overflow-hidden transition-colors',
          highlighted ? 'border-hh-blue/40 bg-blue-bg/30' : 'border-border',
          className,
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
              'hover:bg-muted/50',
              'data-[state=open]:bg-muted/30',
            )}
          >
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-90" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{title}</span>
                {badge && (
                  <span className="text-xs text-muted-foreground">{badge}</span>
                )}
              </div>
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {description}
                </p>
              )}
            </div>
            {action && (
              <div onClick={e => e.stopPropagation()} className="shrink-0">
                {action}
              </div>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-4 py-3">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent, CollapsibleCard }
