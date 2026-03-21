'use client'

import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { ChevronRight } from 'lucide-react'

/* ── CheckboxGroupAccordion ─────────────────────────
 *  그룹별 아코디언 + 체크박스 — 테이블 선택, 권한 설정 등에 사용
 *
 *  사용법:
 *    <CheckboxGroupAccordion
 *      groups={[
 *        { label: '상품 마스터', items: [
 *          { id: 'products', label: '상품 (PG)', description: '제품 기본 정보' },
 *          { id: 'product_skus', label: 'SKU', description: '옵션×사이즈 조합' },
 *        ]},
 *      ]}
 *      selected={['products', 'product_skus']}
 *      onChange={(selected) => setSelected(selected)}
 *    />
 * ──────────────────────────────────────────────────── */

export interface CheckboxItem {
  id: string
  label: string
  description?: string
}

export interface CheckboxGroup {
  label: string
  items: CheckboxItem[]
}

interface CheckboxGroupAccordionProps {
  groups: CheckboxGroup[]
  selected: string[]
  onChange: (selected: string[]) => void
  /** 처음 펼칠 그룹 인덱스 (기본: 0) */
  defaultExpandedIndex?: number
  /** 선택 개수 표시 (기본: true) */
  showCount?: boolean
  className?: string
}

export function CheckboxGroupAccordion({
  groups,
  selected,
  onChange,
  defaultExpandedIndex = 0,
  showCount = true,
  className,
}: CheckboxGroupAccordionProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    groups.forEach((g, i) => { init[g.label] = i === defaultExpandedIndex })
    return init
  })

  const toggleExpand = (label: string) => {
    setExpanded(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const toggleItem = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter(s => s !== id)
        : [...selected, id],
    )
  }

  const toggleAll = (group: CheckboxGroup) => {
    const allIds = group.items.map(i => i.id)
    const allSelected = allIds.every(id => selected.includes(id))
    if (allSelected) {
      onChange(selected.filter(s => !allIds.includes(s)))
    } else {
      const set = new Set(selected)
      allIds.forEach(id => set.add(id))
      onChange(Array.from(set))
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {groups.map(group => {
        const isExpanded = expanded[group.label] ?? false
        const selectedCount = group.items.filter(i => selected.includes(i.id)).length
        const allSelected = selectedCount === group.items.length
        const someSelected = selectedCount > 0 && !allSelected

        return (
          <div
            key={group.label}
            className={cn(
              'border rounded-lg overflow-hidden transition-colors',
              (someSelected || allSelected) ? 'border-blue-300 bg-blue-50/30' : 'border-border',
            )}
          >
            {/* 그룹 헤더 */}
            <div
              className={cn(
                'flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer select-none',
                isExpanded && 'border-b bg-muted/50',
              )}
              onClick={() => toggleExpand(group.label)}
            >
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 text-muted-foreground transition-transform flex-shrink-0',
                  isExpanded && 'rotate-90',
                )}
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold">{group.label}</span>
                {showCount && (
                  <span className="text-xs text-muted-foreground ml-2">
                    {selectedCount}/{group.items.length}개 선택
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-6 px-2 text-[10px] font-semibold',
                  allSelected
                    ? 'border-red-300 text-red-600 hover:bg-red-50'
                    : 'border-blue-300 text-blue-600 hover:bg-blue-50',
                )}
                onClick={e => { e.stopPropagation(); toggleAll(group) }}
              >
                {allSelected ? '전체 해제' : '전체 선택'}
              </Button>
            </div>

            {/* 아이템 목록 */}
            {isExpanded && (
              <div className="px-3 py-2 flex flex-col gap-1">
                {group.items.map(item => {
                  const checked = selected.includes(item.id)
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        'flex items-start gap-2.5 px-2.5 py-2 rounded-md cursor-pointer transition-all',
                        checked
                          ? 'border border-blue-300 bg-blue-50/50'
                          : 'border border-transparent hover:bg-muted/50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItem(item.id)}
                        className="accent-primary w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold font-mono">{item.id}</span>
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {item.label}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
