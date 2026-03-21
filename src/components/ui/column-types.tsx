'use client'

import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { StatusBadge, type StatusType } from './status-badge'
import { SmartSelect, type SelectOption } from './smart-select'
import { Calendar, ExternalLink, Image as ImageIcon, X, Plus, Check } from 'lucide-react'

/* ═══════════════════════════════════════════════════
 *  칼럼 타입 레지스트리 (Column Type Registry)
 *
 *  테이블 안에서 사용되는 모든 칼럼 렌더링 패턴을 한 곳에서 관리.
 *  EditableDataTable, GroupedDataTable, DataTable 에서 공통으로 사용.
 *
 *  사용법:
 *    import { columnRenderers } from '@/components/ui/column-types'
 *
 *    // 테이블 칼럼 정의에서:
 *    { key: 'price', label: '판매가', type: 'currency' }
 *    { key: 'pg_code', label: '상품코드', type: 'code' }
 *    { key: 'seasons', label: '시즌', type: 'boolean-flags',
 *      flagConfig: { keys: ['spring','summer','autumn','winter'], labels: ['Sp','Su','Fw','Wi'], colors: [...] } }
 *
 *  design-preview 에서 전체 타입 쇼케이스 확인 가능.
 * ═══════════════════════════════════════════════════ */

// ── 공통 스타일 ──
const emptyText = <span className="text-muted-foreground/40">—</span>

// ── 1. Code (모노스페이스 코드) ──
export function CellCode({ value }: { value: any }) {
  if (!value) return emptyText
  return <span className="text-[11px] text-muted-foreground font-medium tracking-tight">{value}</span>
}

// ── 2. Currency (통화) ──
export function CellCurrency({
  value,
  currency = '₩',
  bold,
}: {
  value: any
  currency?: string
  bold?: boolean
}) {
  if (value == null || value === '') return emptyText
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return emptyText
  const formatted = `${currency}${Math.abs(num).toLocaleString()}`
  return (
    <span className={cn(
      'text-xs tabular-nums',
      bold && 'font-semibold',
      num < 0 ? 'text-hh-red' : 'text-foreground',
    )}>
      {num < 0 ? '-' : ''}{formatted}
    </span>
  )
}

// ── 3. Number (숫자) ──
export function CellNumber({ value, unit }: { value: any; unit?: string }) {
  if (value == null || value === '') return emptyText
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return emptyText
  return (
    <span className="text-xs tabular-nums">
      {num.toLocaleString()}{unit && <span className="text-muted-foreground ml-0.5">{unit}</span>}
    </span>
  )
}

// ── 4. Percentage (퍼센트) ──
export function CellPercent({ value, showSign }: { value: any; showSign?: boolean }) {
  if (value == null || value === '') return emptyText
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return emptyText
  const sign = showSign && num > 0 ? '+' : ''
  return (
    <span className={cn(
      'text-xs tabular-nums font-medium',
      num > 0 ? 'text-emerald-600' : num < 0 ? 'text-hh-red' : 'text-muted-foreground',
    )}>
      {sign}{num.toFixed(1)}%
    </span>
  )
}

// ── 5. Date (날짜) ──
export function CellDate({ value, showIcon }: { value: any; showIcon?: boolean }) {
  if (!value) return emptyText
  return (
    <span className="flex items-center gap-1.5 text-sm">
      {showIcon && <Calendar className="h-3.5 w-3.5 text-muted-foreground" />}
      {value}
    </span>
  )
}

// ── 6. Status (상태 뱃지) ──
export function CellStatus({
  value,
  statusMap,
}: {
  value: any
  statusMap?: Record<string, { status: StatusType; label?: string }>
}) {
  if (!value) return emptyText
  if (statusMap && statusMap[value]) {
    const { status, label } = statusMap[value]
    return <StatusBadge status={status}>{label ?? value}</StatusBadge>
  }
  return <StatusBadge status="neutral">{value}</StatusBadge>
}

// ── 7. Custom Status Badge (커스텀 색상) ──
export function CellCustomStatus({
  value,
  colorMap,
}: {
  value: any
  colorMap?: Record<string, { bg: string; fg: string; border?: string }>
}) {
  if (!value) return emptyText
  const colors = colorMap?.[value]
  if (!colors) return <span className="text-xs text-muted-foreground">{value}</span>
  return (
    <span
      className="text-[10px] px-2 py-[3px] rounded font-semibold tracking-tight whitespace-nowrap leading-none border"
      style={{ background: colors.bg, color: colors.fg, borderColor: colors.border ?? colors.bg }}
    >
      {value}
    </span>
  )
}

