import React from 'react'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'

/* ── Breadcrumb ─────────────────────────────────────
 *  네비게이션 경로 표시
 *
 *  사용법:
 *    <Breadcrumb
 *      items={[
 *        { label: '상품 마스터', href: '#' },
 *        { label: 'HH-2401 오버사이즈 코트' },
 *      ]}
 *    />
 * ──────────────────────────────────────────────────── */

interface BreadcrumbItem {
  label: string
  href?: string
  onClick?: () => void
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav className={cn('flex items-center gap-1.5 text-sm', className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1

        return (
          <React.Fragment key={item.label}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            {isLast ? (
              <span className="font-medium text-foreground">{item.label}</span>
            ) : (
              <button
                onClick={item.onClick}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label}
              </button>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
