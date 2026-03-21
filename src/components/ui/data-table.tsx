'use client'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Button } from './button'
import { Input } from './input'
import { Checkbox } from './checkbox'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from './table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from './dropdown-menu'
import {
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  Search, MoreHorizontal, Loader2,
} from 'lucide-react'
import { renderCellByType, type CellDisplayType, type CellTypeConfig } from './column-types'
import { SkeletonTable } from './skeleton'

/* ═══════════════════════════════════════════════════════════════════
 *  DataTable — 읽기 전용 데이터 테이블
 * ═══════════════════════════════════════════════════════════════════
 *
 *  기능: 검색 + 정렬 + 체크박스 선택 + 행 액션 + 페이지네이션
 *        + 로딩 상태 + 요약 행 + 초기 정렬 + 외부 선택 제어
 *
 *  사용법:
 *    <DataTable
 *      title="상품 목록"
 *      columns={[
 *        { key: 'name', label: '상품명', sortable: true },
 *        { key: 'price', label: '가격', align: 'right', sortable: true,
 *          cellType: 'currency' },
 *        { key: 'status', label: '상태', cellType: 'status',
 *          cellConfig: { statusMap: { active: { status: 'success', label: '활성' } } } },
 *      ]}
 *      data={products}
 *      searchKeys={['name']}
 *      loading={isLoading}
 *      defaultSort={{ key: 'name', dir: 'asc' }}
 *      summary={[{ key: 'price', type: 'sum', label: '합계' }]}
 *      selectable
 *      rowActions={(row) => [
 *        { label: '수정', onClick: () => edit(row) },
 *        { label: '삭제', onClick: () => del(row), destructive: true },
 *      ]}
 *    />
 *
 *  ┌─ 테이블 컴포넌트 선택 가이드 ──────────────────┐
 *  │ DataTable        — 읽기 전용 목록 (검색+정렬)   │
 *  │ GroupedDataTable  — 계층 그룹핑 + 요약          │
 *  │ EditableDataTable — 인라인 편집 + 그룹 탭       │
 *  │ Table (raw)       — 완전 커스텀 테이블          │
 *  └─────────────────────────────────────────────────┘
 * ═══════════════════════════════════════════════════════════════════ */

type SortDir = 'asc' | 'desc' | null

export interface DataTableColumn<T> {
  key: string
  label: string
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  className?: string
  /** 칼럼 너비 — Tailwind 클래스 또는 px 값 */
  width?: string
  /** 칼럼 표시 타입 — column-types 레지스트리에서 자동 렌더링 */
  cellType?: CellDisplayType
  /** cellType에 필요한 추가 설정 */
  cellConfig?: CellTypeConfig
  /** 커스텀 렌더러 (cellType보다 우선) */
  render?: (value: any, row: T, index: number) => React.ReactNode
  /** 요약 행에서 이 칼럼의 값을 계산하는 방식 */
  summary?: 'sum' | 'avg' | 'count' | 'min' | 'max' | ((data: T[]) => React.ReactNode)
}

interface RowAction {
  label: string
  onClick: () => void
  destructive?: boolean
}

interface DataTableProps<T extends Record<string, any>> {
  title?: string
  description?: string
  columns: DataTableColumn<T>[]
  data: T[]
  searchPlaceholder?: string
  searchKeys?: string[]
  /** 초기 페이지 사이즈 (기본 20) */
  pageSize?: number
  /** 페이지 사이즈 옵션 (기본 [20, 50, 100]) — false로 비활성화 */
  pageSizeOptions?: number[] | false
  /** 페이지네이션 비활성화 (전체 데이터 표시) */
  noPagination?: boolean
  /** 촘촘한 행 간격 (기본 true — 읽기 전용 테이블은 dense가 기본) */
  dense?: boolean
  action?: React.ReactNode
  onRowClick?: (row: T) => void
  selectable?: boolean
  onSelectionChange?: (selected: T[]) => void
  /** 외부에서 선택 상태 제어 (제어 컴포넌트 패턴) */
  selectedKeys?: Set<string>
  rowActions?: (row: T) => RowAction[]
  rowKey?: string
  /** 행별 조건부 className (ex: 미매칭 행 하이라이트) */
  rowClassName?: (row: T) => string | undefined
  className?: string
  emptyMessage?: string
  /** 로딩 상태 — true면 SkeletonTable 표시 */
  loading?: boolean
  /** 초기 정렬 */
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  /** 검색바 숨기기 */
  hideSearch?: boolean
  /** 외부에서 검색어 제어 (FilterBar 연동) — hideSearch와 함께 사용 */
  externalSearch?: string
  /** 외부 검색어 변경 콜백 */
  onExternalSearchChange?: (value: string) => void
  /** 테이블 위 커스텀 헤더 (FilterBar 등) */
  header?: React.ReactNode
  /** 하단 요약 행 표시 여부 (column.summary 설정 필요) */
  showSummary?: boolean
  /** 요약 행 라벨 (기본: '합계') */
  summaryLabel?: string
}

