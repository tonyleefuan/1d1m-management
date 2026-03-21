'use client'

import React from 'react'
import type { TooltipProps } from 'recharts'

export const ChartTooltip = React.memo(function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload) return null
  return (
    <div className="bg-white border border-border rounded-sm px-3 py-2 text-[12px] shadow-sm">
      <div className="font-bold mb-1 text-[#111]">{label}</div>
      {payload
        .filter((p) => p.value != null)
        .map((p, i) => (
          <div key={i} className="flex justify-between gap-4 py-px">
            <span style={{ color: p.color || '#777' }}>{p.name}</span>
            <span className="font-semibold text-[#111]">
              {typeof p.value === 'number' ? p.value.toFixed(1) + '억' : p.value}
            </span>
          </div>
        ))}
    </div>
  )
})