// ── 8. Boolean Flags (다중 불리언 — 시즌 점 등) ──
export function CellBooleanFlags({
  value,
  keys,
  labels,
  colors,
}: {
  value: any
  keys: string[]
  labels: string[]
  colors: string[]
}) {
  if (!value || typeof value !== 'object') return emptyText
  const active = keys.filter((k) => value[k])
  if (active.length === 0) return emptyText
  return (
    <div className="flex gap-0.5">
      {active.map((k) => {
        const idx = keys.indexOf(k)
        return (
          <span
            key={k}
            className="w-[22px] h-[19px] rounded-[3px] text-[9px] font-bold inline-flex items-center justify-center tracking-tight"
            style={{ background: colors[idx] + '14', color: colors[idx] }}
          >
            {labels[idx]}
          </span>
        )
      })}
    </div>
  )
}

// ── 9. Brand Dot (브랜드 색상 점 + 텍스트) ──
export function CellBrandDot({
  value,
  color,
  brandColorMap,
}: {
  value: any
  color?: string
  brandColorMap?: Record<string, string>
}) {
  if (!value) return emptyText
  const dotColor = color ?? brandColorMap?.[value] ?? '#999'
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
      <span className="truncate">{value}</span>
    </span>
  )
}

// ── 10. Image Thumbnail (이미지 썸네일) ──
export function CellImage({
  value,
  alt,
  size = 32,
}: {
  value: any
  alt?: string
  size?: number
}) {
  if (!value) {
    return (
      <div
        className="rounded bg-muted flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <ImageIcon className="h-3 w-3 text-muted-foreground" />
      </div>
    )
  }
  return (
    <img
      src={value}
      alt={alt ?? ''}
      className="rounded object-cover"
      style={{ width: size, height: size }}
    />
  )
}

// ── 11. Link (URL 링크) ──
export function CellLink({ value, label }: { value: any; label?: string }) {
  if (!value) return emptyText
  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="text-hh-blue hover:underline text-xs inline-flex items-center gap-1"
    >
      {label ?? value}
      <ExternalLink className="h-3 w-3" />
    </a>
  )
}

// ── 12. Tags (다중 태그) ──
export function CellTags({
  value,
  colorMap,
}: {
  value: any
  colorMap?: Record<string, { bg: string; text: string }>
}) {
  if (!value || (Array.isArray(value) && value.length === 0)) return emptyText
  const tags = Array.isArray(value) ? value : [value]
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag: string) => {
        const cm = colorMap?.[tag]
        return (
          <span
            key={tag}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={cm ? { background: cm.bg, color: cm.text } : { background: '#f1f5f9', color: '#64748b' }}
          >
            {tag}
          </span>
        )
      })}
    </div>
  )
}

// ── 13. Currency Auto (자동계산 표시 통화) ──
export function CellCurrencyAuto({
  value,
  isAuto,
  currency = '₩',
}: {
  value: any
  isAuto?: boolean
  currency?: string
}) {
  if (value == null || value === '') return emptyText
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return emptyText
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('text-xs tabular-nums', isAuto && 'text-hh-blue italic')}>
        {currency}{num.toLocaleString()}
      </span>
      {isAuto && (
        <span className="text-[10px] text-hh-blue font-medium bg-hh-blue/[0.07] py-0.5 px-1.5 rounded">
          자동
        </span>
      )}
    </span>
  )
}

// ── 한국식 축약 포맷 헬퍼 (1.5만, 200만, 4,000만, 5.1억) ──
function formatKoreanUnit(num: number): string {
  const abs = Math.abs(num)
  const sign = num < 0 ? '-' : ''
  if (abs >= 100_000_000) {
    const eok = abs / 100_000_000
    return `${sign}${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억`
  }
  if (abs >= 10_000) {
    const man = abs / 10_000
    if (man % 1 === 0) {
      return `${sign}${man.toLocaleString()}만`
    }
    return `${sign}${man.toFixed(1)}만`
  }
  return `${sign}${abs.toLocaleString()}`
}

// ── 14. Currency KR (한국식 축약 통화 — 만/억 단위) ──
export function CellCurrencyKr({
  value,
  currency = '₩',
  bold,
}: {
  value: any
  currency?: string
  bold?: boolean
}) {
  if (value == null || value === '') return emptyText
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return emptyText
  return (
    <span className={cn(
      'text-xs tabular-nums',
      bold && 'font-semibold',
      num < 0 ? 'text-hh-red' : 'text-foreground',
    )}>
      {currency}{formatKoreanUnit(num)}
    </span>
  )
}

