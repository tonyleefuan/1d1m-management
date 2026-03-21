'use client'

import React, { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Check, Copy, type LucideIcon } from 'lucide-react'
import { Button, type ButtonProps } from './button'

/* ── CopyButton ─────────────────────────────────────
 *  클립보드 복사 버튼 — 코드/ID/URL 등 복사에 사용
 *
 *  사용법:
 *    // 아이콘만
 *    <CopyButton value="HH-2401-BK-M" />
 *
 *    // 텍스트 포함
 *    <CopyButton value={pgCode}>PG 코드 복사</CopyButton>
 *
 *    // 인라인 (텍스트 옆에)
 *    <span className="flex items-center gap-1">
 *      {pgCode}
 *      <CopyButton value={pgCode} variant="ghost" size="icon" />
 *    </span>
 *
 *    // 커스텀 성공 메시지
 *    <CopyButton value={url} successText="링크 복사됨!" />
 * ──────────────────────────────────────────────────── */

interface CopyButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** 복사할 값 */
  value: string
  /** 복사 성공 시 표시 텍스트 */
  successText?: string
  /** 복사 성공 지속 시간(ms) */
  successDuration?: number
  /** 복사 후 콜백 */
  onCopied?: () => void
}

export function CopyButton({
  value,
  successText,
  successDuration = 2000,
  onCopied,
  children,
  variant = 'outline',
  size = 'sm',
  className,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      onCopied?.()
      setTimeout(() => setCopied(false), successDuration)
    } catch {
      // fallback
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      onCopied?.()
      setTimeout(() => setCopied(false), successDuration)
    }
  }, [value, successDuration, onCopied])

  const isIconOnly = !children && size === 'icon'

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        copied && 'text-emerald-600',
        isIconOnly && 'h-7 w-7',
        className,
      )}
      onClick={handleCopy}
      {...props}
    >
      {copied ? (
        <>
          <Check className={cn('h-3.5 w-3.5', children && 'mr-1.5')} />
          {successText ?? (children ? '복사됨!' : null)}
        </>
      ) : (
        <>
          <Copy className={cn('h-3.5 w-3.5', children && 'mr-1.5')} />
          {children}
        </>
      )}
    </Button>
  )
}
