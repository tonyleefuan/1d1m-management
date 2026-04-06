'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Input } from './input'
import { Button } from './button'
import { Search, X, SlidersHorizontal } from 'lucide-react'

/* ── FilterBar ─────────────────────────────────────
 *  검색 + 필터 + 액션을 한 줄에 배치하는 공통 컴포넌트
 *  거의 모든 탭에서 사용됨
 *
 *  사용법:
 *    <FilterBar
 *      search={{ value, onChange, placeholder: '검색...' }}
 *      filters={<><Select /><Select /></>}
 *      actions={<Button>Export</Button>}
 *    />
 *
 *    <FilterBar
 *      search={{ value, onChange }}
 *      quickFilters={[
 *        { label: '전체', active: true, onClick: () => {} },
 *        { label: '판매중', onClick: () => {} },
 *        { label: '품절', onClick: () => {} },
 *      ]}
 *    />
 * ──────────────────────────────────────────────────── */

interface QuickFilter {
  label: string
  active?: boolean
  count?: number
  onClick: () => void
  className?: string
}

interface SearchConfig {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

interface FilterBarProps {
  /** 검색 입력 */
  search?: SearchConfig
  /** 빠른 필터 탭 */
  quickFilters?: QuickFilter[]
  /** 드롭다운 필터 영역 */
  filters?: React.ReactNode
  /** 우측 액션 버튼 영역 */
  actions?: React.ReactNode
  /** 레이아웃: inline(한 줄), stacked(2줄) */
  layout?: 'inline' | 'stacked'
  className?: string
}

export function FilterBar({
  search,
  quickFilters,
  filters,
  actions,
  layout = 'inline',
  className,
}: FilterBarProps) {
  if (layout === 'stacked') {
    return (
      <div className={cn('space-y-3', className)}>
        {/* 첫 줄: 검색 + 액션 */}
        <div className="flex items-center gap-3">
          {search && <SearchInput {...search} />}
          {actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
        </div>
        {/* 둘째 줄: 필터 */}
        {(quickFilters || filters) && (
          <div className="flex items-center gap-2 flex-wrap">
            {quickFilters && <QuickFilters items={quickFilters} />}
            {filters}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-3 flex-wrap', className)}>
      {search && <SearchInput {...search} />}
      {quickFilters && <QuickFilters items={quickFilters} />}
      {filters}
      {actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
    </div>
  )
}

function SearchInput({ value, onChange, placeholder = '검색...' }: SearchConfig) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 w-[240px]"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function QuickFilters({ items }: { items: QuickFilter[] }) {
  return (
    <div className="flex gap-1">
      {items.map((f) => (
        <button
          key={f.label}
          onClick={f.onClick}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            f.className
              ? f.className
              : f.active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {f.label}
          {f.count !== undefined && (
            <span className={cn(
              'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]',
              f.active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}>
              {f.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
