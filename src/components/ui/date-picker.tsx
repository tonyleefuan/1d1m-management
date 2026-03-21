'use client'

import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Input } from './input'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

/* ── DatePicker ─────────────────────────────────────
 *  날짜 선택 컴포넌트 — 다양한 베리에이션
 *
 *  사용법:
 *    // 기본 (달력 팝업)
 *    <DatePicker value={date} onChange={setDate} />
 *
 *    // 범위 선택
 *    <DateRangePicker start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e) }} />
 *
 *    // 월 선택
 *    <MonthPicker value="2025-03" onChange={setMonth} />
 *
 *    // 인라인 입력 (텍스트 필드 스타일)
 *    <DatePicker value={date} onChange={setDate} variant="inline" />
 * ──────────────────────────────────────────────────── */

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDate(s: string): Date | null {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

// ── 달력 그리드 ──
function CalendarGrid({
  year, month, selected, rangeStart, rangeEnd, onSelect, onHover, hoverDate,
}: {
  year: number; month: number; selected?: string; rangeStart?: string; rangeEnd?: string
  onSelect: (date: string) => void; onHover?: (date: string | null) => void; hoverDate?: string | null
}) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const today = formatDate(new Date())

  const cells: React.ReactNode[] = []
  // 빈 셀
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} />)
  }
  // 날짜 셀
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const isSelected = dateStr === selected
    const isToday = dateStr === today
    const isInRange = rangeStart && (rangeEnd || hoverDate) && dateStr >= rangeStart && dateStr <= (rangeEnd || hoverDate || '')
    const isRangeEdge = dateStr === rangeStart || dateStr === rangeEnd

    cells.push(
      <button
        key={d}
        onClick={() => onSelect(dateStr)}
        onMouseEnter={() => onHover?.(dateStr)}
        onMouseLeave={() => onHover?.(null)}
        className={cn(
          'h-8 w-8 rounded-md text-sm transition-colors',
          isSelected || isRangeEdge ? 'bg-primary text-primary-foreground' :
          isInRange ? 'bg-primary/10 text-primary' :
          isToday ? 'bg-muted font-semibold' :
          'hover:bg-muted',
        )}
      >
        {d}
      </button>
    )
  }

  return (
    <div className="grid grid-cols-7 gap-0.5" style={{ width: '252px' }}>
      {DAYS.map((d) => (
        <div key={d} className="h-8 w-8 flex items-center justify-center text-[11px] text-muted-foreground font-medium">{d}</div>
      ))}
      {cells}
    </div>
  )
}

// ── 달력 헤더 (년월 이동) ──
function CalendarHeader({
  year, month, onPrev, onNext, onYearMonth,
}: {
  year: number; month: number; onPrev: () => void; onNext: () => void; onYearMonth?: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <button onClick={onPrev} className="p-1 hover:bg-muted rounded-md"><ChevronLeft className="h-4 w-4" /></button>
      <button onClick={onYearMonth} className="text-sm font-semibold hover:bg-muted px-2 py-1 rounded-md whitespace-nowrap">
        {year}년 {month + 1}월
      </button>
      <button onClick={onNext} className="p-1 hover:bg-muted rounded-md"><ChevronRight className="h-4 w-4" /></button>
    </div>
  )
}

// ═══════════ DatePicker ═══════════
interface DatePickerProps {
  value?: string
  onChange?: (date: string) => void
  placeholder?: string
  /** inline: 텍스트 입력 스타일, popup: 달력 팝업 (기본) */
  variant?: 'popup' | 'inline'
  /** 비활성 */
  disabled?: boolean
  className?: string
}

