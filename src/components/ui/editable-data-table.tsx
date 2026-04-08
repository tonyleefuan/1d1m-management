'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './card'
import { Input } from './input'
import { Badge } from './badge'
import { Button } from './button'
import {
  ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  Search, Check, X, Pencil, MoreHorizontal, Plus, Calendar, Lock, Unlock,
} from 'lucide-react'
import { renderCellByType, type CellDisplayType, type CellTypeConfig } from './column-types'

/* ── EditableDataTable ──────────────────────────────
 *  고급 데이터 테이블 — 인라인 편집, 셀렉트, 그룹핑, 합계
 *
 *  기능:
 *    - 인라인 셀 편집 (text, number, select, multi-select)
 *    - 싱글/멀티 셀렉트 드롭다운
 *    - 그룹핑 (접기/펼치기)
 *    - 그룹 탭 선택
 *    - 합계 행
 *    - 정렬 (오름/내림)
 *    - 검색
 *    - 행 선택
 * ──────────────────────────────────────────────────── */

// ── 타입 정의 ──

type ColumnType = 'text' | 'number' | 'select' | 'multi-select' | 'badge' | 'date' | 'custom'

interface SelectOption {
  value: string
  label: string
  color?: string
}

export interface EditableColumn<T = any> {
  key: string
  label: string
  type?: ColumnType
  editable?: boolean
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  width?: string
  /** 줄바꿈 허용 (태그 등 여러 줄 필요한 칼럼) */
  wrap?: boolean
  options?: SelectOption[]
  /** 칼럼 표시 타입 — column-types 레지스트리에서 자동 렌더링 (편집 불가 표시용) */
  cellType?: CellDisplayType
  /** cellType에 필요한 추가 설정 */
  cellConfig?: CellTypeConfig
  render?: (value: any, row: T, isEditing: boolean) => React.ReactNode
  summaryFn?: 'sum' | 'avg' | 'count' | 'min' | 'max' | ((rows: T[]) => string | number)
  summaryLabel?: string
}

interface GroupTab {
  label: string
  value: string | null
  count?: number
}

interface QuickFilter {
  label: string
  active?: boolean
  count?: number
  onClick: () => void
}

interface EditableDataTableProps<T = any> {
  title?: string
  description?: string
  columns: EditableColumn<T>[]
  data: T[]
  rowKey: string
  /** 그룹핑 기준 필드 */
  groupBy?: string
  /** 그룹 탭 (상단 탭으로 그룹 전환) */
  groupTabs?: GroupTab[]
  /** 검색 */
  searchPlaceholder?: string
  searchKeys?: string[]
  /** 검색바 숨기기 (외부 FilterBar 사용 시) */
  hideSearch?: boolean
  /** 빠른 필터 탭 (FilterBar 스타일) */
  quickFilters?: QuickFilter[]
  /** 합계 행 표시 */
  showSummary?: boolean
  /** 행 편집 콜백 */
  onRowEdit?: (rowKey: string, field: string, value: any) => void
  /** 행 삭제 콜백 (선택된 행 삭제) */
  onRowDelete?: (rowKeys: string[]) => void
  /** 페이지 사이즈 옵션 (기본: [20, 50, 100]) */
  pageSizeOptions?: number[]
  /** 초기 페이지 사이즈 */
  defaultPageSize?: number
  /** 상단 액션 */
  action?: React.ReactNode
  onRowClick?: (row: any) => void
  className?: string
}

// ── 자동 컬러 팔레트 — 새 항목 추가 시 순서대로 배정 ──
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

