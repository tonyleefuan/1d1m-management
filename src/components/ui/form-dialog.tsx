'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './dialog'
import { Button } from './button'
import { Spinner } from './spinner'
import { InlineBanner } from './inline-banner'

/* ── FormDialog ─────────────────────────────────────
 *  폼 전용 다이얼로그 — 제출/검증/로딩/에러 상태 내장
 *
 *  사용법:
 *    // 기본 (새로 만들기)
 *    <FormDialog
 *      open={showCreate}
 *      onClose={() => setShowCreate(false)}
 *      title="새 발주 등록"
 *      onSubmit={handleCreate}
 *    >
 *      <FormRow label="공장"><Select .../></FormRow>
 *      <FormRow label="발주일"><Input type="date" .../></FormRow>
 *    </FormDialog>
 *
 *    // 수정 (삭제 버튼 포함)
 *    <FormDialog
 *      open={!!editItem}
 *      onClose={() => setEditItem(null)}
 *      title="발주 수정"
 *      submitLabel="저장"
 *      onSubmit={handleUpdate}
 *      onDelete={handleDelete}
 *      deleteLabel="이 발주 삭제"
 *    >
 *      ...
 *    </FormDialog>
 *
 *    // 커스텀 검증
 *    <FormDialog
 *      open={open}
 *      onClose={close}
 *      title="가격 설정"
 *      validate={() => {
 *        if (!price) return '가격을 입력해주세요'
 *        return null
 *      }}
 *      onSubmit={handleSave}
 *    >
 *      ...
 *    </FormDialog>
 *
 *    // 넓은 폼 + 설명
 *    <FormDialog
 *      open={open}
 *      onClose={close}
 *      title="상품 등록"
 *      description="기본 정보를 입력해주세요"
 *      size="lg"
 *      onSubmit={handleCreate}
 *    >
 *      ...
 *    </FormDialog>
 * ──────────────────────────────────────────────────── */

interface FormDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  /** 제출 콜백 (비동기 가능) */
  onSubmit: () => void | Promise<void>
  /** 제출 버튼 텍스트 */
  submitLabel?: string
  /** 취소 버튼 텍스트 */
  cancelLabel?: string
  /** 삭제 콜백 (있으면 삭제 버튼 표시) */
  onDelete?: () => void | Promise<void>
  /** 삭제 버튼 텍스트 */
  deleteLabel?: string
  /** 검증 함수 — 에러 메시지 반환 시 제출 차단 */
  validate?: () => string | null
  /** 모달 크기 */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** 제출 버튼 비활성 */
  submitDisabled?: boolean
  /** 추가 푸터 액션 (취소/제출 사이) */
  extraActions?: React.ReactNode
  className?: string
}

const sizeMap: Record<string, string> = {
  sm: 'max-w-[420px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[900px]',
}

export function FormDialog({
  open,
  onClose,
  title,
  description,
  children,
  onSubmit,
  submitLabel = '저장',
  cancelLabel = '취소',
  onDelete,
  deleteLabel = '삭제',
  validate,
  size = 'md',
  submitDisabled,
  extraActions,
  className,
}: FormDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 모달 열릴 때 에러 상태 초기화
  useEffect(() => {
    if (open) setError(null)
  }, [open])

  const handleSubmit = useCallback(async () => {
    setError(null)
    if (validate) {
      const validationError = validate()
      if (validationError) {
        setError(validationError)
        return
      }
    }
    setSubmitting(true)
    try {
      await onSubmit()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? '저장 중 오류가 발생했습니다')
    } finally {
      setSubmitting(false)
    }
  }, [onSubmit, onClose, validate])

  const handleDelete = useCallback(async () => {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? '삭제 중 오류가 발생했습니다')
    } finally {
      setDeleting(false)
    }
  }, [onDelete, onClose])

  const handleOpenChange = (v: boolean) => {
    if (!v && !submitting && !deleting) {
      setError(null)
      onClose()
    }
  }

  const isLoading = submitting || deleting

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(sizeMap[size], 'max-h-[85vh] flex flex-col gap-0', className)}
        onInteractOutside={(e) => isLoading && e.preventDefault()}
      >
        {/* 헤더 */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {/* 에러 배너 */}
        {error && (
          <div className="px-6 pb-2">
            <InlineBanner variant="error" size="sm" dismissible onDismiss={() => setError(null)}>
              {error}
            </InlineBanner>
          </div>
        )}

        {/* 폼 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {children}
        </div>

        {/* 푸터 */}
        <DialogFooter className="px-6 pb-6 pt-4 border-t">
          <div className="flex items-center justify-between w-full">
            {/* 좌측: 삭제 버튼 */}
            <div>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-hh-red hover:text-hh-red hover:bg-red-50"
                  onClick={handleDelete}
                  disabled={isLoading}
                >
                  {deleting ? (
                    <><Spinner size="xs" className="mr-1.5" />삭제 중...</>
                  ) : (
                    deleteLabel
                  )}
                </Button>
              )}
            </div>
            {/* 우측: 취소 + 추가 액션 + 제출 */}
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} disabled={isLoading}>
                {cancelLabel}
              </Button>
              {extraActions}
              <Button
                onClick={handleSubmit}
                disabled={isLoading || submitDisabled}
              >
                {submitting ? (
                  <><Spinner size="xs" className="mr-1.5" />{submitLabel} 중...</>
                ) : (
                  submitLabel
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
