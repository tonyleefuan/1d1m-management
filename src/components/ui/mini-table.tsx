'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'
import { renderCellByType, type CellDisplayType, type CellTypeConfig } from './column-types'

/* ── MiniTable ──────────────────────────────────────
 *  모달/카드 내부 경량 테이블 — 페이지네이션/검색 없이 심플하게
 *
 *  DataTable과의 차이:
 *    - 검색, 페이지네이션, 체크박스 없음
 *    - 더 촘촘한 간격 (compact)
 *    - 외곽 테두리/카드 래핑 없음
 *    - 모달 안에서 사용하기 좋은 경량 구조
 *
 *  사용법:
 *    // 모달 내 SKU 목록
 *    <MiniTable
 *      columns={[
 *        { key: 'sku', label: 'SKU' },
 *        { key: 'color', label: '컬러' },
 *        { key: 'size', label: '사이즈' },
 *        { key: 'qty', label: '수량', align: 'right', cellType: 'number' },
 *      ]}
 *      data={skus}
 *    />
 *
 *    // 합계 행 포함
 *    <MiniTable
 *      columns={columns}
 *      data={items}
 *      footer={[
 *        { key: 'sku', label: '합계' },
 *        { key: 'qty', value: totalQty, cellType: 'number' },
 *      ]}
 *    />
 *
 *    // 행 클릭 + 호버 하이라이트
 *    <MiniTable
 *      columns={columns}
 *      data={orders}
 *      onRowClick={(row) => setSelected(row)}
 *      hoverable
 *    />
 *
 *    // 줄무늬 + 테두리
 *    <MiniTable columns={columns} data={data} striped bordered />
 * ──────────────────────────────────────────────────── */

interface MiniColumn<T> {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  width?: string
  cellType?: CellDisplayType
  cellConfig?: CellTypeConfig
  render?: (value: any, row: T, index: number) => React.ReactNode
  className?: string
}

interface FooterCell {
  key: string
  label?: string
  value?: React.ReactNode
  cellType?: CellDisplayType
  cellConfig?: CellTypeConfig
  align?: 'left' | 'center' | 'right'
  className?: string
}

interface MiniTableProps<T extends Record<string, any>> {
  columns: MiniColumn<T>[]
  data: T[]
  /** 하단 합계/요약 행 */
  footer?: FooterCell[]
  /** 행 클릭 */
  onRowClick?: (row: T) => void
  /** 행 키 필드 */
  rowKey?: string
  /** 호버 하이라이트 */
  hoverable?: boolean
  /** 줄무늬 */
  striped?: boolean
  /** 외곽 테두리 */
  bordered?: boolean
  /** 빈 데이터 메시지 */
  emptyMessage?: string
  /** 최대 높이 (스크롤) */
  maxHeight?: number
  /** 캡션 */
  caption?: string
  className?: string
}

export function MiniTable<T extends Record<string, any>>({
  columns,
  data,
  footer,
  onRowClick,
  rowKey = 'id',
  hoverable = true,
  striped,
  bordered,
  emptyMessage = '데이터가 없습니다',
  maxHeight,
  caption,
  className,
}: MiniTableProps<T>) {
  return (
    <div
      className={cn(
        bordered && 'rounded-md border',
        maxHeight && 'overflow-y-auto',
        className,
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <Table>
        {caption && (
          <caption className="text-xs text-muted-foreground text-left mb-2">{caption}</caption>
        )}
        <TableHeader>
          <TableRow className={cn(bordered && 'bg-muted/30')}>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  'py-1.5 px-3 text-[11px] font-medium',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.className,
                )}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-16 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, i) => (
              <TableRow
                key={String(row[rowKey] ?? i)}
                className={cn(
                  hoverable && 'hover:bg-muted/50',
                  onRowClick && 'cursor-pointer',
                  striped && i % 2 === 1 && 'bg-muted/20',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      'py-1.5 px-3 text-[13px]',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.className,
                    )}
                  >
                    {col.render
                      ? col.render(row[col.key], row, i)
                      : col.cellType
                        ? renderCellByType(col.cellType, row[col.key], row, col.cellConfig)
                        : row[col.key] ?? '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>

        {footer && (
          <tfoot>
            <TableRow className="border-t-2 bg-muted/30">
              {columns.map((col) => {
                const fc = footer.find((f) => f.key === col.key)
                return (
                  <TableCell
                    key={col.key}
                    className={cn(
                      'py-2 px-3 text-[13px] font-semibold',
                      (fc?.align ?? col.align) === 'right' && 'text-right',
                      (fc?.align ?? col.align) === 'center' && 'text-center',
                      fc?.className,
                    )}
                  >
                    {fc?.label && <span className="text-xs text-muted-foreground">{fc.label}</span>}
                    {fc?.value != null
                      ? fc.value
                      : fc?.cellType
                        ? renderCellByType(fc.cellType, null, {}, fc.cellConfig)
                        : null}
                  </TableCell>
                )
              })}
            </TableRow>
          </tfoot>
        )}
      </Table>
    </div>
  )
}
