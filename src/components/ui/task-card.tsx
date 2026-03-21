'use client'

import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Badge } from './badge'
import { StatusBadge } from './status-badge'
import { ChevronDown, ChevronUp } from 'lucide-react'

/* ── TaskCard ────────────────────────────────────────
 *  AI 태스크 카드 — 처리 필요 목록에서 사용
 *
 *  사용법:
 *    <TaskCard
 *      title="10009030010 [Cotton Tee | White | A1]"
 *      summary="재고 12개, 7일 후 소진 예상"
 *      typeLabel="리오더 필요"
 *      typeIcon="refresh-cw"
 *      typeColor="#2959FD"
 *      urgency="high"
 *      confidence={0.85}
 *      reasoning="• 현재 재고: 12개\n• 일 판매: 4개\n• 리드타임: 14일"
 *      onComplete={() => {}}
 *      onSkip={() => {}}
 *    />
 *
 *    // 의견 충돌
 *    <TaskCard
 *      ...
 *      conflicting={true}
 *      opinions={[
 *        { user: '토니', opinion: '200개 리오더' },
 *        { user: '미나', opinion: '100개면 충분' },
 *      ]}
 *      onAddOpinion={() => {}}
 *    />
 * ──────────────────────────────────────────────────── */

interface Opinion {
  user: string
  opinion: string
}

interface TaskCardProps {
  title: string
  summary?: string
  typeLabel: string
  typeColor?: string
  urgency?: 'critical' | 'high' | 'normal' | 'low'
  confidence?: number
  reasoning?: string
  conflicting?: boolean
  opinions?: Opinion[]
  dueDate?: string
  onComplete: () => void
  onSkip: () => void
  onAddOpinion?: () => void
  className?: string
}

const urgencyConfig = {
  critical: { border: 'border-l-red-500', badge: 'error' as const, label: '긴급' },
  high: { border: 'border-l-orange-400', badge: 'warning' as const, label: '주의' },
  normal: { border: 'border-l-blue-400', badge: 'info' as const, label: '일반' },
  low: { border: 'border-l-gray-300', badge: 'neutral' as const, label: '낮음' },
}

export function TaskCard({
  title,
  summary,
  typeLabel,
  typeColor = '#2959FD',
  urgency = 'normal',
  confidence,
  reasoning,
  conflicting = false,
  opinions = [],
  dueDate,
  onComplete,
  onSkip,
  onAddOpinion,
  className,
}: TaskCardProps) {
  const [expanded, setExpanded] = useState(false)
  const config = urgencyConfig[urgency]

  return (
    <div className={cn(
      'rounded-lg border bg-card p-4 border-l-4 transition-shadow hover:shadow-md',
      config.border,
      conflicting && 'ring-2 ring-red-200 bg-red-50/30',
      className,
    )}>
      {/* 의견 충돌 배너 */}
      {conflicting && (
        <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-red-600">
          <span>⚡</span>
          <span>의견이 다릅니다 — 확인이 필요합니다</span>
        </div>
      )}

      {/* 헤더: 유형 뱃지 + 긴급도 + 기한 */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: typeColor, color: typeColor }}>
          {typeLabel}
        </Badge>
        {urgency !== 'normal' && (
          <StatusBadge status={config.badge} size="xs">{config.label}</StatusBadge>
        )}
        {dueDate && (
          <span className="text-[10px] text-muted-foreground ml-auto font-mono">
            D-{Math.max(0, Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000))}
          </span>
        )}
      </div>

      {/* 제목 */}
      <div className="text-sm font-semibold mb-1 leading-tight">{title}</div>

      {/* 요약 */}
      {summary && (
        <div className="text-xs text-muted-foreground mb-2 line-clamp-2">{summary}</div>
      )}

      {/* 신뢰도 */}
      {confidence !== undefined && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${confidence * 100}%`,
                backgroundColor: confidence >= 0.8 ? '#04D1AE' : confidence >= 0.5 ? '#FF9720' : '#FD5046',
              }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">{Math.round(confidence * 100)}%</span>
        </div>
      )}

      {/* 의견 충돌 목록 */}
      {conflicting && opinions.length > 0 && (
        <div className="mb-2 space-y-1">
          {opinions.map((op, i) => (
            <div key={i} className="text-xs bg-white rounded px-2 py-1 border">
              <span className="font-medium">{op.user}:</span> {op.opinion}
            </div>
          ))}
        </div>
      )}

      {/* 근거 (접이식) */}
      {reasoning && (
        <div className="mb-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-muted-foreground flex items-center gap-0.5 hover:text-foreground transition-colors"
          >
            📊 판단 근거
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {expanded && (
            <div className="mt-1 text-[11px] text-muted-foreground whitespace-pre-line bg-muted/30 rounded p-2">
              {reasoning}
            </div>
          )}
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-2 mt-3">
        {conflicting && onAddOpinion ? (
          <>
            <Button size="sm" onClick={onAddOpinion} className="flex-1 text-xs h-7">
              내 의견 추가
            </Button>
            <Button variant="outline" size="sm" onClick={onSkip} className="text-xs h-7">
              스킵
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={onComplete} className="flex-1 text-xs h-7">
              완료
            </Button>
            <Button variant="outline" size="sm" onClick={onSkip} className="text-xs h-7">
              스킵
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
