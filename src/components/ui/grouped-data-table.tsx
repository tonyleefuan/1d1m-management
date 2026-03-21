'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './card'
import { Input } from './input'
import { Badge } from './badge'
import { Button } from './button'
import {
  ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  Search, Plus, Check, X, Pencil, Calendar, Layers, Lock, Unlock,
} from 'lucide-react'
import { renderCellByType, type CellDisplayType, type CellTypeConfig } from './column-types'

/* ── GroupedDataTable ────────────────────────────────
 *  다단 그룹핑 + 인라인 편집 데이터 테이블
 *
 *  기능:
 *    - 1단/2단 그룹핑 (접기/펼치기)
 *    - 그룹핑 기준 칼럼 UI 선택
 *    - 그룹 정렬 (오름/내림)
 *    - 그룹별 소계 + 전체 합계
 *    - 인라인 셀 편집 (text, number, select, multi-select, date)
 *    - 정렬, 검색
 * ──────────────────────────────────────────────────── */

// ── 타입 ──

type ColumnType = 'text' | 'number' | 'select' | 'multi-select' | 'date' | 'custom'

interface SelectOption {
  value: string
  label: string
  color?: string
}

export interface GroupedColumn<T = any> {
  key: string
  label: string
  type?: ColumnType
  editable?: boolean
  sortable?: boolean
  /** 그룹핑 기준으로 사용 가능한 칼럼인지 */
  groupable?: boolean
  align?: 'left' | 'center' | 'right'
  width?: string
  /** 줄바꿈 허용 (태그 등 여러 줄 필요한 칼럼) */
  wrap?: boolean
  options?: SelectOption[]
  /** multi-select 선택 시 이 순서대로 자동 정렬 (프리셋에 없는 항목은 맨 뒤) */
  sortPreset?: string[]
  /** 칼럼 표시 타입 — column-types 레지스트리에서 자동 렌더링 */
  cellType?: CellDisplayType
  /** cellType에 필요한 추가 설정 */
  cellConfig?: CellTypeConfig
  /** render(value, row, isEditing) — isEditing: 편집 잠금이 풀린 상태인지 */
  render?: (value: any, row: T, isEditing: boolean) => React.ReactNode
  summaryFn?: 'sum' | 'avg' | 'count' | 'min' | 'max' | ((rows: T[]) => string | number)
  summaryLabel?: string
}

interface GroupSummaryConfig {
  label: string
  fn: (rows: any[]) => string | number
}

interface QuickFilter {
  label: string
  active?: boolean
  count?: number
  onClick: () => void
}

interface GroupedDataTableProps<T = any> {
  title?: string
  description?: string
  columns: GroupedColumn<T>[]
  data: T[]
  rowKey: string
  /** 기본 그룹핑 기준 — string 1단, string[] 다단 */
  groupBy: string | string[]
  groupLabels?: Record<string, string>
  groupSummaries?: GroupSummaryConfig[]
  searchPlaceholder?: string
  searchKeys?: string[]
  showSummary?: boolean
  /** 빠른 필터 탭 (FilterBar 스타일) */
  quickFilters?: QuickFilter[]
  /** 인라인 편집 콜백 */
  onRowEdit?: (rowKey: string, field: string, value: any) => void
  onAddRow?: (groupValues: Record<string, string>) => void
  onRowClick?: (row: any) => void
  /** 페이지 사이즈 옵션 (기본: [20, 50, 100]) */
  pageSizeOptions?: number[]
  /** 초기 페이지 사이즈 */
  defaultPageSize?: number
  action?: React.ReactNode
  /** false면 편집 잠금 버튼 숨김 (읽기 전용) */
  editable?: boolean
  /** true면 내부 툴바(검색, 그룹 선택 등) 숨김 — 외부 FilterBar 사용 시 */
  hideToolbar?: boolean
  /** 외부에서 검색어 제어 (FilterBar 연동) — hideToolbar와 함께 사용 */
  externalSearch?: string
  /** 외부 검색어 변경 콜백 */
  onExternalSearchChange?: (value: string) => void
  className?: string
}

