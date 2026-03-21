'use client'

import React, { useRef, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'

/* ── TruncateText ───────────────────────────────────
 *  말줄임 + 호버 시 전체 텍스트 툴팁
 *
 *  사용법:
 *    // 기본 (1줄 말줄임)
 *    <TruncateText>아주 긴 상품명이 여기에 들어갑니다</TruncateText>
 *
 *    // 최대 너비 지정
 *    <TruncateText maxWidth={200}>긴 텍스트</TruncateText>
 *
 *    // 여러 줄 말줄임
 *    <TruncateText lines={2}>
 *      아주 긴 설명 텍스트가 여기에 들어갑니다. 두 줄까지만 표시됩니다.
 *    </TruncateText>
 *
 *    // 복사 가능
 *    <TruncateText copyable>HH-2401-BK-M-001</TruncateText>
 * ──────────────────────────────────────────────────── */

interface TruncateTextProps {
  children: string
  /** 최대 너비 (px) — 미지정 시 부모 너비 */
  maxWidth?: number
  /** 최대 줄 수 (기본 1) */
  lines?: number
  /** 복사 가능 여부 */
  copyable?: boolean
  /** 툴팁 비활성 (항상 말줄임만) */
  noTooltip?: boolean
  className?: string
}

export function TruncateText({
  children,
  maxWidth,
  lines = 1,
  copyable,
  noTooltip,
  className,
}: TruncateTextProps) {
  const textRef = useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const el = textRef.current
    if (!el) return
    if (lines > 1) {
      setIsTruncated(el.scrollHeight > el.clientHeight)
    } else {
      setIsTruncated(el.scrollWidth > el.clientWidth)
    }
  }, [children, maxWidth, lines])

  const handleCopy = async (e: React.MouseEvent) => {
    if (!copyable) return
    e.stopPropagation()
    await navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const textElement = (
    <span
      ref={textRef}
      className={cn(
        lines === 1
          ? 'block truncate'
          : 'block overflow-hidden',
        copyable && isTruncated && 'cursor-pointer',
        className,
      )}
      style={{
        ...(maxWidth ? { maxWidth } : {}),
        ...(lines > 1
          ? {
              display: '-webkit-box',
              WebkitLineClamp: lines,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            }
          : {}),
      }}
      onClick={copyable ? handleCopy : undefined}
    >
      {children}
    </span>
  )

  if (noTooltip || !isTruncated) return textElement

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{textElement}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[360px] break-words"
        >
          <p className="text-sm">{children}</p>
          {copyable && (
            <p className="text-xs text-muted-foreground mt-1">
              {copied ? '복사됨!' : '클릭하여 복사'}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
