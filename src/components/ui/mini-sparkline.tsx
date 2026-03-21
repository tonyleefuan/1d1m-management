'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts'

/* ── MiniSparkline ───────────────────────────────────
 *  테이블 셀 내 미니 추이선 (숫자 옆에 트렌드 표시)
 *
 *  사용법:
 *    // 기본 (자동 색상: 상승=초록, 하락=빨강)
 *    <MiniSparkline data={[100, 120, 90, 150, 130]} />
 *
 *    // 고정 색상
 *    <MiniSparkline data={weeklyRevenue} color="#2959FD" />
 *
 *    // 값과 함께 표시
 *    <div className="flex items-center gap-2">
 *      <span>₩1.2억</span>
 *      <MiniSparkline data={trend} width={60} />
 *    </div>
 *
 *    // 채움 영역
 *    <MiniSparkline data={data} filled />
 * ──────────────────────────────────────────────────── */

interface MiniSparklineProps {
  /** 숫자 배열 (시간 순서) */
  data: number[]
  width?: number
  height?: number
  /** 고정 색상 (미지정시 추세에 따라 자동) */
  color?: string
  /** 영역 채움 여부 */
  filled?: boolean
  className?: string
}

export function MiniSparkline({
  data,
  width = 60,
  height = 24,
  color,
  filled = false,
  className,
}: MiniSparklineProps) {
  if (!data || data.length < 2) return null

  const chartData = data.map((v, i) => ({ i, v }))
  const first = data[0]
  const last = data[data.length - 1]
  const autoColor = last >= first ? '#04D1AE' : '#FD5046'
  const strokeColor = color || autoColor

  return (
    <div className={cn('inline-flex', className)} style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            type="monotone"
            dataKey="v"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
