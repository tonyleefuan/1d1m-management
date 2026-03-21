import React from 'react'
import { cn } from '@/lib/utils'
import { Check, type LucideIcon } from 'lucide-react'

/* ── StepIndicator ──────────────────────────────────
 *  단계 진행 표시기 — 위자드, 프로세스 진행, 상품 라이프사이클 등
 *
 *  사용법:
 *    // 기본 (수평)
 *    <StepIndicator
 *      steps={[
 *        { label: '기본 정보' },
 *        { label: 'SKU 등록' },
 *        { label: '가격 설정' },
 *        { label: '완료' },
 *      ]}
 *      currentStep={1}
 *    />
 *
 *    // 아이콘 + 설명 포함
 *    <StepIndicator
 *      steps={[
 *        { label: '발주', description: 'PO 생성', icon: FileText },
 *        { label: '입고', description: '창고 도착' },
 *        { label: '검수', description: '품질 확인' },
 *        { label: '등록', description: '채널 등록' },
 *      ]}
 *      currentStep={2}
 *    />
 *
 *    // 수직 (vertical)
 *    <StepIndicator steps={steps} currentStep={1} orientation="vertical" />
 *
 *    // 콤팩트 (compact)
 *    <StepIndicator steps={steps} currentStep={2} variant="compact" />
 * ──────────────────────────────────────────────────── */

interface Step {
  label: string
  description?: string
  icon?: LucideIcon
}

interface StepIndicatorProps {
  steps: Step[]
  /** 현재 단계 (0-indexed) */
  currentStep: number
  /** 방향 */
  orientation?: 'horizontal' | 'vertical'
  /** 변형 */
  variant?: 'default' | 'compact'
  /** 클릭 이벤트 */
  onStepClick?: (index: number) => void
  className?: string
}

export function StepIndicator({
  steps,
  currentStep,
  orientation = 'horizontal',
  variant = 'default',
  onStepClick,
  className,
}: StepIndicatorProps) {
  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        {steps.map((step, i) => {
          const status = i < currentStep ? 'completed' : i === currentStep ? 'current' : 'upcoming'
          return (
            <React.Fragment key={i}>
              <button
                type="button"
                onClick={() => onStepClick?.(i)}
                disabled={!onStepClick}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  status === 'completed' && 'bg-emerald-100 text-emerald-800',
                  status === 'current' && 'bg-primary text-primary-foreground',
                  status === 'upcoming' && 'bg-muted text-muted-foreground',
                  onStepClick && 'cursor-pointer hover:opacity-80',
                )}
              >
                {status === 'completed' && <Check className="h-3 w-3" />}
                {step.label}
              </button>
              {i < steps.length - 1 && (
                <div className={cn('h-px w-4', i < currentStep ? 'bg-emerald-300' : 'bg-border')} />
              )}
            </React.Fragment>
          )
        })}
      </div>
    )
  }

  if (orientation === 'vertical') {
    return (
      <div className={cn('flex flex-col', className)}>
        {steps.map((step, i) => {
          const status = i < currentStep ? 'completed' : i === currentStep ? 'current' : 'upcoming'
          const Icon = step.icon
          return (
            <div key={i} className="flex gap-3">
              {/* 줄 + 원 */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => onStepClick?.(i)}
                  disabled={!onStepClick}
                  className={cn(
                    'flex items-center justify-center h-8 w-8 rounded-full border-2 transition-colors flex-shrink-0',
                    status === 'completed' && 'bg-emerald-500 border-emerald-500 text-white',
                    status === 'current' && 'bg-primary border-primary text-primary-foreground',
                    status === 'upcoming' && 'bg-background border-border text-muted-foreground',
                    onStepClick && 'cursor-pointer',
                  )}
                >
                  {status === 'completed' ? (
                    <Check className="h-4 w-4" />
                  ) : Icon ? (
                    <Icon className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-semibold">{i + 1}</span>
                  )}
                </button>
                {i < steps.length - 1 && (
                  <div className={cn('w-0.5 flex-1 min-h-[24px]', i < currentStep ? 'bg-emerald-300' : 'bg-border')} />
                )}
              </div>
              {/* 라벨 */}
              <div className={cn('pb-6', i === steps.length - 1 && 'pb-0')}>
                <p className={cn(
                  'text-sm font-medium mt-1.5',
                  status === 'upcoming' && 'text-muted-foreground',
                )}>
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // 수평 (기본)
  return (
    <div className={cn('flex items-start', className)}>
      {steps.map((step, i) => {
        const status = i < currentStep ? 'completed' : i === currentStep ? 'current' : 'upcoming'
        const Icon = step.icon
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center flex-1">
              <button
                type="button"
                onClick={() => onStepClick?.(i)}
                disabled={!onStepClick}
                className={cn(
                  'flex items-center justify-center h-8 w-8 rounded-full border-2 transition-colors',
                  status === 'completed' && 'bg-emerald-500 border-emerald-500 text-white',
                  status === 'current' && 'bg-primary border-primary text-primary-foreground',
                  status === 'upcoming' && 'bg-background border-border text-muted-foreground',
                  onStepClick && 'cursor-pointer',
                )}
              >
                {status === 'completed' ? (
                  <Check className="h-4 w-4" />
                ) : Icon ? (
                  <Icon className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-semibold">{i + 1}</span>
                )}
              </button>
              <p className={cn(
                'text-xs font-medium mt-2 text-center',
                status === 'upcoming' && 'text-muted-foreground',
              )}>
                {step.label}
              </p>
              {step.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5 text-center">{step.description}</p>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={cn(
                'h-0.5 flex-1 mt-4 mx-2',
                i < currentStep ? 'bg-emerald-300' : 'bg-border',
              )} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
