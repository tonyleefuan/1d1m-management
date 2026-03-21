'use client'

import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, X, Plus, GripVertical, Pencil, Trash2, Check, Search } from 'lucide-react'

/* ── SmartSelect ─────────────────────────────────────
 *  다양한 형태의 드롭다운 셀렉트 컴포넌트
 *
 *  사용법:
 *    // 1. 기본 선택
 *    <SmartSelect
 *      options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
 *      value={val}
 *      onChange={setVal}
 *    />
 *
 *    // 2. 검색 가능
 *    <SmartSelect options={options} value={val} onChange={setVal} searchable />
 *
 *    // 3. 멀티 선택
 *    <SmartSelect options={options} value={vals} onChange={setVals} multiple />
 *
 *    // 4. 추가/수정/삭제 가능 (관리 모드)
 *    <SmartSelect
 *      options={options}
 *      value={val}
 *      onChange={setVal}
 *      manageable
 *      onAdd={(label) => addOption(label)}
 *      onEdit={(value, newLabel) => editOption(value, newLabel)}
 *      onDelete={(value) => deleteOption(value)}
 *      onReorder={(values) => reorderOptions(values)}
 *    />
 *
 *    // 5. 색상 있는 옵션
 *    <SmartSelect
 *      options={[{ value: 'a', label: 'A', color: '#2959FD' }]}
 *      value={val}
 *      onChange={setVal}
 *    />
 * ──────────────────────────────────────────────────── */

export interface SelectOption {
  value: string
  label: string
  color?: string
  description?: string
}

interface SmartSelectProps {
  options: SelectOption[]
  /** 단일: string, 다중: string[] */
  value?: string | string[]
  onChange?: (value: string | string[]) => void
  placeholder?: string
  /** 검색 가능 */
  searchable?: boolean
  /** 다중 선택 */
  multiple?: boolean
  /** 관리 모드 (추가/수정/삭제/정렬) */
  manageable?: boolean
  onAdd?: (label: string, description?: string) => void
  onEdit?: (value: string, newLabel: string, newDescription?: string) => void
  onDelete?: (value: string) => void
  onReorder?: (values: string[]) => void
  /** 비활성 */
  disabled?: boolean
  /** 크기 */
  size?: 'sm' | 'md'
  className?: string
}

