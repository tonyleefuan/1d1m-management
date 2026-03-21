'use client'

import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

/* ── Switch ─────────────────────────────────────
 *  토글 스위치 (Radix UI 기반)
 *
 *  사이즈:
 *    size="default" — 48×26px (기본)
 *    size="sm"      — 36×20px (테이블/설정 등 컴팩트 UI)
 *
 *  사용법:
 *    <Switch checked={value} onCheckedChange={setValue} />
 *    <Switch size="sm" checked={value} onCheckedChange={setValue} />
 * ──────────────────────────────────────────────────── */

const sizeStyles = {
  default: {
    root: 'h-[26px] w-[48px]',
    thumb: 'h-[22px] w-[22px] data-[state=checked]:translate-x-[22px]',
  },
  sm: {
    root: 'h-[18px] w-[32px]',
    thumb: 'h-[14px] w-[14px] data-[state=checked]:translate-x-[14px]',
  },
} as const

interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  size?: 'default' | 'sm'
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, size = 'default', ...props }, ref) => {
  const s = sizeStyles[size]
  return (
    <SwitchPrimitives.Root
      className={cn(
        'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-hh-blue data-[state=unchecked]:bg-[#8b8f99]',
        s.root,
        className,
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          'pointer-events-none block rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=unchecked]:translate-x-0',
          s.thumb,
        )}
      />
    </SwitchPrimitives.Root>
  )
})
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
