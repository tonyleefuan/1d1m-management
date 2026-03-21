'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { Button } from './button'

/* ── ActionBar ──────────────────────────────────────
 *  테이블 하단 플로팅 액션바 — 체크박스 선택 시 나타남
 *
 *  사용법:
 *    <ActionBar
 *      count={selectedIds.length}
 *      onClose={() => setSelectedIds([])}
 *    >
 *      <Button size="sm" variant="outline" onClick={handleExport}>
 *        내보내기
 *      </Button>
 *      <Button size="sm" variant="destructive" onClick={handleDelete}>
 *        삭제
 *      </Button>
 *    </ActionBar>
 *
 *    // 커스텀 메시지
 *    <ActionBar
 *      count={3}
 *      message="{count}개 상품이 선택됨"
 *      onClose={clearSelection}
 *    >
 *      <Button size="sm">태그 일괄 추가</Button>
 *    </ActionBar>
 *
 *    // 위치 고정 (fixed) vs 상대 (relative)
 *    <ActionBar count={2} position="relative" onClose={clear}>
 *      ...
 *    </ActionBar>
 * ──────────────────────────────────────────────────── */

interface ActionBarProps {
  /** 선택된 항목 수 */
  count: number
  /** 선택 해제 콜백 */
  onClose: () => void
  /** 액션 버튼들 */
  children: React.ReactNode
  /** 커스텀 메시지 ({count}를 선택 수로 치환) */
  message?: string
  /** 위치: fixed(화면 하단) | relative(부모 기준) */
  position?: 'fixed' | 'relative'
  className?: string
}

export function ActionBar({
  count,
  onClose,
  children,
  message,
  position = 'fixed',
  className,
}: ActionBarProps) {
  if (count === 0) return null

  const displayMessage = message
    ? message.replace('{count}', String(count))
    : `${count}개 선택됨`

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-background shadow-modal px-4 py-3',
        position === 'fixed' && 'fixed bottom-6 left-1/2 -translate-x-1/2 z-40',
        position === 'relative' && 'mt-3',
        'animate-in slide-in-from-bottom-4 fade-in-0 duration-200',
        className,
      )}
    >
      {/* 선택 카운트 */}
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center h-6 min-w-[24px] rounded-full bg-primary text-primary-foreground text-xs font-medium px-1.5">
          {count}
        </span>
        <span className="text-sm font-medium whitespace-nowrap">{displayMessage}</span>
      </div>

      {/* 구분선 */}
      <div className="h-5 w-px bg-border" />

      {/* 액션 버튼들 */}
      <div className="flex items-center gap-2">
        {children}
      </div>

      {/* 닫기 */}
      <button
        onClick={onClose}
        className="ml-1 p-1 rounded-md hover:bg-muted transition-colors"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  )
}