// ── 15. Inherited Value (상속값 — PG 기본값 등) ──
export function CellInherited({
  value,
  inheritedLabel = '기본값',
}: {
  value: any
  inheritedLabel?: string
}) {
  if (value != null && value !== '') {
    return <span className="text-sm">{value}</span>
  }
  return <span className="text-[10px] text-muted-foreground italic">{inheritedLabel}</span>
}

// ── 15. Toggle (스위치/체크박스) ──
export function CellToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange?.(!value)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        value ? 'bg-primary' : 'bg-muted',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm',
          value ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}

// ── 칼럼 표시 타입 (테이블 칼럼 정의에서 cellType 으로 지정) ──
export type CellDisplayType =
  | 'code' | 'currency' | 'currency-kr' | 'number' | 'percent' | 'date'
  | 'status' | 'custom-status' | 'boolean-flags' | 'brand-dot'
  | 'image' | 'link' | 'tags' | 'currency-auto' | 'inherited' | 'toggle'

/** 칼럼별 추가 설정 (cellType에 따라 필요한 옵션) */
export interface CellTypeConfig {
  currency?: string
  bold?: boolean
  unit?: string
  showSign?: boolean
  showIcon?: boolean
  statusMap?: Record<string, { status: StatusType; label?: string }>
  colorMap?: Record<string, { bg: string; fg?: string; text?: string; border?: string }>
  flagKeys?: string[]
  flagLabels?: string[]
  flagColors?: string[]
  brandColorMap?: Record<string, string>
  imageSize?: number
  linkLabel?: string
  inheritedLabel?: string
}

/**
 * 칼럼 타입 자동 렌더러
 * 테이블 컴포넌트에서 cellType이 지정되면 자동으로 적절한 렌더러를 사용.
 * 커스텀 render 함수가 있으면 그게 우선됨.
 */
export function renderCellByType(
  cellType: CellDisplayType,
  value: any,
  row: any,
  config?: CellTypeConfig,
): React.ReactNode {
  switch (cellType) {
    case 'code':
      return <CellCode value={value} />
    case 'currency':
      return <CellCurrency value={value} currency={config?.currency} bold={config?.bold} />
    case 'number':
      return <CellNumber value={value} unit={config?.unit} />
    case 'percent':
      return <CellPercent value={value} showSign={config?.showSign} />
    case 'date':
      return <CellDate value={value} showIcon={config?.showIcon} />
    case 'status':
      return <CellStatus value={value} statusMap={config?.statusMap} />
    case 'custom-status':
      return <CellCustomStatus value={value} colorMap={config?.colorMap as Record<string, { bg: string; fg: string; border?: string }>} />
    case 'boolean-flags':
      return <CellBooleanFlags value={value} keys={config?.flagKeys ?? []} labels={config?.flagLabels ?? []} colors={config?.flagColors ?? []} />
    case 'brand-dot':
      return <CellBrandDot value={value} brandColorMap={config?.brandColorMap} />
    case 'image':
      return <CellImage value={value} size={config?.imageSize} />
    case 'link':
      return <CellLink value={value} label={config?.linkLabel} />
    case 'tags':
      return <CellTags value={value} colorMap={config?.colorMap as Record<string, { bg: string; text: string }>} />
    case 'currency-kr':
      return <CellCurrencyKr value={value} currency={config?.currency} bold={config?.bold} />
    case 'currency-auto':
      return <CellCurrencyAuto value={value} currency={config?.currency} />
    case 'inherited':
      return <CellInherited value={value} inheritedLabel={config?.inheritedLabel} />
    case 'toggle':
      return <CellToggle value={!!value} />
    default:
      return <span className="text-sm">{value != null ? String(value) : '—'}</span>
  }
}

/* ═══════════════════════════════════════════════════
 *  인터랙티브 칼럼 타입 (Interactive Column Types)
 *
 *  아래 타입들은 onChange 콜백이 필요하므로 cellType 자동 렌더링이 아닌
 *  render 함수를 통해 사용합니다.
 *
 *  사용법:
 *    { key: 'tags', label: '태그',
 *      render: (value, row) => <CellEditableTags value={value} onChange={...} /> }
 * ═══════════════════════════════════════════════════ */

