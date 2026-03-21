'use client'

import React, { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './dialog'
import { Button } from './button'
import { Spinner } from './spinner'
import { InlineBanner } from './inline-banner'
import { Check } from 'lucide-react'

/* ── WizardDialog ───────────────────────────────────
 *  다단계 위자드 다이얼로그 — 상품 등록, 설정 마법사 등
 *
 *  사용법:
 *    <WizardDialog
 *      open={showWizard}
 *      onClose={() => setShowWizard(false)}
 *      title="상품 등록"
 *      steps={[
 *        {
 *          label: '기본 정보',
 *          description: '상품명, 카테고리 등',
 *          content: <BasicInfoForm />,
 *          validate: () => !name ? '상품명을 입력하세요' : null,
 *        },
 *        {
 *          label: 'SKU 등록',
 *          content: <SkuForm />,
 *        },
 *        {
 *          label: '가격 설정',
 *          content: <PriceForm />,
 *        },
 *        {
 *          label: '완료',
 *          content: <CompleteSummary />,
 *        },
 *      ]}
 *      onComplete={handleComplete}
 *      completeLabel="등록 완료"
 *    />
 * ──────────────────────────────────────────────────── */

interface WizardStep {
  label: string
  description?: string
  content: React.ReactNode
  /** 다음 단계 전 검증 — 에러 메시지 반환 시 진행 차단 */
  validate?: () => string | null | Promise<string | null>
  /** 이 단계에서 "다음" 버튼 비활성 조건 */
  nextDisabled?: boolean
  /** 이 단계에서 뒤로가기 불가 */
  disableBack?: boolean
}

interface WizardDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  steps: WizardStep[]
  /** 마지막 단계 완료 콜백 */
  onComplete: () => void | Promise<void>
  /** 완료 버튼 텍스트 */
  completeLabel?: string
  /** 모달 크기 */
  size?: 'md' | 'lg' | 'xl'
  /** 초기 단계 (0-indexed) */
  initialStep?: number
  className?: string
}

const sizeMap: Record<string, string> = {
  md: 'max-w-[600px]',
  lg: 'max-w-[760px]',
  xl: 'max-w-[920px]',
}

export function WizardDialog({
  open,
  onClose,
  title,
  description,
  steps,
  onComplete,
  completeLabel = '완료',
  size = 'lg',
  initialStep = 0,
  className,
}: WizardDialogProps) {
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const step = steps[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1

  // 열릴 때 초기화
  React.useEffect(() => {
    if (open) {
      setCurrentStep(initialStep)
      setError(null)
      setLoading(false)
    }
  }, [open, initialStep])

  const goNext = useCallback(async () => {
    setError(null)
    if (step?.validate) {
      setLoading(true)
      try {
        const err = await step.validate()
        if (err) { setError(err); setLoading(false); return }
      } catch (e: any) {
        setError(e?.message ?? '검증 중 오류'); setLoading(false); return
      }
      setLoading(false)
    }
    setCurrentStep((s) => s + 1)
  }, [step])

  const goBack = useCallback(() => {
    setError(null)
    setCurrentStep((s) => Math.max(0, s - 1))
  }, [])

  const handleComplete = useCallback(async () => {
    setError(null)
    if (step?.validate) {
      setLoading(true)
      try {
        const err = await step.validate()
        if (err) { setError(err); setLoading(false); return }
      } catch (e: any) {
        setError(e?.message ?? '검증 중 오류'); setLoading(false); return
      }
    }
    setLoading(true)
    try {
      await onComplete()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? '완료 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }, [step, onComplete, onClose])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent
        className={cn(sizeMap[size], 'max-h-[85vh] flex flex-col gap-0 p-0', className)}
        onInteractOutside={(e) => loading && e.preventDefault()}
      >
        {/* 헤더 */}
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        </div>

        {/* 스텝 인디케이터 */}
        <div className="px-6 pb-4">
          <div className="flex items-center">
            {steps.map((s, i) => {
              const status = i < currentStep ? 'completed' : i === currentStep ? 'current' : 'upcoming'
              return (
                <React.Fragment key={i}>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'flex items-center justify-center h-7 w-7 rounded-full border-2 text-xs font-semibold transition-colors',
                      status === 'completed' && 'bg-emerald-500 border-emerald-500 text-white',
                      status === 'current' && 'bg-primary border-primary text-primary-foreground',
                      status === 'upcoming' && 'bg-background border-border text-muted-foreground',
                    )}>
                      {status === 'completed' ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <div>
                      <p className={cn(
                        'text-xs font-medium',
                        status === 'upcoming' && 'text-muted-foreground',
                      )}>
                        {s.label}
                      </p>
                    </div>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={cn(
                      'flex-1 h-0.5 mx-3',
                      i < currentStep ? 'bg-emerald-300' : 'bg-border',
                    )} />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* 에러 */}
        {error && (
          <div className="px-6 pb-2">
            <InlineBanner variant="error" size="sm" dismissible onDismiss={() => setError(null)}>
              {error}
            </InlineBanner>
          </div>
        )}

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 border-t">
          {step?.content}
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <div>
            {!isFirst && !step?.disableBack && (
              <Button variant="outline" onClick={goBack} disabled={loading}>
                이전
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading}>
              취소
            </Button>
            {isLast ? (
              <Button onClick={handleComplete} disabled={loading || step?.nextDisabled}>
                {loading ? <><Spinner size="xs" className="mr-1.5" />{completeLabel} 중...</> : completeLabel}
              </Button>
            ) : (
              <Button onClick={goNext} disabled={loading || step?.nextDisabled}>
                {loading ? <><Spinner size="xs" className="mr-1.5" />검증 중...</> : '다음'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
