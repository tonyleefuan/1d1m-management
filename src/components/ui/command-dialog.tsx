'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent } from './dialog'
import { Search, ArrowRight, type LucideIcon } from 'lucide-react'

/* ── CommandDialog ──────────────────────────────────
 *  커맨드 팔레트 — Cmd+K로 열리는 전역 검색/빠른 액션
 *
 *  사용법:
 *    const [open, setOpen] = useState(false)
 *
 *    // Cmd+K 바인딩
 *    useEffect(() => {
 *      const handler = (e: KeyboardEvent) => {
 *        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
 *          e.preventDefault()
 *          setOpen(true)
 *        }
 *      }
 *      window.addEventListener('keydown', handler)
 *      return () => window.removeEventListener('keydown', handler)
 *    }, [])
 *
 *    <CommandDialog
 *      open={open}
 *      onClose={() => setOpen(false)}
 *      groups={[
 *        {
 *          label: '탭 이동',
 *          items: [
 *            { label: '상품 마스터', icon: Package, onSelect: () => setTab('product') },
 *            { label: '광고 운영', icon: BarChart2, onSelect: () => setTab('ads') },
 *          ],
 *        },
 *        {
 *          label: '빠른 액션',
 *          items: [
 *            { label: '새 발주 등록', icon: Plus, onSelect: () => setShowCreate(true) },
 *            { label: '상품 검색', icon: Search, onSelect: () => setShowSearch(true) },
 *          ],
 *        },
 *      ]}
 *      placeholder="메뉴 검색..."
 *    />
 * ──────────────────────────────────────────────────── */

interface CommandItem {
  label: string
  description?: string
  icon?: LucideIcon
  /** 키보드 단축키 표시 */
  shortcut?: string
  onSelect: () => void
  /** 비활성 */
  disabled?: boolean
}

interface CommandGroup {
  label: string
  items: CommandItem[]
}

interface CommandDialogProps {
  open: boolean
  onClose: () => void
  groups: CommandGroup[]
  placeholder?: string
  /** 빈 결과 메시지 */
  emptyMessage?: string
  className?: string
}

export function CommandDialog({
  open,
  onClose,
  groups,
  placeholder = '명령어 검색...',
  emptyMessage = '결과가 없습니다',
  className,
}: CommandDialogProps) {
  const [query, setQuery] = useState('')
  const [focusIndex, setFocusIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setQuery('')
      setFocusIndex(0)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // 필터링
  const filtered = useMemo(() => {
    if (!query.trim()) return groups
    const q = query.toLowerCase()
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.description?.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [groups, query])

  // 평탄화된 아이템 목록 (키보드 네비게이션용)
  const flatItems = useMemo(
    () => filtered.flatMap((g) => g.items),
    [filtered],
  )

  // 선택 실행
  const selectItem = useCallback(
    (item: CommandItem) => {
      if (item.disabled) return
      onClose()
      item.onSelect()
    },
    [onClose],
  )

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIndex((i) => Math.min(i + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatItems[focusIndex]) selectItem(flatItems[focusIndex])
    }
  }

  // 포커스 아이템 스크롤
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${focusIndex}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [focusIndex])

  let itemIndex = -1

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          'max-w-[560px] p-0 gap-0 overflow-hidden',
          'top-[20%] translate-y-0',
          className,
        )}
      >
        {/* 검색 입력 */}
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFocusIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* 결과 목록 */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            filtered.map((group) => (
              <div key={group.label}>
                <div className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  itemIndex++
                  const idx = itemIndex
                  const Icon = item.icon
                  const isFocused = idx === focusIndex

                  return (
                    <button
                      key={`${group.label}-${item.label}`}
                      data-index={idx}
                      onClick={() => selectItem(item)}
                      onMouseEnter={() => setFocusIndex(idx)}
                      disabled={item.disabled}
                      className={cn(
                        'flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors',
                        isFocused ? 'bg-accent text-accent-foreground' : 'text-foreground',
                        item.disabled && 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      {Icon && <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                      <div className="flex-1 text-left">
                        <span className="font-medium">{item.label}</span>
                        {item.description && (
                          <span className="ml-2 text-xs text-muted-foreground">{item.description}</span>
                        )}
                      </div>
                      {item.shortcut && (
                        <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-muted-foreground font-mono">
                          {item.shortcut}
                        </kbd>
                      )}
                      {isFocused && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* 하단 힌트 */}
        <div className="border-t px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border bg-muted font-mono">↑↓</kbd> 이동
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border bg-muted font-mono">↵</kbd> 선택
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border bg-muted font-mono">esc</kbd> 닫기
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
