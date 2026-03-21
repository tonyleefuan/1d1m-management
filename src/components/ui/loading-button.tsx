import React from 'react'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from './button'
import { Spinner } from './spinner'

/* ── LoadingButton ──────────────────────────────────
 *  로딩 상태가 내장된 버튼 — 저장/삭제 등 비동기 작업 시 사용
 *
 *  사용법:
 *    <LoadingButton loading={saving} onClick={handleSave}>
 *      저장
 *    </LoadingButton>
 *
 *    <LoadingButton
 *      loading={deleting}
 *      loadingText="삭제 중..."
 *      variant="destructive"
 *      onClick={handleDelete}
 *    >
 *      삭제
 *    </LoadingButton>
 *
 *    // 아이콘 + 텍스트
 *    <LoadingButton loading={submitting} icon={<Send className="h-4 w-4" />}>
 *      전송
 *    </LoadingButton>
 * ──────────────────────────────────────────────────── */

interface LoadingButtonProps extends ButtonProps {
  /** 로딩 상태 */
  loading?: boolean
  /** 로딩 중 텍스트 (생략 시 children 유지) */
  loadingText?: string
  /** 좌측 아이콘 (로딩 시 스피너로 교체) */
  icon?: React.ReactNode
}

export function LoadingButton({
  loading,
  loadingText,
  icon,
  children,
  disabled,
  className,
  size,
  ...props
}: LoadingButtonProps) {
  const spinnerSize = size === 'sm' ? 'sm' : size === 'lg' ? 'md' : 'sm'

  return (
    <Button
      disabled={loading || disabled}
      className={cn(loading && 'cursor-wait', className)}
      size={size}
      {...props}
    >
      {loading ? (
        <>
          <Spinner size={spinnerSize} className="mr-2" />
          {loadingText ?? children}
        </>
      ) : (
        <>
          {icon && <span className="mr-2">{icon}</span>}
          {children}
        </>
      )}
    </Button>
  )
}
