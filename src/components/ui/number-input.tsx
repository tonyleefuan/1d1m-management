'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { ChevronUp, ChevronDown } from 'lucide-react'

/* ── NumberInput ────────────────────────────────────
 *  포맷된 숫자 입력 — 통화/수량/퍼센트 등에 사용
 *
 *  사용법:
 *    // 기본 숫자
 *    <NumberInput value={qty} onChange={setQty} />
 *
 *    // 통화 (₩)
 *    <NumberInput value={price} onChange={setPrice} prefix="₩" thousandSeparator />
 *
 *    // 퍼센트 (%)
 *    <NumberInput value={rate} onChange={setRate} suffix="%" min={0} max={100} step={0.1} />
 *
 *    // 수량 (스텝 버튼)
 *    <NumberInput value={qty} onChange={setQty} suffix="개" min={0} showStepper />
 *
 *    // 만원 단위
 *    <NumberInput value={budget} onChange={setBudget} suffix="만원" thousandSeparator />
 * ──────────────────────────────────────────────────── */

interface NumberInputProps {
  value: number | null | undefined
  onChange?: (value: number | null) => void
  /** 접두사 (예: ₩, $) */
  prefix?: string
  /** 접미사 (예: %, 개, 만원) */
  suffix?: string
  /** 천 단위 쉼표 */
  thousandSeparator?: boolean
  /** 소수점 자릿수 */
  decimalPlaces?: number
  /** 최솟값 */
  min?: number
  /** 최댓값 */
  max?: number
  /** 증감 단위 */
  step?: number
  /** 증감 버튼 표시 */
  showStepper?: boolean
  /** 비활성 */
  disabled?: boolean
  /** 읽기 전용 */
  readOnly?: boolean
  placeholder?: string
  /** 크기 */
  size?: 'sm' | 'md' | 'lg'
  /** 텍스트 정렬 */
  align?: 'left' | 'center' | 'right'
  className?: string
  /** 포커스 해제 시 콜백 */
  onBlur?: () => void
}

function formatNumber(
  val: number | null | undefined,
  thousandSeparator?: boolean,
  decimalPlaces?: number,
): string {
  if (val === null || val === undefined) return ''
  if (decimalPlaces !== undefined) {
    const fixed = val.toFixed(decimalPlaces)
    if (!thousandSeparator) return fixed
    const [int, dec] = fixed.split('.')
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ? '.' + dec : '')
  }
  if (!thousandSeparator) return String(val)
  return val.toLocaleString('en-US')
}

function parseNumber(str: string): number | null {
  const cleaned = str.replace(/[,\s]/g, '')
  if (cleaned === '' || cleaned === '-') return null
  const num = Number(cleaned)
  return isNaN(num) ? null : num
}

const sizeMap = {
  sm: 'h-8 text-xs px-2',
  md: 'h-9 text-sm px-3',
  lg: 'h-10 text-base px-3',
}

export function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  thousandSeparator,
  decimalPlaces,
  min,
  max,
  step = 1,
  showStepper,
  disabled,
  readOnly,
  placeholder = '0',
  size = 'md',
  align = 'right',
  className,
  onBlur,
}: NumberInputProps) {
  const [editing, setEditing] = useState(false)
  const [editStr, setEditStr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const clamp = useCallback(
    (v: number | null) => {
      if (v === null) return null
      if (min !== undefined && v < min) return min
      if (max !== undefined && v > max) return max
      return v
    },
    [min, max],
  )

  const startEdit = () => {
    if (disabled || readOnly) return
    setEditing(true)
    setEditStr(value !== null && value !== undefined ? String(value) : '')
  }

  const finishEdit = () => {
    setEditing(false)
    const parsed = parseNumber(editStr)
    onChange?.(clamp(parsed))
    onBlur?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      finishEdit()
      inputRef.current?.blur()
    }
    if (e.key === 'Escape') {
      setEditing(false)
      inputRef.current?.blur()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const current = value ?? 0
      onChange?.(clamp(current + step))
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const current = value ?? 0
      onChange?.(clamp(current - step))
    }
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const stepUp = () => { const v = (value ?? 0) + step; onChange?.(clamp(v)) }
  const stepDown = () => { const v = (value ?? 0) - step; onChange?.(clamp(v)) }

  const displayValue = formatNumber(value, thousandSeparator, decimalPlaces)
  const isEmpty = value === null || value === undefined

  const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' }

  return (
    <div
      className={cn(
        'relative flex items-center rounded-md border border-input bg-background transition-colors',
        'focus-within:ring-1 focus-within:ring-ring',
        disabled && 'opacity-50 cursor-not-allowed',
        sizeMap[size],
        className,
      )}
    >
      {prefix && (
        <span className="text-muted-foreground flex-shrink-0 mr-1">{prefix}</span>
      )}

      {editing ? (
        <input
          ref={inputRef}
          value={editStr}
          onChange={(e) => setEditStr(e.target.value)}
          onBlur={finishEdit}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex-1 min-w-0 bg-transparent outline-none',
            alignClass[align],
          )}
          placeholder={placeholder}
          disabled={disabled}
          inputMode="decimal"
        />
      ) : (
        <div
          onClick={startEdit}
          className={cn(
            'flex-1 min-w-0 truncate',
            alignClass[align],
            !readOnly && !disabled && 'cursor-text',
            isEmpty && 'text-muted-foreground',
          )}
        >
          {isEmpty ? placeholder : displayValue}
        </div>
      )}

      {suffix && (
        <span className="text-muted-foreground flex-shrink-0 ml-1">{suffix}</span>
      )}

      {showStepper && !disabled && !readOnly && (
        <div className="flex flex-col ml-1 -mr-1">
          <button
            type="button"
            onClick={stepUp}
            className="h-3.5 px-0.5 flex items-center justify-center hover:bg-muted rounded-sm transition-colors"
            tabIndex={-1}
          >
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={stepDown}
            className="h-3.5 px-0.5 flex items-center justify-center hover:bg-muted rounded-sm transition-colors"
            tabIndex={-1}
          >
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  )
}
