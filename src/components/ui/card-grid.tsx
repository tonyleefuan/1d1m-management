'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from './card'
import { StatusBadge } from './status-badge'
import { Button } from './button'
import { Plus } from 'lucide-react'

/* ── CardGrid ───────────────────────────────────────
 *  카드 그리드 레이아웃 — 프로파일, 프로젝트, 설정 등에 사용
 *
 *  사용법:
 *    <CardGrid
 *      items={profiles}
 *      renderCard={(item) => ({
 *        title: item.name,
 *        description: item.description,
 *        status: { label: '활성', type: 'success' },
 *        meta: [
 *          { label: '모델', value: 'Sonnet 4.6' },
 *          { label: '읽기', value: '12개' },
 *        ],
 *      })}
 *      onCardClick={(item) => edit(item)}
 *      addButton={{ label: '새 프로파일 추가', onClick: () => add() }}
 *    />
 * ──────────────────────────────────────────────────── */

interface CardMeta {
  label: string
  value: string
  valueClassName?: string
}

interface CardStatus {
  label: string
  type: 'success' | 'warning' | 'error' | 'info' | 'neutral'
}

interface CardRenderResult {
  title: string
  description?: string
  icon?: React.ReactNode
  status?: CardStatus
  meta?: CardMeta[]
  actionLabel?: string
}

interface CardGridProps<T> {
  items: T[]
  renderCard: (item: T, index: number) => CardRenderResult
  onCardClick?: (item: T, index: number) => void
  addButton?: { label: string; onClick: () => void }
  columns?: 2 | 3 | 4
  className?: string
  emptyMessage?: string
}

export function CardGrid<T>({
  items,
  renderCard,
  onCardClick,
  addButton,
  columns = 2,
  className,
  emptyMessage = '항목이 없습니다.',
}: CardGridProps<T>) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }

  return (
    <div className={cn('grid gap-4', gridCols[columns], className)}>
      {items.map((item, index) => {
        const card = renderCard(item, index)
        return (
          <Card
            key={index}
            className={cn(
              'transition-all',
              onCardClick && 'cursor-pointer hover:border-blue-300 hover:shadow-md',
            )}
            onClick={() => onCardClick?.(item, index)}
          >
            <CardContent className="p-5">
              {/* 헤더: 아이콘 + 제목 + 상태 */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {card.icon && (
                    <div className="flex-shrink-0 text-muted-foreground">{card.icon}</div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate">{card.title}</h3>
                    {card.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {card.description}
                      </p>
                    )}
                  </div>
                </div>
                {card.status && (
                  <StatusBadge status={card.status.type} className="flex-shrink-0">
                    {card.status.label}
                  </StatusBadge>
                )}
              </div>

              {/* 메타 정보 */}
              {card.meta && card.meta.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {card.meta.map((m, i) => (
                    <div key={i} className="text-xs">
                      <span className="text-muted-foreground">{m.label}: </span>
                      <span className={cn('font-medium', m.valueClassName)}>{m.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 액션 라벨 */}
              {card.actionLabel && (
                <div className="mt-3 pt-3 border-t">
                  <span className="text-xs text-blue-600 font-medium">{card.actionLabel}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* 추가 버튼 카드 */}
      {addButton && (
        <Card
          className="cursor-pointer border-dashed hover:border-blue-300 hover:bg-blue-50/50 transition-all"
          onClick={addButton.onClick}
        >
          <CardContent className="p-5 flex flex-col items-center justify-center h-full min-h-[100px] gap-2">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">
              {addButton.label}
            </span>
          </CardContent>
        </Card>
      )}

      {/* 빈 상태 */}
      {items.length === 0 && !addButton && (
        <div className="col-span-full text-center py-8 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      )}
    </div>
  )
}
