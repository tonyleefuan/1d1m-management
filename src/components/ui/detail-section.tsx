'use client'

import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Input } from './input'
import { Pencil } from 'lucide-react'

/* ── DetailSection / InfoRow ─────────────────────────
 *  모달/상세 페이지에서 라벨-값 쌍을 보여주는 컴포넌트
 *
 *  읽기 전용:
 *    <InfoRow label="상품코드" value="HH-2401" />
 *
 *  편집 가능:
 *    <InfoRow
 *      label="상품명"
 *      value={name}
 *      editable
 *      type="text"
 *      onChange={(v) => setName(v)}
 *    />
 *
 *    <InfoRow
 *      label="카테고리"
 *      value={category}
 *      editable
 *      type="select"
 *      options={[{ value: '아우터', label: '아우터' }, ...]}
 *      onChange={(v) => setCategory(v)}
 *    />
 * ──────────────────────────────────────────────────── */

interface DetailSectionProps {
  title?: string
  cols?: 1 | 2 | 3 | 4
  divider?: boolean
  children: React.ReactNode
  className?: string
}

const gridCols: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}

export function DetailSection({ title, cols = 2, divider, children, className }: DetailSectionProps) {
  return (
    <div className={cn(divider && 'border-t pt-4', className)}>
      {title && (
        <h3 className="text-sm font-semibold mb-3">{title}</h3>
      )}
      <div className={cn('grid gap-x-6 gap-y-3', gridCols[cols])}>
        {children}
      </div>
    </div>
  )
}

/* ── FormRow ──────────────────────────────────────────
 *  모달 폼에서 라벨 + 입력 필드를 감싸는 래퍼
 *  InfoRow는 "클릭→편집" (읽기 전용 상세)
 *  FormRow는 "항상 편집 가능" (폼 모달)
 *
 *    <DetailSection cols={2}>
 *      <FormRow label="PG 코드">
 *        <Input value={pgCode} onChange={...} />
 *      </FormRow>
 *      <FormRow label="공장">
 *        <Select ...>...</Select>
 *      </FormRow>
 *    </DetailSection>
 * ──────────────────────────────────────────────────── */

interface FormRowProps {
  label: string
  children: React.ReactNode
  /** 칼럼 전체 너비를 차지 (textarea, 테이블 등) */
  fullWidth?: boolean
  className?: string
}

export function FormRow({ label, children, fullWidth, className }: FormRowProps) {
  return (
    <div className={cn('space-y-1.5', fullWidth && 'col-span-full', className)}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

interface SelectOption {
  value: string
  label: string
}

interface InfoRowProps {
  label: string
  value: React.ReactNode
  layout?: 'vertical' | 'horizontal'
  emptyText?: string
  /** 편집 가능 여부 */
  editable?: boolean
  /** 편집 타입 */
  type?: 'text' | 'number' | 'select' | 'textarea' | 'date'
  /** select 타입일 때 옵션 목록 */
  options?: SelectOption[]
  /** 값 변경 콜백 */
  onChange?: (value: string) => void
  /** placeholder */
  placeholder?: string
  className?: string
}

export function InfoRow({
  label,
  value,
  layout = 'vertical',
  emptyText = '-',
  editable,
  type = 'text',
  options,
  onChange,
  placeholder,
  className,
}: InfoRowProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.select()
      }
    }
  }, [editing])

  const startEdit = () => {
    if (!editable) return
    setEditValue(typeof value === 'string' || typeof value === 'number' ? String(value) : '')
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    onChange?.(editValue)
  }

  const cancel = () => {
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') commit()
    if (e.key === 'Escape') cancel()
  }

  const displayValue = value ?? emptyText

  // 편집 모드 렌더
  const renderEditField = () => {
    if (type === 'select' && options) {
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={editValue}
          onChange={(e) => { setEditValue(e.target.value); onChange?.(e.target.value); setEditing(false) }}
          onBlur={cancel}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )
    }

    if (type === 'textarea') {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm resize-y"
          placeholder={placeholder}
        />
      )
    }

    return (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className="h-7 text-sm"
        placeholder={placeholder}
      />
    )
  }

  // Vertical 레이아웃
  if (layout === 'vertical') {
    return (
      <div className={cn('group', className)}>
        <span className="text-xs text-muted-foreground">{label}</span>
        {editing ? (
          <div className="mt-0.5">{renderEditField()}</div>
        ) : (
          <div
            className={cn(
              'mt-0.5 text-sm font-medium',
              editable && 'cursor-pointer rounded px-1 -mx-1 py-0.5 hover:bg-muted/50 transition-colors',
            )}
            onClick={startEdit}
          >
            <span className="flex items-center gap-1.5">
              {displayValue}
              {editable && (
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </span>
          </div>
        )}
      </div>
    )
  }

  // Horizontal 레이아웃
  return (
    <div className={cn('group flex items-start justify-between gap-4', className)}>
      <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
      {editing ? (
        <div className="flex-1 max-w-[300px]">{renderEditField()}</div>
      ) : (
        <span
          className={cn(
            'text-sm font-medium text-right',
            editable && 'cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50 transition-colors',
          )}
          onClick={startEdit}
        >
          <span className="flex items-center justify-end gap-1.5">
            {displayValue}
            {editable && (
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </span>
        </span>
      )}
    </div>
  )
}