// ── 17. Editable Tags (추가/삭제 가능한 태그) ──
export function CellEditableTags({
  value,
  onChange,
  colorMap,
  placeholder = '추가...',
}: {
  value: string[]
  onChange?: (tags: string[]) => void
  colorMap?: Record<string, { bg: string; text: string }>
  placeholder?: string
}) {
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const tags = Array.isArray(value) ? value : []

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus()
  }, [adding])

  const handleAdd = () => {
    const v = input.trim()
    if (v && !tags.includes(v)) {
      onChange?.([...tags, v])
    }
    setInput('')
    setAdding(false)
  }

  const handleRemove = (tag: string) => {
    onChange?.(tags.filter((t) => t !== tag))
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => {
        const cm = colorMap?.[tag]
        return (
          <span
            key={tag}
            className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium group"
            style={cm ? { background: cm.bg, color: cm.text } : { background: '#f1f5f9', color: '#64748b' }}
          >
            {tag}
            {onChange && (
              <X
                className="h-3 w-3 cursor-pointer opacity-50 hover:opacity-100"
                onClick={() => handleRemove(tag)}
              />
            )}
          </span>
        )
      })}
      {onChange && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-muted-foreground/60 transition-colors"
        >
          <Plus className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
      {adding && (
        <span className="inline-flex items-center gap-0.5">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setInput('') } }}
            onBlur={handleAdd}
            placeholder={placeholder}
            className="w-16 text-[11px] border-b border-muted-foreground/30 bg-transparent focus:outline-none focus:border-primary px-0.5 py-0"
          />
        </span>
      )}
    </div>
  )
}

// ── 18. Search Select (검색 가능 단일 선택 + 부가설명 + 추가) ──
export function CellSearchSelect({
  value,
  options,
  onChange,
  onAdd,
  onEdit,
  onDelete,
  placeholder = '선택...',
  manageable,
}: {
  value: string
  options: SelectOption[]
  onChange?: (value: string) => void
  onAdd?: (label: string, description?: string) => void
  onEdit?: (value: string, newLabel: string, newDescription?: string) => void
  onDelete?: (value: string) => void
  placeholder?: string
  manageable?: boolean
}) {
  return (
    <SmartSelect
      options={options}
      value={value}
      onChange={(v) => onChange?.(v as string)}
      placeholder={placeholder}
      searchable
      manageable={manageable}
      onAdd={onAdd}
      onEdit={onEdit}
      onDelete={onDelete}
      size="sm"
    />
  )
}

// ── 19. Multi Select (멀티 선택 + 체크박스 + 추가) ──
export function CellMultiSelect({
  value,
  options,
  onChange,
  onAdd,
  onEdit,
  onDelete,
  placeholder = '선택...',
  manageable,
}: {
  value: string[]
  options: SelectOption[]
  onChange?: (values: string[]) => void
  onAdd?: (label: string, description?: string) => void
  onEdit?: (value: string, newLabel: string, newDescription?: string) => void
  onDelete?: (value: string) => void
  placeholder?: string
  manageable?: boolean
}) {
  return (
    <SmartSelect
      options={options}
      value={value}
      onChange={(v) => onChange?.(v as string[])}
      placeholder={placeholder}
      searchable
      multiple
      manageable={manageable}
      onAdd={onAdd}
      onEdit={onEdit}
      onDelete={onDelete}
      size="sm"
    />
  )
}

// ── 20. Sorted Tags (자동 정렬 + 편집 가능 태그) ──

// 색상 이름 → 밝기 변환용 맵
const COLOR_NAME_MAP: Record<string, string> = {
  white: '#ffffff', ivory: '#fffff0', cream: '#fffdd0', beige: '#f5f5dc',
  yellow: '#ffff00', gold: '#ffd700', orange: '#ffa500', coral: '#ff7f50',
  salmon: '#fa8072', pink: '#ffc0cb', rose: '#ff007f', red: '#ff0000',
  crimson: '#dc143c', burgundy: '#800020', maroon: '#800000',
  lavender: '#e6e6fa', lilac: '#c8a2c8', purple: '#800080', violet: '#7f00ff',
  indigo: '#4b0082', skyblue: '#87ceeb', blue: '#0000ff', navy: '#000080',
  teal: '#008080', mint: '#98ff98', green: '#008000', olive: '#808000',
  khaki: '#f0e68c', brown: '#8b4513', tan: '#d2b48c', charcoal: '#36454f',
  gray: '#808080', grey: '#808080', silver: '#c0c0c0', black: '#000000',
}

