'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { ImageCarousel } from './image-carousel'
import { ScoreBar } from './score-bar'
import { KeyValue } from './key-value'
import { StatusBadge } from './status-badge'

/* ── MediaCard ──────────────────────────────────────
 *  이미지 + 점수 + 지표 그리드 카드
 *  ImageCarousel + ScoreBar + KeyValue를 조합한 공통 카드
 *
 *  사용법:
 *    <MediaCard
 *      images={['/img1.jpg', '/img2.jpg']}
 *      score={{ value: 78, maxValue: 100, segments: [...] }}
 *      metrics={[
 *        { label: '지출', value: '₩12,000' },
 *        { label: 'ROAS', value: '3.2', level: 'good' },
 *      ]}
 *      footer="캠페인 — 광고세트"
 *      subtitle="소재 이름"
 *    />
 * ──────────────────────────────────────────────────── */

type ColorLevel = 'good' | 'bad' | 'neutral'

interface ScoreSegment {
  value: number
  color: string
  label?: string
  max?: number
}

interface ScoreConfig {
  /** 총점 */
  value: number
  /** 만점 (기본 100) */
  maxValue?: number
  /** 점수 색상 레벨 */
  level?: ColorLevel
  /** ScoreBar 세그먼트 */
  segments?: ScoreSegment[]
  /** 데이터 부족 등 경고 뱃지 */
  warning?: string
}

interface MetricItem {
  label: string
  value: string
  level?: ColorLevel
}

interface FooterConfig {
  /** 메인 텍스트 */
  text: string
  /** 배경/테두리 색상 (국가별 등) */
  bgColor?: string
  borderColor?: string
}

interface MediaCardProps {
  /** ImageCarousel에 전달할 이미지 URL 배열 */
  images: string[]
  /** 이미지 폴백 UI */
  imageFallback?: React.ReactNode
  /** 이미지 오버레이 (재생 버튼 등) */
  imageOverlay?: React.ReactNode
  /** 이미지 뱃지 (캐러셀 등) */
  imageBadge?: React.ReactNode
  /** 이미지 프록시 설정 */
  proxyPattern?: RegExp
  proxyUrl?: string
  /** 점수 영역 */
  score?: ScoreConfig
  /** 지표 그리드 (2열) */
  metrics?: MetricItem[]
  /** 지표 없을 때 표시할 텍스트 */
  emptyMetricsText?: string
  /** 하단 푸터 (캠페인명 등) */
  footer?: FooterConfig
  /** 서브타이틀 (소재명 등) */
  subtitle?: string
  className?: string
}

export function MediaCard({
  images,
  imageFallback,
  imageOverlay,
  imageBadge,
  proxyPattern,
  proxyUrl,
  score,
  metrics,
  emptyMetricsText = '성과 데이터 없음',
  footer,
  subtitle,
  className,
}: MediaCardProps) {
  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-[10px] border border-border bg-white transition-shadow duration-150 cursor-default hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]',
        className,
      )}
    >
      {/* 이미지 */}
      <ImageCarousel
        images={images}
        fallback={imageFallback}
        overlay={imageOverlay}
        badge={imageBadge}
        proxyPattern={proxyPattern}
        proxyUrl={proxyUrl}
      />

      {/* 콘텐츠 */}
      <div className="flex flex-1 flex-col px-3.5 pt-3 pb-2">
        {/* 점수 영역 */}
        {score && (
          <>
            <div className="mb-2 flex items-center gap-2">
              <div
                className={cn(
                  'text-[28px] font-extrabold leading-none',
                  score.level === 'good' && 'text-hh-green',
                  score.level === 'bad' && 'text-hh-red',
                  (!score.level || score.level === 'neutral') && 'text-foreground',
                )}
              >
                {score.value}
              </div>
              <div className="text-[11px] text-muted-foreground">/ {score.maxValue ?? 100}</div>
              {score.warning && (
                <StatusBadge status="warning" className="ml-auto text-[10px]">
                  {score.warning}
                </StatusBadge>
              )}
            </div>

            {/* 분할 바 */}
            {score.segments && score.segments.length > 0 && (
              <ScoreBar segments={score.segments} className="mb-2" />
            )}
          </>
        )}

        {/* 지표 그리드 */}
        {metrics && metrics.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {metrics.map((m) => (
              <KeyValue
                key={m.label}
                label={m.label}
                value={m.value}
                level={m.level}
                valueClassName="font-semibold tabular-nums text-xs"
                className="py-0.5"
              />
            ))}
          </div>
        ) : score ? (
          <div className="py-2 text-center text-xs text-muted-foreground">
            {emptyMetricsText}
          </div>
        ) : null}

        {/* 푸터 */}
        {footer && (
          <div
            className={cn(
              'mt-auto overflow-hidden truncate rounded-b border-t px-2 py-1.5 text-[10px] leading-[1.4] text-muted-foreground',
              !footer.borderColor && 'border-border-light',
            )}
            style={footer.bgColor ? { borderColor: footer.borderColor, background: footer.bgColor } : undefined}
            title={footer.text}
          >
            {footer.text}
          </div>
        )}

        {/* 서브타이틀 */}
        {subtitle && (
          <div className="mt-0.5 truncate px-2 text-[11px] text-muted-foreground" title={subtitle}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}
