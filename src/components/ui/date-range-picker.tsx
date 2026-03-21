'use client'

import * as React from 'react'
import { CalendarIcon } from 'lucide-react'
import { format, isBefore } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/* ── DateRangePicker ────────────────────────────────
 *  캘린더 팝업으로 날짜 범위를 선택하는 컴포넌트
 *
 *  동작: 팝업 열림 → 첫 클릭 = 시작일, 두 번째 클릭 = 종료일 → 자동 닫힘
 *  mode="range"를 사용하되, 팝업 열 때마다 리셋하여 순차 선택 보장
 *
 *  사용법:
 *    <DateRangePicker
 *      from={new Date('2026-03-12')}
 *      to={new Date('2026-03-18')}
 *      onChange={({ from, to }) => { setSince(from); setUntil(to) }}
 *    />
 * ──────────────────────────────────────────────────── */

interface DateRangePickerProps {
  from?: Date
  to?: Date
  onChange?: (range: { from: Date; to: Date }) => void
  className?: string
  /** 날짜 포맷 (기본: 'M.d') */
  dateFormat?: string
  /** 달력 몇 개월 표시 (기본: 1) */
  numberOfMonths?: number
}

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
  dateFormat = 'M.d',
  numberOfMonths = 1,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  // 확정된 범위 (버튼 표시용)
  const [confirmed, setConfirmed] = React.useState<{ from: Date; to: Date } | undefined>(
    from && to ? { from, to } : undefined
  )
  // 캘린더 내부 선택 (range mode용)
  const [selecting, setSelecting] = React.useState<DateRange | undefined>(undefined)
  // 선택 단계: 0 = 아직 안 클릭, 1 = 시작일 클릭 완료
  const stepRef = React.useRef(0)
  // 첫 번째 클릭한 날짜 저장 (range mode가 변경할 수 없도록)
  const firstClickRef = React.useRef<Date | null>(null)
  // 현재 표시할 월
  const [month, setMonth] = React.useState<Date>(from ?? new Date())

  // 외부 props 변경 시 동기화
  React.useEffect(() => {
    if (from && to) {
      setConfirmed({ from, to })
    }
  }, [from, to])

  // 팝업 열릴 때: 선택 리셋
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      setSelecting(undefined)
      stepRef.current = 0
      firstClickRef.current = null
      setMonth(confirmed?.from ?? new Date())
    }
  }

  // onDayClick: 어떤 날짜를 클릭했는지 정확히 알 수 있음
  const handleDayClick = (day: Date) => {
    if (stepRef.current === 0) {
      // 첫 번째 클릭 → 시작일
      stepRef.current = 1
      firstClickRef.current = day
      setSelecting({ from: day, to: undefined })
    } else {
      // 두 번째 클릭 → 종료일, 정렬 후 확정
      const first = firstClickRef.current!
      const [s, e] = isBefore(day, first) ? [day, first] : [first, day]

      const finalRange = { from: s, to: e }
      setSelecting(finalRange)
      setConfirmed(finalRange)
      onChange?.(finalRange)
      stepRef.current = 0
      firstClickRef.current = null
      setTimeout(() => setOpen(false), 200)
    }
  }

  // 버튼 표시 텍스트
  const display = confirmed

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-8 justify-start gap-2 px-3 text-xs font-normal',
            !display && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {display ? (
            <>
              {format(display.from, dateFormat, { locale: ko })}
              {' ~ '}
              {format(display.to, dateFormat, { locale: ko })}
            </>
          ) : (
            <span>기간 선택</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          month={month}
          onMonthChange={setMonth}
          selected={selecting}
          onDayClick={handleDayClick}
          numberOfMonths={numberOfMonths}
          locale={ko}
        />
        {stepRef.current === 1 && firstClickRef.current && (
          <div className="border-t px-3 py-2 text-xs text-muted-foreground text-center">
            시작일: <span className="font-medium text-foreground">
              {format(firstClickRef.current, 'M월 d일', { locale: ko })}
            </span> → 종료일을 선택하세요
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