export function SmartSelect({
  options,
  value,
  onChange,
  placeholder = '선택...',
  searchable,
  multiple,
  manageable,
  onAdd,
  onEdit,
  onDelete,
  onReorder,
  disabled,
  size = 'md',
  className,
}: SmartSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [addMode, setAddMode] = useState(false)
  const [addValue, setAddValue] = useState('')
  const [addDesc, setAddDesc] = useState('')
  const [editingValue, setEditingValue] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); setAddMode(false); setEditingValue(null) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open && searchable && searchRef.current) searchRef.current.focus()
  }, [open, searchable])

  useEffect(() => {
    if (addMode && addRef.current) addRef.current.focus()
  }, [addMode])

  const hasDescriptions = options.some((o) => o.description)
  const selectedValues = multiple ? (Array.isArray(value) ? value : []) : (value ? [value as string] : [])
  const selectedOptions = options.filter((o) => selectedValues.includes(o.value))
  const filtered = options.filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase()) || (o.description && o.description.toLowerCase().includes(search.toLowerCase())))

  const toggleOption = (optValue: string) => {
    if (multiple) {
      const arr = Array.isArray(value) ? [...value] : []
      const idx = arr.indexOf(optValue)
      if (idx >= 0) arr.splice(idx, 1)
      else arr.push(optValue)
      onChange?.(arr)
    } else {
      onChange?.(optValue)
      setOpen(false)
      setSearch('')
    }
  }

  const removeValue = (optValue: string) => {
    if (multiple) {
      const arr = (Array.isArray(value) ? value : []).filter((v) => v !== optValue)
      onChange?.(arr)
    } else {
      onChange?.('')
    }
  }

  const handleAdd = () => {
    if (addValue.trim()) {
      onAdd?.(addValue.trim(), addDesc.trim() || undefined)
      setAddValue('')
      setAddDesc('')
      setAddMode(false)
    }
  }

  const handleEdit = (val: string) => {
    if (editLabel.trim()) {
      onEdit?.(val, editLabel.trim(), editDesc.trim() || undefined)
      setEditingValue(null)
    }
  }

  const sizeClass = size === 'sm' ? 'text-xs min-h-[32px] px-2' : 'text-sm min-h-[36px] px-3'

  // 표시 텍스트
  const displayContent = () => {
    if (multiple && selectedOptions.length > 0) {
      return (
        <div className="flex flex-wrap gap-1">
          {selectedOptions.map((o) => (
            <span key={o.value} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              {o.color && <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: o.color }} />}
              {o.label}
              <X className="h-3 w-3 cursor-pointer hover:text-hh-red" onClick={(e) => { e.stopPropagation(); removeValue(o.value) }} />
            </span>
          ))}
        </div>
      )
    }
    if (!multiple && selectedOptions.length > 0) {
      const o = selectedOptions[0]
      return (
        <span className="flex items-center gap-1.5">
          {o.color && <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: o.color }} />}
          {o.label}
        </span>
      )
    }
    return <span className="text-muted-foreground">{placeholder}</span>
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* 트리거 */}
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'flex items-center justify-between gap-2 w-full rounded-md border border-input bg-background transition-colors hover:bg-muted/50',
          sizeClass,
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <div className="flex-1 text-left">{displayContent()}</div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border bg-popover shadow-dropdown max-h-[300px] flex flex-col">
          {/* 검색 */}
          {searchable && (
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="검색..."
                  className="w-full pl-7 pr-2 py-1.5 text-sm border-0 bg-transparent focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* 옵션 목록 */}
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">결과 없음</div>
            )}
            {filtered.map((opt) => {
              const isSelected = selectedValues.includes(opt.value)
              const isEditing = editingValue === opt.value

              if (isEditing) {
                return (
                  <div key={opt.value} className="flex items-center gap-1 px-2 py-1">
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(opt.value); if (e.key === 'Escape') setEditingValue(null) }}
                      className="flex-1 text-sm border rounded px-2 py-1"
                      placeholder="이름"
                      autoFocus
                    />
                    {hasDescriptions && (
                      <input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(opt.value); if (e.key === 'Escape') setEditingValue(null) }}
                        className="w-24 text-xs border rounded px-2 py-1 text-muted-foreground"
                        placeholder="설명"
                      />
                    )}
                    <button onClick={() => handleEdit(opt.value)} className="p-1 hover:bg-muted rounded"><Check className="h-3.5 w-3.5 text-emerald-600" /></button>
                    <button onClick={() => setEditingValue(null)} className="p-1 hover:bg-muted rounded"><X className="h-3.5 w-3.5" /></button>
                  </div>
                )
              }

              return (
                <div
                  key={opt.value}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors group',
                    isSelected ? 'bg-primary/5 text-primary' : 'hover:bg-muted',
                  )}
                  onClick={() => toggleOption(opt.value)}
                >
                  {manageable && <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />}
                  {multiple && (
                    <div className={cn('h-4 w-4 rounded border flex items-center justify-center flex-shrink-0', isSelected ? 'bg-primary border-primary' : 'border-input')}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                  )}
                  {opt.color && <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />}
                  <span className="flex-1">{opt.label}</span>
                  {opt.description && <span className="text-xs text-muted-foreground">{opt.description}</span>}
                  {!multiple && isSelected && <Check className="h-4 w-4 text-primary" />}
                  {manageable && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button onClick={(e) => { e.stopPropagation(); setEditingValue(opt.value); setEditLabel(opt.label); setEditDesc(opt.description ?? '') }} className="p-1 hover:bg-background rounded"><Pencil className="h-3 w-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); onDelete?.(opt.value) }} className="p-1 hover:bg-background rounded text-hh-red"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 추가 */}
          {manageable && (
            <div className="border-t p-2">
              {addMode ? (
                <div className="flex items-center gap-1">
                  <input
                    ref={addRef}
                    value={addValue}
                    onChange={(e) => setAddValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAddMode(false); setAddDesc('') } }}
                    placeholder="새 항목..."
                    className="flex-1 text-sm border rounded px-2 py-1"
                  />
                  {hasDescriptions && (
                    <input
                      value={addDesc}
                      onChange={(e) => setAddDesc(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAddMode(false); setAddDesc('') } }}
                      placeholder="설명"
                      className="w-24 text-xs border rounded px-2 py-1 text-muted-foreground"
                    />
                  )}
                  <button onClick={handleAdd} className="p-1 hover:bg-muted rounded"><Check className="h-3.5 w-3.5 text-emerald-600" /></button>
                  <button onClick={() => { setAddMode(false); setAddDesc('') }} className="p-1 hover:bg-muted rounded"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <button onClick={() => setAddMode(true)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-full px-2 py-1">
                  <Plus className="h-3.5 w-3.5" /> 항목 추가
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
