import React from 'react'
import { cn } from '@/lib/utils'
import { Badge } from './badge'
import {
  CheckCircle2, AlertCircle, XCircle, Clock, Minus,
  type LucideIcon,
} from 'lucide-react'

/* ── StatusBadge ─────────────────────────────────────
 *  상태별 색상이 자동 적용되는 뱃지
 *
 *  베리에이션:
 *    variant: 'filled' | 'outline' | 'subtle' | 'dot'
 *    size: 'xs' | 'sm' | 'md'
 *    icon: 자동 or 커스텀
 *
 *  사용법:
 *    <StatusBadge status="success">완료</StatusBadge>
 *    <StatusBadge status="warning" variant="outline">대기</StatusBadge>
 *    <StatusBadge status="error" size="xs" showIcon>실패</StatusBadge>
 *    <StatusBadge status="info" variant="dot">진행중</StatusBadge>
 * ──────────────────────────────────────────────────── */

export type StatusType = 'success' | 'warning' | 'error' | 'info' | 'neutral'
type Variant = 'filled' | 'outline' | 'subtle' | 'dot'
type Size = 'xs' | 'sm' | 'md'

const statusColors: Record<StatusType, { bg: string; text: string; border: string; dot: string }> = {
  success: { bg: 'bg-[#e6f7f5]', text: 'text-[#1a7a72]', border: 'border-[#b3e6e0]', dot: 'bg-[#2a9d99]' },
  warning: { bg: 'bg-[#fef3e5]', text: 'text-[#b44d00]', border: 'border-[#f5d0a9]', dot: 'bg-[#dd5b00]' },
  error:   { bg: 'bg-[#fde8e8]', text: 'text-[#c33]', border: 'border-[#f5b3b3]', dot: 'bg-[#e5484d]' },
  info:    { bg: 'bg-[#f2f9ff]', text: 'text-[#097fe8]', border: 'border-[#b3d9f7]', dot: 'bg-[#0075de]' },
  neutral: { bg: 'bg-[#f4f3f2]', text: 'text-[#615d59]', border: 'border-[#d4d2cf]', dot: 'bg-[#a39e98]' },
}

const statusIcons: Record<StatusType, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertCircle,
  error: XCircle,
  info: Clock,
  neutral: Minus,
}

const sizeMap: Record<Size, { badge: string; icon: string; dot: string }> = {
  xs: { badge: 'text-[10px] px-1.5 py-0', icon: 'h-2.5 w-2.5', dot: 'h-1.5 w-1.5' },
  sm: { badge: 'text-xs px-2 py-0.5', icon: 'h-3 w-3', dot: 'h-2 w-2' },
  md: { badge: 'text-sm px-2.5 py-1', icon: 'h-3.5 w-3.5', dot: 'h-2 w-2' },
}

interface StatusBadgeProps {
  status: StatusType
  children: React.ReactNode
  /** 스타일 변형: filled(기본), outline(테두리만), subtle(더 연한), dot(왼쪽 점) */
  variant?: Variant
  /** 크기: xs, sm(기본), md */
  size?: Size
  /** 아이콘 표시 여부 */
  showIcon?: boolean
  /** 커스텀 아이콘 (showIcon이 true일 때 기본 아이콘 대신 사용) */
  icon?: LucideIcon
  className?: string
}

export function StatusBadge({
  status,
  children,
  variant = 'filled',
  size = 'sm',
  showIcon,
  icon,
  className,
}: StatusBadgeProps) {
  const colors = statusColors[status]
  const sizes = sizeMap[size]
  const Icon = icon ?? statusIcons[status]

  const variantStyles: Record<Variant, string> = {
    filled: cn(colors.bg, colors.text, 'hover:' + colors.bg),
    outline: cn('bg-transparent border', colors.border, colors.text),
    subtle: cn(colors.bg + '/50', colors.text),
    dot: cn('bg-transparent', colors.text, 'pl-0'),
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        'font-normal inline-flex items-center gap-1',
        sizes.badge,
        variantStyles[variant],
        className,
      )}
    >
      {variant === 'dot' && (
        <span className={cn('rounded-full flex-shrink-0', sizes.dot, colors.dot)} />
      )}
      {showIcon && variant !== 'dot' && (
        <Icon className={cn('flex-shrink-0', sizes.icon)} />
      )}
      {children}
    </Badge>
  )
}