// ── 싱글 셀렉트 드롭다운 (추가/삭제/순서변경) ──
function InlineSelect({
  value,
  options: initialOptions,
  onChange,
  onClose,
  onOptionsChange,
}: {
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  onClose: () => void
  onOptionsChange?: (options: SelectOption[]) => void
}) {
  const [newItem, setNewItem] = React.useState('')
  const [localOptions, setLocalOptions] = React.useState(initialOptions)
  const [editMode, setEditMode] = React.useState(false)

  const addNew = () => {
    const trimmed = newItem.trim()
    if (!trimmed) return
    const color = getAutoColor(localOptions)
    const updated = [...localOptions, { value: trimmed, label: trimmed, color }]
    setLocalOptions(updated)
    onOptionsChange?.(updated)
    onChange(trimmed)
    setNewItem('')
    onClose()
  }

  const removeOption = (val: string) => {
    const updated = localOptions.filter((o) => o.value !== val)
    setLocalOptions(updated)
    onOptionsChange?.(updated)
  }

  const moveOption = (idx: number, dir: -1 | 1) => {
    const next = idx + dir
    if (next < 0 || next >= localOptions.length) return
    const updated = [...localOptions]
    ;[updated[idx], updated[next]] = [updated[next], updated[idx]]
    setLocalOptions(updated)
    onOptionsChange?.(updated)
  }

  return (
    <div className="absolute z-50 mt-1 w-56 rounded-md border bg-popover shadow-lg">
      {/* 새 항목 입력 */}
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Input
          placeholder="새 항목 추가..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew() } }}
          className="h-7 text-xs"
        />
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={addNew} disabled={!newItem.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      <div className="max-h-52 overflow-auto py-1">
        {localOptions.map((opt, i) => (
          <div
            key={opt.value}
            className={cn(
              'flex w-full items-center gap-1.5 px-2 py-1.5 text-sm hover:bg-muted',
              value === opt.value && 'bg-muted font-medium',
            )}
          >
            {/* 순서 변경 (편집 모드) */}
            {editMode && (
              <div className="flex flex-col">
                <button onClick={() => moveOption(i, -1)} className="text-muted-foreground hover:text-foreground">
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button onClick={() => moveOption(i, 1)} className="text-muted-foreground hover:text-foreground">
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* 선택 버튼 */}
            <button
              className="flex flex-1 items-center gap-2"
              onClick={() => { onChange(opt.value); onClose() }}
            >
              {opt.color && <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />}
              {opt.label}
              {value === opt.value && <Check className="ml-auto h-3 w-3" />}
            </button>

            {/* 삭제 (편집 모드) */}
            {editMode && (
              <button
                onClick={() => removeOption(opt.value)}
                className="ml-auto text-muted-foreground hover:text-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 하단: 편집 모드 토글 */}
      <div className="flex items-center justify-between border-t px-3 py-1.5">
        <button
          onClick={() => setEditMode(!editMode)}
          className={cn('text-xs', editMode ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground')}
        >
          {editMode ? '편집 완료' : '목록 편집'}
        </button>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">닫기</button>
      </div>
    </div>
  )
}

// ── 멀티 셀렉트 드롭다운 (새 태그 추가 가능) ──
function InlineMultiSelect({
  value,
  options,
  onChange,
  onClose,
}: {
  value: string[]
  options: SelectOption[]
  onChange: (v: string[]) => void
  onClose: () => void
}) {
  const [newTag, setNewTag] = React.useState('')
  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }
  const addNew = () => {
    const trimmed = newTag.trim()
    if (!trimmed) return
    if (!value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setNewTag('')
  }
  return (
    <div className="absolute z-50 mt-1 w-56 rounded-md border bg-popover shadow-lg">
      {/* 새 태그 입력 */}
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Input
          placeholder="새 태그 입력..."
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew() } }}
          className="h-7 text-xs"
        />
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={addNew} disabled={!newTag.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="max-h-48 overflow-auto py-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
            onClick={() => toggle(opt.value)}
          >
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded border',
                value.includes(opt.value) && 'border-primary bg-primary text-primary-foreground',
              )}
            >
              {value.includes(opt.value) && <Check className="h-3 w-3" />}
            </span>
            {opt.label}
          </button>
        ))}
      </div>
      <div className="border-t px-3 py-2">
        <Button size="sm" className="w-full" onClick={onClose}>
          확인
        </Button>
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ──
export function EditableDataTable<T extends Record<string, any>>({
  title,
  description,
  columns,
  data,
  rowKey,
  groupBy,
  groupTabs,
  searchPlaceholder = '검색...',
  searchKeys = [],
  hideSearch = false,
  pageSizeOptions = [20, 50, 100],
  defaultPageSize = 20,
  showSummary = false,
  quickFilters,
  onRowEdit,
  onRowDelete,
  action,
  onRowClick,
  className,
}: EditableDataTableProps<T>) {
  // 상태
  const [locked, setLocked] = useState(true)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [activeGroup, setActiveGroup] = useState<string | null>(groupTabs?.[0]?.value ?? null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [editingCell, setEditingCell] = useState<{ row: string; col: string } | null>(null)
  const [editValue, setEditValue] = useState<any>(null)
  const [openSelect, setOpenSelect] = useState<{ row: string; col: string } | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

  // 검색 필터
  const searched = useMemo(() => {
    if (!search) return data
    const q = search.toLowerCase()
    const keys = searchKeys.length > 0 ? searchKeys : columns.map((c) => c.key)
    return data.filter((row) =>
      keys.some((k) => String(row[k] ?? '').toLowerCase().includes(q)),
    )
  }, [data, search, searchKeys, columns])

  // 그룹 탭 필터
  const grouped = useMemo(() => {
    if (!groupTabs || activeGroup === null) return searched
    if (activeGroup === '__all__') return searched
    return searched.filter((row) => String(row[groupBy ?? '']) === activeGroup)
  }, [searched, groupTabs, activeGroup, groupBy])

  // 정렬 — select 컬럼은 options 순서 기준
  const sorted = useMemo(() => {
    if (!sortKey) return grouped
    const col = columns.find((c) => c.key === sortKey)
    // select 컬럼이면 options 배열 순서로 정렬
    const optionOrder = (col?.type === 'select' && col.options)
      ? new Map(col.options.map((o, i) => [o.value, i]))
      : null
    return [...grouped].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null) return 1
      if (bv == null) return -1
      let cmp: number
      if (optionOrder) {
        cmp = (optionOrder.get(String(av)) ?? 999) - (optionOrder.get(String(bv)) ?? 999)
      } else if (typeof av === 'number') {
        cmp = av - bv
      } else {
        cmp = String(av).localeCompare(String(bv))
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [grouped, sortKey, sortDir, columns])

  // 페이지네이션
  const totalPages = Math.ceil(sorted.length / pageSize)
  const paged = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, currentPage, pageSize])

  // 페이지 사이즈 변경 시 첫 페이지로
  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }

  // 그룹핑 (그룹 탭 없이 groupBy만 있을 때)
  const groups = useMemo(() => {
    if (!groupBy || groupTabs) return null
    const map = new Map<string, T[]>()
    paged.forEach((row) => {
      const key = String(row[groupBy] ?? '미분류')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    })
    return map
  }, [paged, groupBy, groupTabs])

  // 정렬 토글
  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // 그룹 접기/펼치기
  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      next.has(group) ? next.delete(group) : next.add(group)
      return next
    })
  }

  // 셀 편집 시작
  const startEdit = (rowId: string, colKey: string, currentValue: any) => {
    setEditingCell({ row: rowId, col: colKey })
    setEditValue(currentValue)
  }

  // 셀 편집 저장
  const saveEdit = () => {
    if (editingCell && onRowEdit) {
      onRowEdit(editingCell.row, editingCell.col, editValue)
    }
    setEditingCell(null)
    setEditValue(null)
  }

  // 셀 편집 취소
  const cancelEdit = () => {
    setEditingCell(null)
    setEditValue(null)
  }

  // 합계 계산
  const computeSummary = useCallback(
    (col: EditableColumn<T>) => {
      if (!col.summaryFn) return null
      const rows = sorted
      if (typeof col.summaryFn === 'function') return col.summaryFn(rows)
      const vals = rows.map((r) => Number(r[col.key])).filter((v) => !isNaN(v))
      switch (col.summaryFn) {
        case 'sum':
          return vals.reduce((a, b) => a + b, 0)
        case 'avg':
          return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
        case 'count':
          return rows.length
        case 'min':
          return Math.min(...vals)
        case 'max':
          return Math.max(...vals)
      }
    },
    [sorted],
  )

  // 셀 렌더링 — locked이면 편집 비활성화
  const renderCell = (row: T, col: EditableColumn<T>) => {
    const rowId = String(row[rowKey])
    const canEdit = col.editable && !locked
    const isEditing = editingCell?.row === rowId && editingCell?.col === col.key && canEdit
    const isSelectOpen = openSelect?.row === rowId && openSelect?.col === col.key && canEdit
    const value = row[col.key]

    // 커스텀 렌더 — editable이면 편집 모드 우선, 비편집시 클릭으로 편집 시작
    if (col.render && !(isEditing && canEdit)) {
      const rendered = col.render(value, row, !!isEditing)
      if (canEdit && (col.type === 'text' || col.type === 'number')) {
        return (
          <button
            className={cn(
              'group inline-flex items-center gap-1 hover:text-primary',
              col.align === 'right' ? 'justify-end w-full' : 'text-left',
            )}
            onClick={() => startEdit(rowId, col.key, value)}
          >
            <span>{rendered}</span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
          </button>
        )
      }
      return rendered
    }

    // 편집 모드
    if (isEditing && canEdit) {
      if (col.type === 'text' || col.type === 'number') {
        const strVal = String(editValue ?? '')
        // 글자 수에 맞게 너비 조절 (최소 60px, ch 단위)
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') cancelEdit()
              }}
            />
            <button onClick={saveEdit} className="text-emerald-600 hover:text-emerald-700">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      }
    }

    // 셀렉트 타입 — 연한 배경 필 뱃지 스타일
    if (col.type === 'select' && col.options) {
      const opt = col.options.find((o) => o.value === value)
      return (
        <div className="relative">
          <button
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              canEdit ? 'cursor-pointer' : 'cursor-default',
            )}
            onClick={() => canEdit && setOpenSelect(isSelectOpen ? null : { row: rowId, col: col.key })}
            style={opt?.color ? { background: opt.color + '18', color: opt.color } : { background: '#f1f5f9', color: '#64748b' }}
          >
            {opt?.label ?? value ?? '-'}
          </button>
          {isSelectOpen && canEdit && (
            <InlineSelect
              value={String(value ?? '')}
              options={col.options}
              onChange={(v) => onRowEdit?.(rowId, col.key, v)}
              onClose={() => setOpenSelect(null)}
            />
          )}
        </div>
      )
    }

    // 멀티 셀렉트 타입 — 연한 배경 필 뱃지 스타일
    if (col.type === 'multi-select' && col.options) {
      const vals: string[] = Array.isArray(value) ? value : []
      return (
        <div className="relative">
          <button
            className={cn(
              'flex flex-wrap items-center gap-1',
              canEdit ? 'cursor-pointer' : 'cursor-default',
            )}
            onClick={() => canEdit && setOpenSelect(isSelectOpen ? null : { row: rowId, col: col.key })}
          >
            {vals.length === 0 && <span className="text-xs text-muted-foreground">-</span>}
            {vals.map((v) => {
              const o = col.options?.find((x) => x.value === v)
              return (
                <span
                  key={v}
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{ background: '#f1f5f9', color: '#334155' }}
                >
                  {o?.label ?? v}
                </span>
              )
            })}
            {canEdit && <Pencil className="ml-1 h-3 w-3 text-muted-foreground opacity-50" />}
          </button>
          {isSelectOpen && canEdit && (
            <InlineMultiSelect
              value={vals}
              options={col.options}
              onChange={(v) => onRowEdit?.(rowId, col.key, v)}
              onClose={() => setOpenSelect(null)}
            />
          )}
        </div>
      )
    }

    // 날짜 타입 — 단일 텍스트 인풋 (YYYY, YYYY-MM, YYYY-MM-DD)
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
      // 표시: 날짜 + 캘린더 아이콘
      if (canEdit) {
        return (
          <button
            className="group flex items-center gap-1.5 text-left text-sm hover:text-primary"
            onClick={() => startEdit(rowId, col.key, dateStr)}
          >
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{dateStr || '-'}</span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
          </button>
        )
      }
      return (
        <span className="flex items-center gap-1.5 text-sm">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          {dateStr || '-'}
        </span>
      )
    }

    // 뱃지 타입
    if (col.type === 'badge') {
      const opt = col.options?.find((o) => o.value === value)
      return (
        <Badge
          variant="outline"
          className="text-[10px]"
          style={opt?.color ? { borderColor: opt.color, color: opt.color } : undefined}
        >
          {opt?.label ?? value ?? '-'}
        </Badge>
      )
    }

    // 기본 텍스트 — 편집 가능하면 클릭으로 편집 시작
    if (canEdit) {
      return (
        <button
          className={cn(
            'group inline-flex items-center gap-1 hover:text-primary',
            col.align === 'right' ? 'justify-end w-full' : 'text-left',
          )}
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

  // 행 렌더링
  const renderRows = (rows: T[]) =>
    rows.map((row) => {
      const id = String(row[rowKey])
      const isSelected = selectedRows.has(id)
      return (
        <tr
          key={id}
          className={cn(
            'border-b transition-colors hover:bg-muted/50',
            isSelected && 'bg-blue-50',
            onRowClick && 'cursor-pointer',
          )}
          onClick={() => onRowClick?.(row)}
        >
          <td className="w-8 px-3 py-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {
                setSelectedRows((prev) => {
                  const next = new Set(prev)
                  next.has(id) ? next.delete(id) : next.add(id)
                  return next
                })
              }}
              className="h-4 w-4 rounded border-[rgba(0,0,0,0.15)]"
            />
          </td>
          {columns.map((col) => (
            <td
              key={col.key}
              className={cn(
                'pl-3 pr-6 py-2 text-sm',
                !col.wrap && 'whitespace-nowrap',
                col.align === 'center' && 'text-center',
                col.align === 'right' && 'text-right',
              )}
              style={col.width ? { maxWidth: col.width } : undefined}
            >
              {renderCell(row, col)}
            </td>
          ))}
        </tr>
      )
    })

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

      {/* 그룹 탭 */}
      {groupTabs && (
        <div className="border-b px-6">
          <div className="flex gap-0">
            {groupTabs.map((tab) => (
              <button
                key={tab.value ?? '__all__'}
                onClick={() => setActiveGroup(tab.value)}
                className={cn(
                  'relative px-3 py-2.5 text-sm font-medium transition-colors',
                  activeGroup === tab.value
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="flex items-center gap-1.5">
                  {tab.label}
                  {tab.count !== undefined && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        activeGroup === tab.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </span>
                {activeGroup === tab.value && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <CardContent className="pt-4">
        {/* ── 툴바: FilterBar 스타일 ── */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          {/* 검색 */}
          {!hideSearch && <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-[240px]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
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

          {/* 선택됨 표시 */}
          {selectedRows.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedRows.size}개 선택됨</span>
              {onRowDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    onRowDelete(Array.from(selectedRows))
                    setSelectedRows(new Set())
                  }}
                >
                  <X className="mr-1 h-3 w-3" />
                  삭제
                </Button>
              )}
            </div>
          )}
        </div>

        {/* 테이블 — 컬럼이 많으면 가로 스크롤 */}
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: `${Math.max(800, columns.length * 100)}px` }}>
            <thead>
              <tr className="border-b">
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === paged.length && paged.length > 0}
                    onChange={() => {
                      if (selectedRows.size === paged.length && paged.length > 0) {
                        setSelectedRows(new Set())
                      } else {
                        setSelectedRows(new Set(paged.map((r) => String(r[rowKey]))))
                      }
                    }}
                    className="h-4 w-4 rounded border-[rgba(0,0,0,0.15)]"
                  />
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'pl-3 pr-6 py-2 text-xs font-medium text-muted-foreground',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right',
                      col.sortable && 'cursor-pointer select-none hover:text-foreground',
                    )}
                    style={col.width ? { maxWidth: col.width } : undefined}
                    onClick={() => col.sortable && toggleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable && (
                        sortKey === col.key ? (
                          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 그룹핑 렌더 */}
              {groups
                ? Array.from(groups.entries()).map(([groupName, rows]) => (
                    <React.Fragment key={groupName}>
                      <tr
                        className="cursor-pointer border-b bg-muted/30 hover:bg-muted/50"
                        onClick={() => toggleGroup(groupName)}
                      >
                        <td colSpan={columns.length + 1} className="px-3 py-2">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            {collapsedGroups.has(groupName) ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                            {groupName}
                            <Badge variant="secondary" className="text-[10px]">
                              {rows.length}
                            </Badge>
                          </span>
                        </td>
                      </tr>
                      {!collapsedGroups.has(groupName) && renderRows(rows)}
                    </React.Fragment>
                  ))
                : renderRows(paged)}
            </tbody>

            {/* 합계 행 */}
            {showSummary && (
              <tfoot>
                <tr className="border-t-2 bg-muted/30">
                  {/* 체크박스 열 — 비움 */}
                  <td className="px-3 py-2.5" />
                  {columns.map((col, i) => {
                    const hasSummary = !!col.summaryFn
                    // 첫 번째 컬럼이고 summaryFn이 없으면 "합계" 라벨 표시
                    const showLabel = i === 0 && !hasSummary
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          'pl-3 pr-6 py-2.5 text-sm',
                          col.align === 'center' && 'text-center',
                          col.align === 'right' && 'text-right',
                        )}
                      >
                        {showLabel && (
                          <span className="text-xs font-semibold text-muted-foreground">합계</span>
                        )}
                        {hasSummary && (
                          <span className="font-semibold">
                            <span className="mr-1 text-[10px] text-muted-foreground">{col.summaryLabel}</span>
                            {typeof computeSummary(col) === 'number'
                              ? (computeSummary(col) as number).toLocaleString()
                              : computeSummary(col)}
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
            <span>{sorted.length}건</span>
            {selectedRows.size > 0 && <span>{selectedRows.size}개 선택됨</span>}
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
