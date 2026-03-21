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
  success: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300', dot: 'bg-emerald-500' },
  warning: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300', dot: 'bg-amber-500' },
  error:   { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', dot: 'bg-red-500' },
  info:    { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', dot: 'bg-blue-500' },
  neutral: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300', dot: 'bg-gray-400' },
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
