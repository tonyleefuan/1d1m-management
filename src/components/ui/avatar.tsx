import React from 'react'
import { cn } from '@/lib/utils'

/* ── Avatar ─────────────────────────────────────
 *  사용자/브랜드 아바타 컴포넌트
 *
 *  사용법:
 *    <Avatar name="토니" />
 *    <Avatar name="Tony Lee" src="/avatar.jpg" size="lg" />
 *    <Avatar name="H" color="#2959FD" />
 *
 *    <AvatarGroup>
 *      <Avatar name="A" />
 *      <Avatar name="B" />
 *      <Avatar name="C" />
 *    </AvatarGroup>
 * ──────────────────────────────────────────────────── */

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

const sizeMap: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: 'h-6 w-6', text: 'text-[10px]' },
  sm: { container: 'h-8 w-8', text: 'text-xs' },
  md: { container: 'h-10 w-10', text: 'text-sm' },
  lg: { container: 'h-12 w-12', text: 'text-base' },
}

// 이름에서 고유한 색상 생성
function nameToColor(name: string): string {
  const colors = [
    '#2959FD', '#04D1AE', '#f59e0b', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

interface AvatarProps {
  name: string
  src?: string
  size?: AvatarSize
  /** 커스텀 배경색 (없으면 이름 기반 자동) */
  color?: string
  className?: string
}

export function Avatar({ name, src, size = 'sm', color, className }: AvatarProps) {
  const sizes = sizeMap[size]
  const bg = color ?? nameToColor(name)

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('rounded-full object-cover', sizes.container, className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium text-white flex-shrink-0',
        sizes.container,
        sizes.text,
        className,
      )}
      style={{ backgroundColor: bg }}
      title={name}
    >
      {getInitials(name)}
    </div>
  )
}

interface AvatarGroupProps {
  children: React.ReactNode
  /** 최대 표시 개수 (나머지는 +N) */
  max?: number
  size?: AvatarSize
  className?: string
}

export function AvatarGroup({ children, max, size = 'sm', className }: AvatarGroupProps) {
  const items = React.Children.toArray(children)
  const visible = max ? items.slice(0, max) : items
  const overflow = max ? items.length - max : 0

  return (
    <div className={cn('flex -space-x-2', className)}>
      {visible.map((child, i) => (
        <div key={i} className="ring-2 ring-background rounded-full">
          {child}
        </div>
      ))}
      {overflow > 0 && (
        <div className={cn(
          'inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-background font-medium',
          sizeMap[size].container,
          sizeMap[size].text,
        )}>
          +{overflow}
        </div>
      )}
    </div>
  )
}
