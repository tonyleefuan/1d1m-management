'use client'

import React from 'react'

interface MetricProps {
  label: string
  value: string
  sub?: string
  accent?: 'blue' | 'red' | 'green' | 'peach' | 'yellow' | 'orange'
  bold?: boolean
}

const accentColors = {
  blue: 'text-hh-blue',
  red: 'text-hh-red',
  green: 'text-hh-green',
  peach: 'text-hh-orange',
  yellow: 'text-hh-yellow',
  orange: 'text-hh-orange',
}

export const Metric = React.memo(function Metric({ label, value, sub, accent, bold }: MetricProps) {
  const color = accent ? accentColors[accent] : 'text-[#111]'

  return (
    <div className="bg-white border border-border rounded-sm px-5 py-4 transition-all hover:border-[#c0c0c0] hover:shadow-sm">
      <div className="text-[12px] text-[#777] mb-1.5 tracking-wide">{label}</div>
      <div className={`text-[29px] font-extrabold ${color} leading-tight`}>
        {value}
      </div>
      {sub && <div className="text-[12px] text-[#aaa] mt-1.5">{sub}</div>}
    </div>
  )
})
