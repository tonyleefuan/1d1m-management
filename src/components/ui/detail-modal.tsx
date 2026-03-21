'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './dialog'
import { Breadcrumb } from './breadcrumb'
import { Separator } from './separator'
import { Loading } from './skeleton'

/* ── DetailModal ─────────────────────────────────────
 *  테이블 행 클릭 → 상세 보기 모달
 *  Breadcrumb + 제목 + 탭 + 콘텐츠 + 하단 액션
 *
 *  사용법:
 *    <DetailModal
 *      open={!!selected}
 *      onClose={() => setSelected(null)}
 *      title="HH-2401 오버사이즈 코트"
 *      breadcrumb={[{ label: '상품 마스터' }, { label: 'HH-2401' }]}
 *      tabs={[
 *        { label: '기본 정보', content: <BasicInfo />, footer: <Button>저장</Button> },
 *        { label: 'SKU', count: 8, content: <SkuTable /> },
 *        { label: '이력', content: <Timeline /> },
 *      ]}
 *    />
 *
 *    // ReactNode title (브랜드 dot + 배지 등)
 *    <DetailModal
 *      open={open}
 *      onClose={onClose}
 *      title={<><BrandDot /> 오버사이즈 코트 <Badge>22159</Badge></>}
 *      subtitle="Havehad · 아우터"
 *    />
 *
 *    // 로딩 + 에러 상태
 *    <DetailModal open={open} onClose={onClose} title="주문 상세"
 *      loading={isLoading} error={!data ? '불러올 수 없습니다' : undefined}
 *    >
 *      <DetailSection>...</DetailSection>
 *    </DetailModal>
 * ──────────────────────────────────────────────────── */

export interface DetailModalTab {
  label: string
  count?: number
  content: React.ReactNode
  /** 탭별 하단 액션 (탭마다 다른 저장 버튼 등) */
  footer?: React.ReactNode
}

interface BreadcrumbItem {
  label: string
  onClick?: () => void
}

interface DetailModalProps {
  open: boolean
  onClose: () => void
  /** 제목 — 문자열 또는 ReactNode (브랜드 dot + 배지 등) */
  title: React.ReactNode
  subtitle?: string
  /** 접근성용 설명 (sr-only). title이 ReactNode일 때 사용 권장 */
  description?: string
  /** 경로 표시 (선택) */
  breadcrumb?: BreadcrumbItem[]
  /** 탭이 있으면 탭 모드, 없으면 children 표시 */
  tabs?: DetailModalTab[]
  /** 탭 없을 때 직접 children으로 콘텐츠 전달 */
  children?: React.ReactNode
  /** 전체 모달 하단 액션 (탭별 footer보다 우선) */
  footer?: React.ReactNode
  /** 로딩 상태 — true이면 콘텐츠 대신 로딩 표시 */
  loading?: boolean
  loadingMessage?: string
  /** 에러 상태 — 문자열이면 에러 메시지 표시 */
  error?: string
  /** 외부에서 탭 제어 */
  activeTab?: number
  onTabChange?: (index: number) => void
  /** 모달 너비: sm(480), md(640), lg(800), xl(960), full(95vw) */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  className?: string
}

const sizeMap: Record<string, string> = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[800px]',
  xl: 'max-w-[960px]',
  full: 'max-w-[95vw]',
}

export function DetailModal({
  open,
  onClose,
  title,
  subtitle,
  description,
  breadcrumb,
  tabs,
  children,
  footer,
  loading,
  loadingMessage = '불러오는 중...',
  error,
  activeTab: controlledTab,
  onTabChange,
  size = 'lg',
  className,
}: DetailModalProps) {
  const [internalTab, setInternalTab] = React.useState(0)
  const isControlled = controlledTab !== undefined
  const maxTab = tabs ? Math.max(0, tabs.length - 1) : 0
  const activeTab = Math.min(isControlled ? controlledTab : internalTab, maxTab)
  const setActiveTab = (i: number) => {
    if (isControlled) onTabChange?.(i)
    else setInternalTab(i)
  }

  // 모달 열릴 때 첫 번째 탭으로 리셋 (비제어 모드만)
  React.useEffect(() => {
    if (open && !isControlled) setInternalTab(0)
  }, [open, isControlled])

  // 현재 활성 탭의 footer (탭별 footer > 전체 footer)
  const activeFooter = tabs && tabs.length > 0
    ? (tabs[activeTab]?.footer ?? footer)
    : footer

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={cn(sizeMap[size], 'p-0 gap-0 max-h-[85vh] flex flex-col', className)}>
        {/* ── 헤더 ── */}
        <div className="px-6 pt-6 pb-4">
          {breadcrumb && breadcrumb.length > 0 && (
            <Breadcrumb items={breadcrumb} className="mb-2" />
          )}
          <DialogHeader>
            <DialogTitle className={cn('text-lg', typeof title !== 'string' && 'flex items-center gap-2.5')}>
              {title}
            </DialogTitle>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
            {description && (
              <DialogDescription className="sr-only">{description}</DialogDescription>
            )}
          </DialogHeader>
        </div>

        {/* ── 로딩 / 에러 ── */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loading message={loadingMessage} />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : (
          <>
            {/* ── 탭 네비게이션 ── */}
            {tabs && tabs.length > 0 && (
              <div className="border-b px-6">
                <div className="flex gap-0">
                  {tabs.map((tab, i) => (
                    <button
                      key={tab.label}
                      onClick={() => setActiveTab(i)}
                      className={cn(
                        'relative px-3 py-2.5 text-sm font-medium transition-colors',
                        i === activeTab
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {tab.label}
                        {tab.count !== undefined && (
                          <span className={cn(
                            'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                            i === activeTab
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground',
                          )}>
                            {tab.count}
                          </span>
                        )}
                      </span>
                      {i === activeTab && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── 콘텐츠 ── */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {tabs && tabs.length > 0
                ? tabs[activeTab]?.content
                : children
              }
            </div>
          </>
        )}

        {/* ── 하단 액션 ── */}
        {activeFooter && !loading && !error && (
          <>
            <Separator />
            <div className="px-6 py-4 flex items-center justify-end gap-2">
              {activeFooter}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
