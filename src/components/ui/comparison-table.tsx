'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { StatusBadge } from './status-badge'

/* ── ComparisonTable ────────────────────────────────
 *  비교 테이블 — before/after, A vs B, 상품 비교 등
 *
 *  사용법:
 *    // 1. Before / After 비교 (히스토리, 변경 로그)
 *    <ComparisonTable
 *      rows={[
 *        { label: '상품명', before: '오버사이즈 코트', after: '오버핏 코트' },
 *        { label: '가격', before: '₩189,000', after: '₩199,000', changed: true },
 *        { label: '카테고리', before: '아우터', after: '아우터' },
 *      ]}
 *    />
 *
 *    // 2. 다중 칼럼 비교 (상품 A vs B vs C)
 *    <ComparisonTable
 *      headers={['항목', 'Havehad', 'Women']}
 *      rows={[
 *        { label: '원가율', values: ['28%', '30%'] },
 *        { label: '판매율', values: ['85%', '90%'] },
 *        { label: '런칭일', values: ['2024.01', '2026.03'], highlights: [false, true] },
 *      ]}
 *    />
 *
 *    // 3. 스펙 비교 (기능 비교표)
 *    <ComparisonTable
 *      headers={['기능', 'Free', 'Pro', 'Enterprise']}
 *      rows={[
 *        { label: '사용자', values: ['3명', '무제한', '무제한'] },
 *        { label: 'API 호출', values: ['1,000', '10,000', '무제한'] },
 *        { label: '커스텀 도메인', values: [false, true, true] },
 *      ]}
 *      variant="spec"
 *    />
 * ──────────────────────────────────────────────────── */

interface BeforeAfterRow {
  label: string
  before: React.ReactNode
  after: React.ReactNode
  /** 변경된 항목 강조 */
  changed?: boolean
}

interface MultiCompareRow {
  label: string
  values: (React.ReactNode | boolean)[]
  /** 각 값의 강조 여부 */
  highlights?: boolean[]
}

type ComparisonRow = BeforeAfterRow | MultiCompareRow

function isBeforeAfterRow(row: ComparisonRow): row is BeforeAfterRow {
  return 'before' in row
}

interface ComparisonTableProps {
  /** 다중 칼럼 헤더 (before/after는 자동 생성) */
  headers?: string[]
  rows: ComparisonRow[]
  /** 변형: default(일반), spec(기능 비교) */
  variant?: 'default' | 'spec'
  /** 변경된 항목만 표시 (before/after 모드) */
  changedOnly?: boolean
  /** 줄무늬 */
  striped?: boolean
  className?: string
}

function renderValue(value: React.ReactNode | boolean) {
  if (typeof value === 'boolean') {
    return value ? (
      <span className="text-emerald-600 font-medium">O</span>
    ) : (
      <span className="text-muted-foreground">-</span>
    )
  }
  return value ?? <span className="text-muted-foreground">-</span>
}

export function ComparisonTable({
  headers,
  rows,
  variant = 'default',
  changedOnly,
  striped,
  className,
}: ComparisonTableProps) {
  const isBeforeAfter = rows.length > 0 && isBeforeAfterRow(rows[0])
  const filteredRows = changedOnly && isBeforeAfter
    ? rows.filter((r) => isBeforeAfterRow(r) && r.changed)
    : rows

  const columnHeaders = headers ?? (isBeforeAfter ? ['항목', '이전', '이후'] : ['항목'])

  return (
    <div className={cn('rounded-md border overflow-hidden', className)}>
      <table className="w-full">
        <thead>
          <tr className="bg-muted/40 border-b">
            {columnHeaders.map((h, i) => (
              <th
                key={i}
                className={cn(
                  'px-4 py-2.5 text-xs font-semibold text-muted-foreground',
                  i === 0 ? 'text-left' : 'text-center',
                  variant === 'spec' && i > 0 && 'min-w-[100px]',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row, i) => {
            if (isBeforeAfterRow(row)) {
              return (
                <tr
                  key={i}
                  className={cn(
                    'border-b last:border-b-0 transition-colors',
                    striped && i % 2 === 1 && 'bg-muted/10',
                    row.changed && 'bg-amber-50/50',
                  )}
                >
                  <td className="px-4 py-2.5 text-sm font-medium w-1/4">
                    <span className="flex items-center gap-2">
                      {row.label}
                      {row.changed && <StatusBadge status="warning" size="xs" variant="dot">변경</StatusBadge>}
                    </span>
                  </td>
                  <td className={cn('px-4 py-2.5 text-sm text-center', row.changed && 'text-muted-foreground line-through')}>
                    {renderValue(row.before)}
                  </td>
                  <td className={cn('px-4 py-2.5 text-sm text-center', row.changed && 'font-semibold text-primary')}>
                    {renderValue(row.after)}
                  </td>
                </tr>
              )
            }

            // MultiCompareRow
            const mcRow = row as MultiCompareRow
            return (
              <tr
                key={i}
                className={cn(
                  'border-b last:border-b-0',
                  striped && i % 2 === 1 && 'bg-muted/10',
                )}
              >
                <td className="px-4 py-2.5 text-sm font-medium">{mcRow.label}</td>
                {mcRow.values.map((val, j) => (
                  <td
                    key={j}
                    className={cn(
                      'px-4 py-2.5 text-sm text-center',
                      mcRow.highlights?.[j] && 'font-semibold text-primary bg-primary/5',
                      variant === 'spec' && typeof val === 'boolean' && 'text-lg',
                    )}
                  >
                    {renderValue(val)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
