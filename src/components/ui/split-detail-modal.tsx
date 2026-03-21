'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './dialog'
import { Breadcrumb } from './breadcrumb'
import { Separator } from './separator'
import { Loading } from './skeleton'

/* ── SplitDetailModal ──────────────────────────────
 *  2열 레이아웃 상세 모달: 좌/우 패널이 독립 스크롤
 *
 *  사용법:
 *    <SplitDetailModal
 *      open={!!selected}
 *      onClose={() => setSelected(null)}
 *      title="HH-2401 오버사이즈 코트"
 *      left={<>
 *        <DetailSection>기본 정보...</DetailSection>
 *        <DetailSection>설명/번역...</DetailSection>
 *      </>}
 *      right={<>
 *        <div>SKU 관리 테이블</div>
 *        <div>가격 관리 테이블</div>
 *      </>}
 *      footer={<Button>저장</Button>}
 *    />
 *
 *    // 좌측 패널 비율 조정 (기본 5:5)
 *    <SplitDetailModal split="4:6" ... />
 *    <SplitDetailModal split="6:4" ... />
 *
 *    // 우측에 제목 추가
 *    <SplitDetailModal rightHeader={<h3>SKU 관리</h3>} ... />
 * ──────────────────────────────────────────────────── */

interface BreadcrumbItem {
  label: string
  onClick?: () => void
}

export interface SplitDetailModalProps {
  open: boolean
  onClose: () => void
  /** 제목 — 문자열 또는 ReactNode */
  title: React.ReactNode
  subtitle?: string
  /** 접근성용 설명 (sr-only) */
  description?: string
  /** 경로 표시 (선택) */
  breadcrumb?: BreadcrumbItem[]
  /** 좌측 패널 콘텐츠 */
  left: React.ReactNode
  /** 우측 패널 콘텐츠 */
  right: React.ReactNode
  /** 좌측 패널 상단 고정 헤더 (선택) */
  leftHeader?: React.ReactNode
  /** 우측 패널 상단 고정 헤더 (선택) */
  rightHeader?: React.ReactNode
  /** 전체 모달 하단 액션 */
  footer?: React.ReactNode
  /** 로딩 상태 */
  loading?: boolean
  loadingMessage?: string
  /** 에러 상태 */
  error?: string
  /** 좌:우 비율 — '4:6' | '5:5' | '6:4' (기본 '5:5') */
  split?: '4:6' | '5:5' | '6:4'
  /** 모달 너비: lg(800), xl(960), full(95vw) */
  size?: 'lg' | 'xl' | 'full'
  className?: string
}

const sizeMap: Record<string, string> = {
  lg: 'max-w-[800px]',
  xl: 'max-w-[960px]',
  full: 'max-w-[95vw]',
}

const splitMap: Record<string, [string, string]> = {
  '4:6': ['w-[40%]', 'w-[60%]'],
  '5:5': ['w-1/2', 'w-1/2'],
  '6:4': ['w-[60%]', 'w-[40%]'],
}

export function SplitDetailModal({
  open,
  onClose,
  title,
  subtitle,
  description,
  breadcrumb,
  left,
  right,
  leftHeader,
  rightHeader,
  footer,
  loading,
  loadingMessage = '불러오는 중...',
  error,
  split = '5:5',
  size = 'full',
  className,
}: SplitDetailModalProps) {
  const [leftW, rightW] = splitMap[split] || splitMap['5:5']

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={cn(sizeMap[size], 'p-0 gap-0 max-h-[85vh] flex flex-col', className)}>
        {/* ── 헤더 ── */}
        <div className="px-6 pt-6 pb-4 flex-shrink-0">
          {breadcrumb && breadcrumb.length > 0 && (
            <Breadcrumb items={breadcrumb} className="mb-2" />
          )}
          <DialogHeader>
            <DialogTitle className={cn('text-lg', typeof title !== 'string' && 'flex items-center gap-2.5')}>
              {title}
            </DialogTitle>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
            {description && (
              <DialogDescription className="sr-only">{description}</DialogDescription>
            )}
          </DialogHeader>
        </div>

        {/* ── 로딩 / 에러 ── */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loading message={loadingMessage} />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : (
          /* ── 2열 콘텐츠 ── */
          <div className="flex flex-1 min-h-0 border-t">
            {/* 좌측 패널 */}
            <div className={cn('flex flex-col min-h-0 border-r', leftW)}>
              {leftHeader && (
                <div className="px-5 py-3 border-b bg-muted/30 flex-shrink-0">
                  {leftHeader}
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {left}
              </div>
            </div>

            {/* 우측 패널 */}
            <div className={cn('flex flex-col min-h-0', rightW)}>
              {rightHeader && (
                <div className="px-5 py-3 border-b bg-muted/30 flex-shrink-0">
                  {rightHeader}
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {right}
              </div>
            </div>
          </div>
        )}

        {/* ── 하단 액션 ── */}
        {footer && !loading && !error && (
          <>
            <Separator />
            <div className="px-6 py-4 flex items-center justify-end gap-2 flex-shrink-0">
              {footer}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