export function DataTable<T extends Record<string, any>>({
  title,
  description,
  columns,
  data,
  searchPlaceholder = '검색...',
  searchKeys = [],
  pageSize: defaultPageSize = 20,
  pageSizeOptions = [20, 50, 100],
  noPagination = false,
  dense = true,
  action,
  onRowClick,
  selectable = false,
  onSelectionChange,
  selectedKeys: externalSelectedKeys,
  rowActions,
  rowKey = 'id',
  rowClassName,
  className,
  emptyMessage = '데이터가 없습니다',
  loading = false,
  defaultSort,
  hideSearch = false,
  externalSearch,
  onExternalSearchChange,
  header,
  showSummary = false,
  summaryLabel = '합계',
}: DataTableProps<T>) {
  const [internalSearch, setInternalSearch] = useState('')
  const search = externalSearch !== undefined ? externalSearch : internalSearch
  const setSearch = onExternalSearchChange ?? setInternalSearch
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null)
  const [sortDir, setSortDir] = useState<SortDir>(defaultSort?.dir ?? null)
  const [page, setPage] = useState(0)
  const [activePageSize, setActivePageSize] = useState(defaultPageSize)
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set())

  // 외부 선택 제어 지원
  const selected = externalSelectedKeys ?? internalSelected
  const setSelected = useCallback((next: Set<string>) => {
    if (!externalSelectedKeys) setInternalSelected(next)
    onSelectionChange?.(data.filter((r) => next.has(String(r[rowKey] ?? ''))))
  }, [externalSelectedKeys, onSelectionChange, data, rowKey])

  // data 변경 시 페이지 리셋
  useEffect(() => { setPage(0) }, [data.length])

  const handlePageSizeChange = useCallback((size: number) => {
    setActivePageSize(size)
    setPage(0)
  }, [])

  // 검색
  const filtered = useMemo(() => {
    if (!search.trim() || searchKeys.length === 0) return data
    const q = search.toLowerCase()
    return data.filter((row) =>
      searchKeys.some((key) => {
        const val = row[key]
        return val != null && String(val).toLowerCase().includes(q)
      }),
    )
  }, [data, search, searchKeys])

  // 정렬
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [filtered, sortKey, sortDir])

  // 페이지네이션
  const totalPages = noPagination ? 1 : Math.max(1, Math.ceil(sorted.length / activePageSize))
  const paged = noPagination ? sorted : sorted.slice(page * activePageSize, (page + 1) * activePageSize)

  // 요약 행 계산
  const summaryRow = useMemo(() => {
    if (!showSummary) return null
    const hasSummary = columns.some(col => col.summary)
    if (!hasSummary) return null
    return columns.map(col => {
      if (!col.summary) return null
      if (typeof col.summary === 'function') return col.summary(sorted)
      const nums = sorted.map(r => typeof r[col.key] === 'number' ? r[col.key] as number : 0)
      switch (col.summary) {
        case 'sum': return nums.reduce((a, b) => a + b, 0)
        case 'avg': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
        case 'count': return sorted.filter(r => r[col.key] != null && r[col.key] !== '').length
        case 'min': return nums.length ? Math.min(...nums) : 0
        case 'max': return nums.length ? Math.max(...nums) : 0
        default: return null
      }
    })
  }, [showSummary, columns, sorted])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortKey(null); setSortDir(null) }
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(0)
  }

  // 선택
  const getRowId = (row: T) => String(row[rowKey] ?? '')
  const allPageSelected = paged.length > 0 && paged.every((r) => selected.has(getRowId(r)))
  const somePageSelected = paged.some((r) => selected.has(getRowId(r)))

  const toggleAll = useCallback(() => {
    const next = new Set(selected)
    if (allPageSelected) {
      paged.forEach((r) => next.delete(getRowId(r)))
    } else {
      paged.forEach((r) => next.add(getRowId(r)))
    }
    setSelected(next)
  }, [selected, paged, allPageSelected, setSelected])

  const toggleRow = useCallback((row: T) => {
    const id = getRowId(row)
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }, [selected, setSelected])

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortKey !== colKey) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />
    if (sortDir === 'asc') return <ArrowUp className="ml-1 h-3 w-3" />
    return <ArrowDown className="ml-1 h-3 w-3" />
  }

  const colSpan = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)

  const tableContent = (
    <>
      {/* 커스텀 헤더 (FilterBar 등) */}
      {header}

      {/* 검색 + 액션 */}
      {!hideSearch && (
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              className="pl-9"
            />
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      {hideSearch && action && (
        <div className="flex items-center justify-end gap-2 mb-4">{action}</div>
      )}

      {/* 로딩 상태 */}
      {loading && <SkeletonTable cols={columns.length} rows={Math.min(activePageSize, 8)} />}

      {/* 테이블 */}
      {!loading && <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className={cn('w-[40px]', dense && 'py-2')}>
                  <Checkbox
                    checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    aria-label="전체 선택"
                  />
                </TableHead>
              )}
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    dense && 'py-2 text-xs',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.sortable && 'cursor-pointer select-none hover:text-foreground',
                    col.width,
                    col.className,
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center">
                    {col.label}
                    {col.sortable && <SortIcon colKey={col.key} />}
                  </span>
                </TableHead>
              ))}
              {rowActions && <TableHead className={cn('w-[50px]', dense && 'py-2')} />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row, rowIdx) => {
                const id = getRowId(row)
                const isSelected = selected.has(id)
                return (
                  <TableRow
                    key={id || rowIdx}
                    data-state={isSelected ? 'selected' : undefined}
                    className={cn(
                      onRowClick && 'cursor-pointer',
                      isSelected && 'bg-muted/50',
                      rowClassName?.(row),
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selectable && (
                      <TableCell className={cn(dense && 'py-1.5')} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleRow(row)}
                          aria-label={`행 ${rowIdx + 1} 선택`}
                        />
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(
                          dense && 'py-1.5 text-[13px]',
                          col.align === 'right' && 'text-right',
                          col.align === 'center' && 'text-center',
                          col.className,
                        )}
                      >
                        {col.render
                          ? col.render(row[col.key], row, page * activePageSize + rowIdx)
                          : col.cellType
                            ? renderCellByType(col.cellType, row[col.key], row, col.cellConfig)
                            : row[col.key] ?? '-'}
                      </TableCell>
                    ))}
                    {rowActions && (
                      <TableCell className={cn(dense && 'py-1')} onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className={cn(dense ? 'h-7 w-7' : 'h-8 w-8')}>
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">메뉴 열기</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {rowActions(row).map((act, i) => (
                              <React.Fragment key={act.label}>
                                {act.destructive && i > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                  onClick={act.onClick}
                                  className={cn(act.destructive && 'text-destructive')}
                                >
                                  {act.label}
                                </DropdownMenuItem>
                              </React.Fragment>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })
            )}
          </TableBody>
          {/* 요약 행 */}
          {summaryRow && paged.length > 0 && (
            <TableFooter>
              <TableRow className="bg-muted/30 font-semibold">
                {selectable && <TableCell className={cn(dense && 'py-1.5')} />}
                {columns.map((col, colIdx) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      dense && 'py-1.5 text-[13px]',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                    )}
                  >
                    {colIdx === 0 && summaryRow[colIdx] == null
                      ? <span className="text-xs font-semibold text-muted-foreground">{summaryLabel}</span>
                      : summaryRow[colIdx] != null
                        ? (col.cellType
                          ? renderCellByType(col.cellType, summaryRow[colIdx], {} as T, col.cellConfig)
                          : typeof summaryRow[colIdx] === 'number'
                            ? (summaryRow[colIdx] as number).toLocaleString()
                            : summaryRow[colIdx])
                        : null
                    }
                  </TableCell>
                ))}
                {rowActions && <TableCell className={cn(dense && 'py-1')} />}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>}

      {/* 하단: 건수 + 페이지 사이즈 + 페이지네이션 */}
      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>
            {selectable
              ? `${selected.size}/${sorted.length}개 선택됨`
              : `${sorted.length}건`}
          </span>
          {!noPagination && pageSizeOptions && pageSizeOptions.length > 0 && (
            <div className="flex items-center gap-1 border-l pl-3">
              {pageSizeOptions.map((size) => (
                <button
                  key={size}
                  onClick={() => handlePageSizeChange(size)}
                  className={cn(
                    'rounded px-2 py-0.5 transition-colors',
                    activePageSize === size ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {size}개
                </button>
              ))}
            </div>
          )}
        </div>
        {!noPagination && totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page === 0} onClick={() => setPage(page - 1)}>
              이전
            </Button>
            <span className="px-2">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              다음
            </Button>
          </div>
        )}
      </div>
    </>
  )

  if (title) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
        </CardHeader>
        <CardContent>{tableContent}</CardContent>
      </Card>
    )
  }

  return <div className={className}>{tableContent}</div>
}