function hexToLightness(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL']

function sortTags(
  tags: string[],
  mode: 'color' | 'size' | 'preset',
  colorMap?: Record<string, { bg: string; text: string }>,
  preset?: string[],
): string[] {
  if (mode === 'preset' && preset) {
    return [...tags].sort((a, b) => {
      const ia = preset.indexOf(a)
      const ib = preset.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
  }
  if (mode === 'size') {
    return [...tags].sort((a, b) => {
      const ia = SIZE_ORDER.indexOf(a.toUpperCase())
      const ib = SIZE_ORDER.indexOf(b.toUpperCase())
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
  }
  // color mode — sort by lightness (bright → dark)
  return [...tags].sort((a, b) => {
    const hexA = colorMap?.[a]?.bg ?? COLOR_NAME_MAP[a.toLowerCase()] ?? '#808080'
    const hexB = colorMap?.[b]?.bg ?? COLOR_NAME_MAP[b.toLowerCase()] ?? '#808080'
    return hexToLightness(hexB) - hexToLightness(hexA)
  })
}

export function CellSortedTags({
  value,
  onChange,
  colorMap,
  sortMode = 'color',
  sortPreset,
  placeholder = '추가...',
}: {
  value: string[]
  onChange?: (tags: string[]) => void
  colorMap?: Record<string, { bg: string; text: string }>
  sortMode?: 'color' | 'size' | 'preset'
  sortPreset?: string[]
  placeholder?: string
}) {
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const tags = sortTags(Array.isArray(value) ? value : [], sortMode, colorMap, sortPreset)

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus()
  }, [adding])

  const handleAdd = () => {
    const v = input.trim()
    if (v && !tags.includes(v)) {
      onChange?.([...tags, v])
    }
    setInput('')
    setAdding(false)
  }

  const handleRemove = (tag: string) => {
    onChange?.(tags.filter((t) => t !== tag))
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => {
        const cm = colorMap?.[tag]
        return (
          <span
            key={tag}
            className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={cm ? { background: cm.bg, color: cm.text } : { background: '#f1f5f9', color: '#64748b' }}
          >
            {tag}
            {onChange && (
              <X
                className="h-3 w-3 cursor-pointer opacity-50 hover:opacity-100"
                onClick={() => handleRemove(tag)}
              />
            )}
          </span>
        )
      })}
      {onChange && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-muted-foreground/60 transition-colors"
        >
          <Plus className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
      {adding && (
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setInput('') } }}
          onBlur={handleAdd}
          placeholder={placeholder}
          className="w-16 text-[11px] border-b border-muted-foreground/30 bg-transparent focus:outline-none focus:border-primary px-0.5 py-0"
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════
 *  칼럼 타입 요약 (design-preview 참조용)
 *
 *  | 타입명 | 컴포넌트 | 용도 |
 *  |--------|---------|------|
 *  | code | CellCode | 모노스페이스 코드 (PG코드, SKU) |
 *  | currency | CellCurrency | 통화 (₩, $, ¥) — 음수 빨간색 |
 *  | number | CellNumber | 숫자 + 단위 |
 *  | percent | CellPercent | 퍼센트 — 양수 초록, 음수 빨강 |
 *  | date | CellDate | 날짜 + 캘린더 아이콘 |
 *  | status | CellStatus | StatusBadge 연동 |
 *  | custom-status | CellCustomStatus | 커스텀 색상 상태 뱃지 |
 *  | boolean-flags | CellBooleanFlags | 다중 불리언 (시즌 점) |
 *  | brand-dot | CellBrandDot | 브랜드 색상 점 + 텍스트 |
 *  | image | CellImage | 썸네일 이미지 |
 *  | link | CellLink | URL 링크 |
 *  | tags | CellTags | 다중 태그 (컬러 매핑) |
 *  | currency-auto | CellCurrencyAuto | 자동계산 통화 |
 *  | inherited | CellInherited | 상속값 ("PG 기본값") |
 *  | toggle | CellToggle | 토글 스위치 |
 *  |--------|---------|------|
 *  | 인터랙티브 (render 함수로 사용) |
 *  | editable-tags | CellEditableTags | 태그 추가/삭제 |
 *  | search-select | CellSearchSelect | 검색 단일선택 + 부가설명 |
 *  | multi-select | CellMultiSelect | 멀티선택 체크박스 + 추가 |
 *  | sorted-tags | CellSortedTags | 자동정렬 태그 (색상/사이즈/프리셋) |
 * ═══════════════════════════════════════════════════ */
