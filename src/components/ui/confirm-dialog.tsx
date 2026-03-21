'use client'

import React, { useState, useCallback } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './alert-dialog'
import { buttonVariants } from './button'
import { cn } from '@/lib/utils'
import { AlertTriangle, Trash2, Info, type LucideIcon } from 'lucide-react'

/* ── ConfirmDialog ──────────────────────────────────
 *  window.confirm() 대체 — AlertDialog 기반 확인 모달
 *
 *  사용법 1: 컴포넌트로 직접 사용
 *    <ConfirmDialog
 *      open={showDelete}
 *      onOpenChange={setShowDelete}
 *      title="발주 삭제"
 *      description="PO-2401-001을 삭제하시겠습니까?"
 *      variant="destructive"
 *      onConfirm={handleDelete}
 *    />
 *
 *  사용법 2: 훅으로 사용
 *    const { confirm, ConfirmDialogElement } = useConfirmDialog()
 *
 *    const handleDelete = async () => {
 *      const ok = await confirm({
 *        title: '삭제 확인',
 *        description: '정말 삭제할까요?',
 *        variant: 'destructive',
 *      })
 *      if (ok) { ... }
 *    }
 *
 *    // JSX에 반드시 포함
 *    return <>{ConfirmDialogElement}</>
 * ──────────────────────────────────────────────────── */

type ConfirmVariant = 'default' | 'destructive' | 'warning'

const variantConfig: Record<ConfirmVariant, {
  icon: LucideIcon
  iconClass: string
  bgClass: string
  actionClass: string
  defaultConfirmLabel: string
}> = {
  default: {
    icon: Info,
    iconClass: 'text-blue-600',
    bgClass: 'bg-blue-100',
    actionClass: '',
    defaultConfirmLabel: '확인',
  },
  destructive: {
    icon: Trash2,
    iconClass: 'text-red-600',
    bgClass: 'bg-red-100',
    actionClass: buttonVariants({ variant: 'destructive' }),
    defaultConfirmLabel: '삭제',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-600',
    bgClass: 'bg-amber-100',
    actionClass: 'bg-amber-600 text-white hover:bg-amber-700',
    defaultConfirmLabel: '계속',
  },
}

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** 스타일 변형 */
  variant?: ConfirmVariant
  /** 확인 버튼 텍스트 */
  confirmLabel?: string
  /** 취소 버튼 텍스트 */
  cancelLabel?: string
  /** 확인 콜백 */
  onConfirm: () => void | Promise<void>
  /** 확인 버튼 로딩 */
  loading?: boolean
  /** 확인 버튼 비활성화 (children 내 입력값 검증 등에 사용) */
  confirmDisabled?: boolean
  /** description 아래에 추가 콘텐츠 (예: 사유 입력 필드) */
  children?: React.ReactNode
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  variant = 'default',
  confirmLabel,
  cancelLabel = '취소',
  onConfirm,
  loading,
  confirmDisabled,
  children,
}: ConfirmDialogProps) {
  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className={cn('rounded-full p-2 flex-shrink-0', config.bgClass)}>
              <Icon className={cn('h-4 w-4', config.iconClass)} />
            </div>
            <div className="space-y-1.5 pt-0.5">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              {description && (
                <AlertDialogDescription>{description}</AlertDialogDescription>
              )}
            </div>
          </div>
        </AlertDialogHeader>
        {children && <div className="px-6 pb-2">{children}</div>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(config.actionClass)}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={loading || confirmDisabled}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                처리 중...
              </span>
            ) : (
              confirmLabel ?? config.defaultConfirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/* ── useConfirmDialog 훅 ────────────────────────── */

interface ConfirmOptions {
  title: string
  description?: string
  variant?: ConfirmVariant
  confirmLabel?: string
  cancelLabel?: string
}

export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean
    options: ConfirmOptions
    resolve: ((value: boolean) => void) | null
  }>({
    open: false,
    options: { title: '' },
    resolve: null,
  })

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, options, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state.resolve?.(true)
    setState((prev) => ({ ...prev, open: false, resolve: null }))
  }, [state.resolve])

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      state.resolve?.(false)
      setState((prev) => ({ ...prev, open: false, resolve: null }))
    }
  }, [state.resolve])

  const ConfirmDialogElement = (
    <ConfirmDialog
      open={state.open}
      onOpenChange={handleOpenChange}
      title={state.options.title}
      description={state.options.description}
      variant={state.options.variant}
      confirmLabel={state.options.confirmLabel}
      cancelLabel={state.options.cancelLabel}
      onConfirm={handleConfirm}
    />
  )

  return { confirm, ConfirmDialogElement }
}