export function DatePicker({
  value, onChange, placeholder = '날짜 선택', variant = 'popup', disabled, className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => {
    const d = parseDate(value || '') || new Date()
    return d.getFullYear()
  })
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseDate(value || '') || new Date()
    return d.getMonth()
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // value 변경 시 view 동기화
  useEffect(() => {
    const d = parseDate(value || '')
    if (d) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()) }
  }, [value])

  if (variant === 'inline') {
    return (
      <Input
        type="date"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className={cn('w-[160px]', className)}
      />
    )
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/50',
          disabled && 'opacity-50 cursor-not-allowed',
          !value && 'text-muted-foreground',
        )}
      >
        <Calendar className="h-4 w-4 text-muted-foreground" />
        {value || placeholder}
        {value && (
          <X
            className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground ml-1"
            onClick={(e) => { e.stopPropagation(); onChange?.('') }}
          />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border bg-popover p-3 shadow-dropdown">
          <CalendarHeader
            year={viewYear}
            month={viewMonth}
            onPrev={() => { if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11) } else setViewMonth(viewMonth - 1) }}
            onNext={() => { if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0) } else setViewMonth(viewMonth + 1) }}
          />
          <CalendarGrid
            year={viewYear}
            month={viewMonth}
            selected={value}
            onSelect={(d) => { onChange?.(d); setOpen(false) }}
          />
          <div className="mt-2 pt-2 border-t flex justify-between">
            <button
              onClick={() => { onChange?.(formatDate(new Date())); setOpen(false) }}
              className="text-xs text-primary hover:underline"
            >
              오늘
            </button>
            <button onClick={() => { onChange?.(''); setOpen(false) }} className="text-xs text-muted-foreground hover:underline">
              초기화
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════ DateRangePicker ═══════════
interface DateRangePickerProps {
  start?: string
  end?: string
  onChange?: (start: string, end: string) => void
  placeholder?: string
  className?: string
}

export function DateRangePicker({ start, end, onChange, placeholder = '기간 선택', className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState<'start' | 'end'>('start')
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const [tempStart, setTempStart] = useState(start || '')
  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = (date: string) => {
    if (picking === 'start') {
      setTempStart(date)
      setPicking('end')
    } else {
      const s = date < tempStart ? date : tempStart
      const e = date < tempStart ? tempStart : date
      onChange?.(s, e)
      setOpen(false)
      setPicking('start')
    }
  }

  const displayText = start && end ? `${start} ~ ${end}` : placeholder

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/50',
          !(start && end) && 'text-muted-foreground',
        )}
      >
        <Calendar className="h-4 w-4 text-muted-foreground" />
        {displayText}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border bg-popover p-3 shadow-dropdown">
          <p className="text-xs text-muted-foreground mb-2">
            {picking === 'start' ? '시작일을 선택하세요' : '종료일을 선택하세요'}
          </p>
          <CalendarHeader
            year={viewYear}
            month={viewMonth}
            onPrev={() => { if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11) } else setViewMonth(viewMonth - 1) }}
            onNext={() => { if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0) } else setViewMonth(viewMonth + 1) }}
          />
          <CalendarGrid
            year={viewYear}
            month={viewMonth}
            rangeStart={picking === 'end' ? tempStart : start}
            rangeEnd={picking === 'end' ? undefined : end}
            onSelect={handleSelect}
            onHover={picking === 'end' ? setHoverDate : undefined}
            hoverDate={hoverDate}
          />
        </div>
      )}
    </div>
  )
}

// ═══════════ MonthPicker ═══════════
interface MonthPickerProps {
  value?: string  // 'YYYY-MM' 형식
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
}

export function MonthPicker({ value, onChange, placeholder = '월 선택', className }: MonthPickerProps) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => {
    if (value) return parseInt(value.split('-')[0])
    return new Date().getFullYear()
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectedMonth = value ? parseInt(value.split('-')[1]) - 1 : -1
  const selectedYear = value ? parseInt(value.split('-')[0]) : -1

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/50',
          !value && 'text-muted-foreground',
        )}
      >
        <Calendar className="h-4 w-4 text-muted-foreground" />
        {value ? `${value.split('-')[0]}년 ${parseInt(value.split('-')[1])}월` : placeholder}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border bg-popover p-3 shadow-dropdown w-[240px]">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setViewYear(viewYear - 1)} className="p-1 hover:bg-muted rounded-md"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold">{viewYear}년</span>
            <button onClick={() => setViewYear(viewYear + 1)} className="p-1 hover:bg-muted rounded-md"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((m, i) => {
              const monthStr = `${viewYear}-${String(i + 1).padStart(2, '0')}`
              const isSelected = viewYear === selectedYear && i === selectedMonth
              return (
                <button
                  key={m}
                  onClick={() => { onChange?.(monthStr); setOpen(false) }}
                  className={cn(
                    'rounded-md py-2 text-sm transition-colors',
                    isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
