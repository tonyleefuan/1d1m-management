'use client'

import React, { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { X, Plus } from 'lucide-react'

/* ── TagInput ───────────────────────────────────────
 *  태그 입력 컴포넌트 — 태그 추가/삭제/자동완성
 *
 *  사용법:
 *    <TagInput
 *      value={['아우터', '겨울']}
 *      onChange={setTags}
 *      placeholder="태그 입력..."
 *    />
 *
 *    // 자동완성 + 최대 개수
 *    <TagInput
 *      value={tags}
 *      onChange={setTags}
 *      suggestions={['아우터', '이너', '팬츠', '원피스']}
 *      maxTags={5}
 *    />
 *
 *    // 컬러 태그
 *    <TagInput
 *      value={tags}
 *      onChange={setTags}
 *      variant="colored"
 *    />
 *
 *    // 읽기 전용
 *    <TagInput value={tags} readOnly />
 * ──────────────────────────────────────────────────── */

interface TagInputProps {
  value: string[]
  onChange?: (tags: string[]) => void
  placeholder?: string
  /** 자동완성 후보 목록 */
  suggestions?: string[]
  /** 최대 태그 수 */
  maxTags?: number
  /** 읽기 전용 */
  readOnly?: boolean
  /** 비활성화 */
  disabled?: boolean
  /** 태그 스타일 변형 */
  variant?: 'default' | 'colored' | 'outline'
  /** 크기 */
  size?: 'sm' | 'md'
  className?: string
}

const tagColors = [
  'bg-blue-100 text-blue-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-purple-100 text-purple-800',
  'bg-rose-100 text-rose-800',
  'bg-cyan-100 text-cyan-800',
  'bg-orange-100 text-orange-800',
  'bg-indigo-100 text-indigo-800',
]

function getTagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return tagColors[Math.abs(hash) % tagColors.length]
}

export function TagInput({
  value,
  onChange,
  placeholder = '태그 입력 후 Enter...',
  suggestions = [],
  maxTags,
  readOnly,
  disabled,
  variant = 'default',
  size = 'md',
  className,
}: TagInputProps) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [focusedSuggestion, setFocusedSuggestion] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filteredSuggestions = suggestions.filter(
    (s) => !value.includes(s) && s.toLowerCase().includes(input.toLowerCase()),
  )

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim()
      if (!trimmed || value.includes(trimmed)) return
      if (maxTags && value.length >= maxTags) return
      onChange?.([...value, trimmed])
      setInput('')
      setShowSuggestions(false)
      setFocusedSuggestion(-1)
    },
    [value, onChange, maxTags],
  )

  const removeTag = useCallback(
    (tag: string) => {
      onChange?.(value.filter((t) => t !== tag))
    },
    [value, onChange],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedSuggestion >= 0 && filteredSuggestions[focusedSuggestion]) {
        addTag(filteredSuggestions[focusedSuggestion])
      } else if (input.trim()) {
        addTag(input)
      }
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedSuggestion((prev) =>
        prev < filteredSuggestions.length - 1 ? prev + 1 : prev,
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedSuggestion((prev) => (prev > 0 ? prev - 1 : -1))
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setFocusedSuggestion(-1)
    }
  }

  const sizeClasses = size === 'sm'
    ? { container: 'min-h-[32px] px-2 py-1 gap-1', tag: 'text-[10px] px-1.5 py-0 gap-0.5', x: 'h-2.5 w-2.5', input: 'text-xs' }
    : { container: 'min-h-[36px] px-2.5 py-1.5 gap-1.5', tag: 'text-xs px-2 py-0.5 gap-1', x: 'h-3 w-3', input: 'text-sm' }

  const getTagClass = (tag: string) => {
    if (variant === 'colored') return getTagColor(tag)
    if (variant === 'outline') return 'border border-border text-foreground bg-transparent'
    return 'bg-muted text-foreground'
  }

  // 읽기 전용 모드
  if (readOnly) {
    return (
      <div className={cn('flex flex-wrap gap-1', className)}>
        {value.map((tag) => (
          <span key={tag} className={cn('inline-flex items-center rounded-full font-medium', sizeClasses.tag, getTagClass(tag))}>
            {tag}
          </span>
        ))}
        {value.length === 0 && <span className="text-sm text-muted-foreground">-</span>}
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        className={cn(
          'flex flex-wrap items-center rounded-md border border-input bg-background transition-colors',
          'focus-within:ring-1 focus-within:ring-ring',
          disabled && 'opacity-50 cursor-not-allowed',
          sizeClasses.container,
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className={cn(
              'inline-flex items-center rounded-full font-medium',
              sizeClasses.tag,
              getTagClass(tag),
            )}
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
                className="hover:opacity-70 transition-opacity"
              >
                <X className={sizeClasses.x} />
              </button>
            )}
          </span>
        ))}
        {(!maxTags || value.length < maxTags) && !disabled && (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setShowSuggestions(true)
              setFocusedSuggestion(-1)
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={value.length === 0 ? placeholder : ''}
            className={cn('flex-1 min-w-[80px] bg-transparent outline-none', sizeClasses.input)}
            disabled={disabled}
          />
        )}
      </div>

      {/* 자동완성 드롭다운 */}
      {showSuggestions && input && filteredSuggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border bg-popover shadow-dropdown max-h-[200px] overflow-y-auto py-1">
          {filteredSuggestions.map((suggestion, i) => (
            <button
              key={suggestion}
              type="button"
              className={cn(
                'flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-colors',
                i === focusedSuggestion ? 'bg-accent' : 'hover:bg-muted',
              )}
              onMouseDown={(e) => { e.preventDefault(); addTag(suggestion) }}
            >
              <Plus className="h-3 w-3 text-muted-foreground" />
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* 최대 태그 안내 */}
      {maxTags && (
        <p className={cn('mt-1 text-muted-foreground', size === 'sm' ? 'text-[10px]' : 'text-xs')}>
          {value.length}/{maxTags}
        </p>
      )}
    </div>
  )
}