// ── 그룹 트리 ──
interface GroupNode<T> {
  key: string
  label: string
  fieldKey: string
  value: string
  rows: T[]
  children: GroupNode<T>[]
}

// ── 자동 컬러 팔레트 ──
const AUTO_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
  '#84cc16', '#e11d48', '#0ea5e9', '#a855f7', '#d946ef',
  '#64748b',
]
function getAutoColor(existingOptions: SelectOption[]): string {
  const usedColors = new Set(existingOptions.map((o) => o.color).filter(Boolean))
  return AUTO_COLORS.find((c) => !usedColors.has(c)) ?? AUTO_COLORS[existingOptions.length % AUTO_COLORS.length]
}

// ── 싱글셀렉트 드롭다운 (추가/삭제/순서편집) ──
function SelectDropdown({
  value, options: initialOptions, onChange, onClose,
}: {
  value: string; options: SelectOption[]; onChange: (v: string) => void; onClose: () => void
}) {
  const [localOptions, setLocalOptions] = React.useState(initialOptions)
  const [editMode, setEditMode] = React.useState(false)
  const [newItem, setNewItem] = React.useState('')

  const addNew = () => {
    const t = newItem.trim()
    if (!t) return
    const color = getAutoColor(localOptions)
    setLocalOptions((prev) => [...prev, { value: t, label: t, color }])
    onChange(t)
    setNewItem('')
  }

  const removeOption = (val: string) => {
    setLocalOptions((prev) => prev.filter((o) => o.value !== val))
  }

  const moveOption = (idx: number, dir: -1 | 1) => {
    const next = idx + dir
    if (next < 0 || next >= localOptions.length) return
    const updated = [...localOptions]
    ;[updated[idx], updated[next]] = [updated[next], updated[idx]]
    setLocalOptions(updated)
  }

  return (
    <div className="absolute z-50 mt-1 w-56 rounded-md border bg-popover shadow-lg">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Input placeholder="새 항목 추가..." value={newItem} onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew() } }} className="h-7 text-xs" />
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={addNew} disabled={!newItem.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="max-h-52 overflow-auto py-1">
        {localOptions.map((opt, i) => (
          <div key={opt.value} className={cn('flex w-full items-center gap-1.5 px-2 py-1.5 text-sm hover:bg-muted', value === opt.value && 'bg-muted font-medium')}>
            {editMode && (
              <div className="flex flex-col">
                <button onClick={() => moveOption(i, -1)} className="text-muted-foreground hover:text-foreground"><ArrowUp className="h-3 w-3" /></button>
                <button onClick={() => moveOption(i, 1)} className="text-muted-foreground hover:text-foreground"><ArrowDown className="h-3 w-3" /></button>
              </div>
            )}
            <button className="flex flex-1 items-center gap-2" onClick={() => { onChange(opt.value); onClose() }}>
              {opt.color && <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />}
              {opt.label}
              {value === opt.value && <Check className="ml-auto h-3 w-3" />}
            </button>
            {editMode && (
              <button onClick={() => removeOption(opt.value)} className="ml-auto text-muted-foreground hover:text-red-500"><X className="h-3 w-3" /></button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t px-3 py-1.5">
        <button onClick={() => setEditMode(!editMode)} className={cn('text-xs', editMode ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground')}>
          {editMode ? '편집 완료' : '목록 편집'}
        </button>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">닫기</button>
      </div>
    </div>
  )
}

// ── 멀티셀렉트 드롭다운 (추가/삭제/순서편집) ──
function MultiSelectDropdown({
  values, options: initialOptions, onChange, onClose,
}: {
  values: string[]; options: SelectOption[]; onChange: (v: string[]) => void; onClose: () => void
}) {
  const [localOptions, setLocalOptions] = React.useState(initialOptions)
  const [editMode, setEditMode] = React.useState(false)
  const [newItem, setNewItem] = React.useState('')

  const toggle = (val: string) => {
    const next = values.includes(val) ? values.filter((x) => x !== val) : [...values, val]
    onChange(next)
  }

  const addNew = () => {
    const t = newItem.trim()
    if (!t) return
    const color = getAutoColor(localOptions)
    setLocalOptions((prev) => [...prev, { value: t, label: t, color }])
    onChange([...values, t])
    setNewItem('')
  }

  const removeOption = (val: string) => {
    setLocalOptions((prev) => prev.filter((o) => o.value !== val))
    onChange(values.filter((v) => v !== val))
  }

  const moveOption = (idx: number, dir: -1 | 1) => {
    const next = idx + dir
    if (next < 0 || next >= localOptions.length) return
    const updated = [...localOptions]
    ;[updated[idx], updated[next]] = [updated[next], updated[idx]]
    setLocalOptions(updated)
  }

  return (
    <div className="absolute z-50 mt-1 w-56 rounded-md border bg-popover shadow-lg">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Input placeholder="새 항목 추가..." value={newItem} onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew() } }} className="h-7 text-xs" />
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={addNew} disabled={!newItem.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="max-h-52 overflow-auto py-1">
        {localOptions.map((opt, i) => (
          <div key={opt.value} className={cn('flex w-full items-center gap-1.5 px-2 py-1.5 text-sm hover:bg-muted')}>
            {editMode && (
              <div className="flex flex-col">
                <button onClick={() => moveOption(i, -1)} className="text-muted-foreground hover:text-foreground"><ArrowUp className="h-3 w-3" /></button>
                <button onClick={() => moveOption(i, 1)} className="text-muted-foreground hover:text-foreground"><ArrowDown className="h-3 w-3" /></button>
              </div>
            )}
            <button className="flex flex-1 items-center gap-2" onClick={() => toggle(opt.value)}>
              <span className={cn('flex h-4 w-4 items-center justify-center rounded border', values.includes(opt.value) && 'border-primary bg-primary text-primary-foreground')}>
                {values.includes(opt.value) && <Check className="h-3 w-3" />}
              </span>
              {opt.color && <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />}
              {opt.label}
            </button>
            {editMode && (
              <button onClick={() => removeOption(opt.value)} className="ml-auto text-muted-foreground hover:text-red-500"><X className="h-3 w-3" /></button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t px-3 py-1.5">
        <button onClick={() => setEditMode(!editMode)} className={cn('text-xs', editMode ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground')}>
          {editMode ? '편집 완료' : '목록 편집'}
        </button>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">닫기</button>
      </div>
    </div>
  )
}

function buildGroupTree<T extends Record<string, any>>(
  data: T[],
  groupFields: string[],
  groupLabels: Record<string, string>,
  groupSortDirs: Record<string, 'asc' | 'desc'>,
  /** 헤더 칼럼 정렬 — 그룹 내부 행만 정렬 */
  inGroupSort?: { key: string; dir: 'asc' | 'desc' },
  depth = 0,
): GroupNode<T>[] {
  if (depth >= groupFields.length) return []
  const field = groupFields[depth]
  const map = new Map<string, T[]>()

  data.forEach((row) => {
    const val = String(row[field] ?? '미분류')
    if (!map.has(val)) map.set(val, [])
    map.get(val)!.push(row)
  })

  let entries = Array.from(map.entries())

  // 그룹 정렬
  const dir = groupSortDirs[field]
  if (dir) {
    entries.sort(([a], [b]) => {
      const cmp = a.localeCompare(b)
      return dir === 'asc' ? cmp : -cmp
    })
  }

  return entries.map(([val, rows]) => {
    // leaf 그룹이면 내부 행 정렬 적용
    const isLeaf = depth + 1 >= groupFields.length
    const sortedRows = isLeaf && inGroupSort
      ? [...rows].sort((a, b) => {
          const av = a[inGroupSort.key]
          const bv = b[inGroupSort.key]
          if (av == null) return 1
          if (bv == null) return -1
          const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
          return inGroupSort.dir === 'asc' ? cmp : -cmp
        })
      : rows

    return {
      key: `${field}:${val}`,
      label: groupLabels[field] ?? field,
      fieldKey: field,
      value: val,
      rows: sortedRows,
      children: buildGroupTree(rows, groupFields, groupLabels, groupSortDirs, inGroupSort, depth + 1),
    }
  })
}

function computeSummary<T extends Record<string, any>>(
  rows: T[],
  col: GroupedColumn<T>,
): string | number | null {
  if (!col.summaryFn) return null
  if (typeof col.summaryFn === 'function') return col.summaryFn(rows)
  const vals = rows.map((r) => Number(r[col.key])).filter((v) => !isNaN(v))
  switch (col.summaryFn) {
    case 'sum': return vals.reduce((a, b) => a + b, 0)
    case 'avg': return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
    case 'count': return rows.length
    case 'min': return Math.min(...vals)
    case 'max': return Math.max(...vals)
  }
}

// ── 메인 컴포넌트 ──
export function GroupedDataTable<T extends Record<string, any>>({
  title,
  description,
  columns,
  data,
  rowKey,
  groupBy: defaultGroupBy,
  groupLabels = {},
  groupSummaries,
  searchPlaceholder = '검색...',
  searchKeys = [],
  showSummary = false,
  quickFilters,
  onRowEdit,
  onAddRow,
  onRowClick,
  pageSizeOptions = [20, 50, 100],
  defaultPageSize,
  action,
  editable,
  hideToolbar,
  externalSearch,
  onExternalSearchChange,
  className,
}: GroupedDataTableProps<T>) {
  // 그룹핑 기준 — 동적 변경 가능
  const [activeGroupBy, setActiveGroupBy] = useState<string[]>(
    Array.isArray(defaultGroupBy) ? defaultGroupBy : [defaultGroupBy],
  )
  const [groupSortDirs, setGroupSortDirs] = useState<Record<string, 'asc' | 'desc'>>({})
  const [showGroupPicker, setShowGroupPicker] = useState(false)

  // 상태
  const [internalSearch, setInternalSearch] = useState('')
  const search = externalSearch !== undefined ? externalSearch : internalSearch
  const setSearch = onExternalSearchChange ?? setInternalSearch
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // 페이지네이션
  const [pageSize, setPageSize] = useState(defaultPageSize ?? pageSizeOptions[0] ?? 20)
  const [currentPage, setCurrentPage] = useState(1)

  // 편집 잠금
  const [locked, setLocked] = useState(true)

  // 인라인 편집
  const [editingCell, setEditingCell] = useState<{ row: string; col: string } | null>(null)
  const [editValue, setEditValue] = useState<any>(null)
  const [openSelect, setOpenSelect] = useState<{ row: string; col: string } | null>(null)

  // 그룹핑 가능 칼럼 목록
  const groupableColumns = columns.filter((c) => c.groupable)

  // 검색
  const searched = useMemo(() => {
    if (!search) return data
    const q = search.toLowerCase()
    const keys = searchKeys.length > 0 ? searchKeys : columns.map((c) => c.key)
    return data.filter((row) =>
      keys.some((k) => String(row[k] ?? '').toLowerCase().includes(q)),
    )
  }, [data, search, searchKeys, columns])

  // 페이지네이션 적용 (정렬은 그룹 내부에서 처리)
  const totalPages = Math.ceil(searched.length / pageSize)
  const paged = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return searched.slice(start, start + pageSize)
  }, [searched, currentPage, pageSize])

  // 페이지 사이즈 변경 시 첫 페이지로
  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }, [])

  // 그룹 트리 (헤더 정렬은 그룹 내부에서만 적용)
  const inGroupSort = sortKey ? { key: sortKey, dir: sortDir } : undefined
  const groupTree = useMemo(
    () => buildGroupTree(paged, activeGroupBy, groupLabels, groupSortDirs, inGroupSort),
    [paged, activeGroupBy, groupLabels, groupSortDirs, inGroupSort],
  )

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const toggleGroupSort = (field: string) => {
    setGroupSortDirs((prev) => {
      const cur = prev[field]
      if (!cur) return { ...prev, [field]: 'asc' }
      if (cur === 'asc') return { ...prev, [field]: 'desc' }
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  // 인라인 편집
  const startEdit = (rowId: string, colKey: string, currentValue: any) => {
    setEditingCell({ row: rowId, col: colKey })
    setEditValue(currentValue)
  }
  const saveEdit = () => {
    if (editingCell && onRowEdit) onRowEdit(editingCell.row, editingCell.col, editValue)
    setEditingCell(null); setEditValue(null)
  }
  const cancelEdit = () => { setEditingCell(null); setEditValue(null) }

  // 셀 렌더링 — locked이면 편집 비활성화
  const renderCell = (row: T, col: GroupedColumn<T>) => {
    const rowId = String(row[rowKey])
    const canEdit = col.editable && !locked
    const isEditing = editingCell?.row === rowId && editingCell?.col === col.key && canEdit
    const isSelectOpen = openSelect?.row === rowId && openSelect?.col === col.key && canEdit
    const value = row[col.key]

    // render + editable: 편집 모드 우선
    if (col.render && !(isEditing && canEdit)) {
      if (canEdit && (col.type === 'text' || col.type === 'number')) {
        return (
          <button
            className={cn('group inline-flex items-center gap-1 hover:text-primary', col.align === 'right' || col.align === 'center' ? 'justify-center w-full' : 'text-left')}
            onClick={() => startEdit(rowId, col.key, value)}
          >
            <span>{col.render(value, row, !locked)}</span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
          </button>
        )
      }
      return col.render(value, row, !locked)
    }

    // 편집 모드 — text / number
    if (isEditing && canEdit && (col.type === 'text' || col.type === 'number')) {
      const strVal = String(editValue ?? '')
      const inputWidth = col.type === 'number' ? '80px' : `${Math.max(6, strVal.length + 2)}ch`
      return (
        <div className="flex items-center gap-1">
          <input
            type={col.type}
            value={editValue ?? ''}
            onChange={(e) => setEditValue(col.type === 'number' ? Number(e.target.value) : e.target.value)}
            className="h-7 rounded-md border border-input bg-transparent px-2 text-sm outline-none ring-1 ring-ring"
            style={{ width: inputWidth, minWidth: '60px' }}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
          />
          <button onClick={saveEdit} className="text-emerald-600"><Check className="h-3.5 w-3.5" /></button>
          <button onClick={cancelEdit} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      )
    }

    // select — 추가/삭제/순서편집 가능
    if (col.type === 'select' && col.options) {
      const opt = col.options.find((o) => o.value === value)
      return (
        <div className="relative">
          <button
            className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors', canEdit ? 'cursor-pointer' : 'cursor-default')}
            style={opt?.color ? { background: opt.color + '18', color: opt.color } : { background: '#f1f5f9', color: '#64748b' }}
            onClick={() => canEdit && setOpenSelect(isSelectOpen ? null : { row: rowId, col: col.key })}
          >
            {opt?.label ?? value ?? '-'}
          </button>
          {isSelectOpen && canEdit && col.options && (
            <SelectDropdown
              value={String(value ?? '')}
              options={col.options}
              onChange={(v) => { onRowEdit?.(rowId, col.key, v); setOpenSelect(null) }}
              onClose={() => setOpenSelect(null)}
            />
          )}
        </div>
      )
    }

    // multi-select — 추가/삭제/순서편집 가능
    if (col.type === 'multi-select' && col.options) {
      const rawVals: string[] = Array.isArray(value) ? value : []
      // sortPreset이 있으면 표시 순서도 프리셋 순으로 정렬
      const vals = col.sortPreset
        ? [...rawVals].sort((a, b) => {
            const ia = col.sortPreset!.indexOf(a)
            const ib = col.sortPreset!.indexOf(b)
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
          })
        : rawVals
      return (
        <div className="relative">
          <button
            className={cn('flex flex-wrap items-center gap-1', canEdit ? 'cursor-pointer' : 'cursor-default')}
            onClick={() => canEdit && setOpenSelect(isSelectOpen ? null : { row: rowId, col: col.key })}
          >
            {vals.length === 0 && <span className="text-xs text-muted-foreground">-</span>}
            {vals.map((v) => {
              const o = col.options?.find((x) => x.value === v)
              return <span key={v} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={o?.color ? { background: o.color + '18', color: o.color } : { background: '#f1f5f9', color: '#334155' }}>{o?.label ?? v}</span>
            })}
            {canEdit && <Pencil className="ml-1 h-3 w-3 text-muted-foreground opacity-50" />}
          </button>
          {isSelectOpen && canEdit && col.options && (
            <MultiSelectDropdown
              values={vals}
              options={col.options}
              onChange={(next) => {
                const sorted = col.sortPreset
                  ? [...next].sort((a, b) => {
                      const ia = col.sortPreset!.indexOf(a)
                      const ib = col.sortPreset!.indexOf(b)
                      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
                    })
                  : next
                onRowEdit?.(rowId, col.key, sorted)
              }}
              onClose={() => setOpenSelect(null)}
            />
          )}
        </div>
      )
    }

    // date — 단일 텍스트 인풋 (YYYY, YYYY-MM, YYYY-MM-DD 모두 허용)
    if (col.type === 'date') {
      const dateStr = value ? String(value) : ''
      if (isEditing && canEdit) {
        return (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={editValue ?? ''}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="YYYY-MM-DD"
              className="h-7 w-28 rounded-md border border-input bg-transparent px-2 text-sm outline-none ring-1 ring-ring"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
            />
            <button onClick={saveEdit} className="text-emerald-600"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={cancelEdit} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
        )
      }
      if (canEdit) {
        return (
          <button className="group flex items-center gap-1.5 text-sm hover:text-primary" onClick={() => startEdit(rowId, col.key, dateStr)}>
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" /><span>{dateStr || '-'}</span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
          </button>
        )
      }
      return <span className="flex items-center gap-1.5 text-sm"><Calendar className="h-3.5 w-3.5 text-muted-foreground" />{dateStr || '-'}</span>
    }

    // 기본 editable
    if (canEdit) {
      return (
        <button
          className={cn('group inline-flex items-center gap-1 hover:text-primary', col.align === 'right' || col.align === 'center' ? 'justify-center w-full' : 'text-left')}
          onClick={() => startEdit(rowId, col.key, value)}
        >
          <span>{value ?? '-'}</span>
          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </button>
      )
    }

    // cellType 자동 렌더링 (column-types 레지스트리)
    if (col.cellType) {
      return renderCellByType(col.cellType, value, row, col.cellConfig)
    }

    return <span>{value ?? '-'}</span>
  }

  // 그룹 노드 재귀 렌더 — parentValues: 상위 그룹의 필드:값 누적
  const renderGroupNode = (node: GroupNode<T>, depth: number, parentValues: Record<string, string> = {}): React.ReactNode => {
    const isCollapsed = collapsed.has(node.key)
    const hasChildren = node.children.length > 0
    const indent = depth * 24
    // 현재 노드 포함한 모든 그룹 값 누적
    const currentValues = { ...parentValues, [node.fieldKey]: node.value }

    return (
      <React.Fragment key={node.key}>
        <tr
          className={cn('border-b cursor-pointer transition-colors', depth === 0 ? 'bg-muted/40 hover:bg-muted/60' : 'bg-muted/20 hover:bg-muted/40')}
          onClick={() => toggleCollapse(node.key)}
        >
          <td colSpan={columns.length} className="px-3 py-2.5">
            <div className="flex items-center gap-3" style={{ paddingLeft: indent }}>
              {isCollapsed ? <ChevronRight className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{node.label}</span>
              <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', depth === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground')}>
                {node.value}
              </span>
              <Badge variant="secondary" className="text-[10px]">{node.rows.length}</Badge>
              <div className="flex items-center gap-3 ml-auto">
                {groupSummaries?.map((gs, i) => (
                  <span key={i} className="text-xs text-muted-foreground">{gs.label} {gs.fn(node.rows)}</span>
                ))}
              </div>
            </div>
          </td>
        </tr>

        {!isCollapsed && (
          <>
            {hasChildren
              ? node.children.map((child) => renderGroupNode(child, depth + 1, currentValues))
              : node.rows.map((row) => {
                  const id = String(row[rowKey])
                  return (
                    <tr
                      key={id}
                      className={cn('border-b transition-colors hover:bg-muted/30', onRowClick && locked && 'cursor-pointer')}
                      onClick={() => { if (locked) onRowClick?.(row) }}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={cn('pl-3 pr-6 py-2 text-sm', !col.wrap && 'whitespace-nowrap', col.align === 'center' && 'text-center', col.align === 'right' && 'text-right')}
                          style={col.width ? { maxWidth: col.width } : undefined}
                        >
                          {renderCell(row, col)}
                        </td>
                      ))}
                    </tr>
                  )
                })
            }
            {!hasChildren && onAddRow && !locked && (
              <tr className="border-b">
                <td colSpan={columns.length} className="px-3 py-1.5">
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    style={{ paddingLeft: `${activeGroupBy.length * 24 + 12}px` }}
                    onClick={(e) => { e.stopPropagation(); onAddRow(currentValues) }}
                  >
                    <Plus className="h-3 w-3" /> 추가
                  </button>
                </td>
              </tr>
            )}
          </>
        )}
      </React.Fragment>
    )
  }

  return (
    <Card className={cn('', className)}>
      {(title || description || action) && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              {title && <CardTitle className="text-base">{title}</CardTitle>}
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            {action}
          </div>
        </CardHeader>
      )}

      <CardContent className="pt-4">
        {/* ── 툴바: FilterBar 스타일 ── */}
        {!hideToolbar && <div className="mb-4 flex items-center gap-3 flex-wrap">
          {/* 검색 (searchKeys가 비어있으면 숨김) */}
          {searchKeys.length > 0 && <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
              className="pl-9 w-[240px]"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setCurrentPage(1) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>}

          {/* 빠른 필터 */}
          {quickFilters && quickFilters.length > 0 && (
            <div className="flex gap-1">
              {quickFilters.map((f) => (
                <button
                  key={f.label}
                  onClick={f.onClick}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    f.active
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
          )}

          {/* 편집 잠금 토글 */}
          {editable !== false && (
            <button
              onClick={() => { setLocked(!locked); if (!locked) { setEditingCell(null); setOpenSelect(null) } }}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                locked
                  ? 'text-muted-foreground hover:bg-muted'
                  : 'bg-amber-50 text-amber-700 border border-amber-200',
              )}
            >
              {locked ? <Lock className="inline h-3.5 w-3.5 mr-1" /> : <Unlock className="inline h-3.5 w-3.5 mr-1" />}
              {locked ? '편집 잠금' : '편집 중'}
            </button>
          )}

          {/* 우측: 그룹핑 */}
          <div className="flex items-center gap-1.5 ml-auto">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">그룹:</span>
            {activeGroupBy.map((field, i) => (
              <React.Fragment key={field}>
                {i > 0 && <span className="text-xs text-muted-foreground">→</span>}
                <button
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-primary text-primary-foreground',
                  )}
                  onClick={() => toggleGroupSort(field)}
                >
                  {groupLabels[field] ?? columns.find((c) => c.key === field)?.label ?? field}
                  {groupSortDirs[field] === 'asc' && <ArrowUp className="inline h-3 w-3 ml-1" />}
                  {groupSortDirs[field] === 'desc' && <ArrowDown className="inline h-3 w-3 ml-1" />}
                  {!groupSortDirs[field] && <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-60" />}
                </button>
              </React.Fragment>
            ))}

            {/* 그룹핑 변경 */}
            {groupableColumns.length > 0 && (
              <div className="relative">
                <button
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
                  onClick={() => setShowGroupPicker(!showGroupPicker)}
                >
                  변경
                </button>
                {showGroupPicker && (
                  <div className="absolute right-0 z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg">
                    <div className="p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">그룹핑 기준 선택 (최대 2개)</p>
                      {groupableColumns.map((col) => {
                        const idx = activeGroupBy.indexOf(col.key)
                        const isActive = idx >= 0
                        return (
                          <button
                            key={col.key}
                            className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted', isActive && 'bg-muted')}
                            onClick={() => {
                              if (isActive) {
                                setActiveGroupBy((prev) => prev.filter((k) => k !== col.key))
                              } else if (activeGroupBy.length < 2) {
                                setActiveGroupBy((prev) => [...prev, col.key])
                              }
                            }}
                          >
                            <span className={cn('flex h-4 w-4 items-center justify-center rounded border text-[10px]', isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground')}>
                              {isActive ? idx + 1 : ''}
                            </span>
                            {col.label}
                          </button>
                        )
                      })}
                    </div>
                    <div className="border-t px-3 py-2">
                      <Button size="sm" className="w-full" onClick={() => setShowGroupPicker(false)}>확인</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>}

        {/* 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: `${Math.max(800, columns.length * 140)}px` }}>
            <thead>
              <tr className="border-b">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn('pl-3 pr-6 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap', col.align === 'center' && 'text-center', col.align === 'right' && 'text-right', col.sortable && 'cursor-pointer select-none hover:text-foreground')}
                    style={col.width ? { maxWidth: col.width } : undefined}
                    onClick={() => col.sortable && toggleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable && (sortKey === col.key ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupTree.length === 0 && (
                <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-muted-foreground">데이터가 없습니다</td></tr>
              )}
              {groupTree.map((node) => renderGroupNode(node, 0))}
            </tbody>

            {showSummary && (
              <tfoot>
                <tr className="border-t-2 bg-muted/30">
                  {columns.map((col, i) => {
                    const summary = computeSummary(searched, col)
                    return (
                      <td key={col.key} className={cn('pl-3 pr-6 py-2.5 text-sm whitespace-nowrap', col.align === 'center' && 'text-center', col.align === 'right' && 'text-right')}>
                        {i === 0 && !summary && <span className="text-xs font-semibold text-muted-foreground">전체 합계</span>}
                        {summary !== null && (
                          <span className="font-semibold">
                            <span className="mr-1 text-[10px] text-muted-foreground">{col.summaryLabel}</span>
                            {typeof summary === 'number' ? summary.toLocaleString() : summary}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* 하단: 페이지 사이즈 + 페이지네이션 */}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{searched.length}건 · {groupTree.length}개 그룹</span>
            <div className="flex items-center gap-1 border-l pl-3">
              {pageSizeOptions.map((size) => (
                <button
                  key={size}
                  onClick={() => handlePageSizeChange(size)}
                  className={cn(
                    'rounded px-2 py-0.5 transition-colors',
                    pageSize === size ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {size}개
                </button>
              ))}
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="sm" className="h-7 px-2 text-xs"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                이전
              </Button>
              <span className="px-2">{currentPage} / {totalPages}</span>
              <Button
                variant="outline" size="sm" className="h-7 px-2 text-xs"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                다음
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
