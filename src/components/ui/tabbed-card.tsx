'use client'

import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from './card'

/* ── TabbedCard ──────────────────────────────────────
 *  카드 내부에 탭 네비게이션이 있는 패턴
 *  Dashboard 뷰의 테이블/콘텐츠 탭 전환에 사용
 *
 *  사용법:
 *    <TabbedCard
 *      title="문서 관리"
 *      tabs={[
 *        { label: '개요', count: 5, content: <Overview /> },
 *        { label: '성과', content: <Performance /> },
 *      ]}
 *      action={<Button>+ 추가</Button>}
 *    />
 * ──────────────────────────────────────────────────── */

interface Tab {
  label: string
  count?: number
  content: React.ReactNode
}

interface TabbedCardProps {
  title?: string
  tabs: Tab[]
  action?: React.ReactNode
  defaultTab?: number
  className?: string
}

export function TabbedCard({
  title,
  tabs,
  action,
  defaultTab = 0,
  className,
}: TabbedCardProps) {
  const [activeTab, setActiveTab] = useState(defaultTab)

  return (
    <Card className={cn('', className)}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <div className="border-b px-6">
        <div className="flex items-center justify-between">
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
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        i === activeTab
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
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
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      </div>
      <CardContent className="pt-4">{tabs[activeTab]?.content}</CardContent>
    </Card>
  )
}
