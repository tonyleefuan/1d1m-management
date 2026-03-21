import React from 'react'
import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'
import {
  Info, AlertTriangle, XCircle, CheckCircle2, X,
  type LucideIcon,
} from 'lucide-react'

/* ── InlineBanner ───────────────────────────────────
 *  페이지 내 인라인 알림 배너
 *
 *  사용법:
 *    <InlineBanner variant="info" title="안내">
 *      광고비 배분은 매일 자동 실행됩니다.
 *    </InlineBanner>
 *
 *    <InlineBanner variant="warning" title="주의">
 *      머지 프리즈 기간입니다. 비필수 작업은 자제해주세요.
 *    </InlineBanner>
 *
 *    <InlineBanner variant="error" dismissible onDismiss={() => setShow(false)}>
 *      API 연결 실패. 잠시 후 다시 시도해주세요.
 *    </InlineBanner>
 *
 *    <InlineBanner variant="success">
 *      저장되었습니다!
 *    </InlineBanner>
 *
 *    <InlineBanner variant="info" size="sm" compact>
 *      간단한 도움말 텍스트
 *    </InlineBanner>
 * ──────────────────────────────────────────────────── */

const bannerVariants = cva(
  'relative flex gap-3 rounded-lg border',
  {
    variants: {
      variant: {
        info: 'bg-blue-50 border-blue-200 text-blue-900',
        warning: 'bg-amber-50 border-amber-200 text-amber-900',
        error: 'bg-red-50 border-red-200 text-red-900',
        success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        neutral: 'bg-gray-50 border-gray-200 text-gray-900',
      },
      size: {
        sm: 'px-3 py-2 text-xs',
        md: 'px-4 py-3 text-sm',
        lg: 'px-5 py-4 text-sm',
      },
    },
    defaultVariants: {
      variant: 'info',
      size: 'md',
    },
  },
)

const iconMap: Record<string, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  success: CheckCircle2,
  neutral: Info,
}

const iconColorMap: Record<string, string> = {
  info: 'text-blue-600',
  warning: 'text-amber-600',
  error: 'text-red-600',
  success: 'text-emerald-600',
  neutral: 'text-gray-500',
}

interface InlineBannerProps extends VariantProps<typeof bannerVariants> {
  /** 제목 (선택) */
  title?: string
  children: React.ReactNode
  /** 커스텀 아이콘 */
  icon?: LucideIcon
  /** 아이콘 숨기기 */
  hideIcon?: boolean
  /** 닫기 버튼 표시 */
  dismissible?: boolean
  /** 닫기 콜백 */
  onDismiss?: () => void
  /** 우측 액션 영역 */
  action?: React.ReactNode
  /** 아이콘 + 텍스트 한 줄 (compact 모드) */
  compact?: boolean
  className?: string
}

export function InlineBanner({
  variant = 'info',
  size = 'md',
  title,
  children,
  icon,
  hideIcon,
  dismissible,
  onDismiss,
  action,
  compact,
  className,
}: InlineBannerProps) {
  const Icon = icon ?? iconMap[variant ?? 'info']
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  if (compact) {
    return (
      <div className={cn(bannerVariants({ variant, size }), 'items-center', className)}>
        {!hideIcon && <Icon className={cn(iconSize, 'flex-shrink-0', iconColorMap[variant ?? 'info'])} />}
        <div className="flex-1">{children}</div>
        {action}
        {dismissible && (
          <button onClick={onDismiss} className="p-0.5 rounded hover:bg-black/5 transition-colors">
            <X className={cn(iconSize, 'opacity-60')} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={cn(bannerVariants({ variant, size }), className)}>
      {!hideIcon && (
        <Icon className={cn(iconSize, 'flex-shrink-0 mt-0.5', iconColorMap[variant ?? 'info'])} />
      )}
      <div className="flex-1 min-w-0">
        {title && (
          <p className="font-medium mb-0.5">{title}</p>
        )}
        <div className={cn(title && 'opacity-80')}>{children}</div>
      </div>
      {action && <div className="flex-shrink-0 self-center">{action}</div>}
      {dismissible && (
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 p-1 rounded hover:bg-black/5 transition-colors"
        >
          <X className="h-3.5 w-3.5 opacity-60" />
        </button>
      )}
    </div>
  )
}
