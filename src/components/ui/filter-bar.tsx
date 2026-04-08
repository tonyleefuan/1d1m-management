'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Input } from './input'
import { Button } from './button'
import { Search, X } from 'lucide-react'

/* ── FilterBar ─────────────────────────────────────
 *  Notion-style 검색 + 필터 + 액션 바
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
  search?: SearchConfig
  quickFilters?: QuickFilter[]
  filters?: React.ReactNode
  actions?: React.ReactNode
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
        <div className="flex items-center gap-3">
          {search && <SearchInput {...search} />}
          {actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
        </div>
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
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#a39e98]" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 w-[240px] bg-transparent border-[rgba(0,0,0,0.1)] placeholder:text-[#a39e98]"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#a39e98] hover:text-foreground transition-colors"
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
            'rounded px-3 py-1.5 text-[13px] font-medium transition-colors',
            f.className
              ? f.className
              : f.active
                ? 'bg-[rgba(0,0,0,0.05)] text-foreground'
                : 'text-[#a39e98] hover:text-[#615d59] hover:bg-[rgba(0,0,0,0.02)]',
          )}
        >
          {f.label}
          {f.count !== undefined && (
            <span className={cn(
              'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]',
              f.active ? 'bg-[rgba(0,0,0,0.08)] text-foreground' : 'bg-[rgba(0,0,0,0.04)] text-[#a39e98]',
            )}>
              {f.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
