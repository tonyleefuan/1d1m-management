'use client'

import React from 'react'

interface StatusDotProps {
  good: boolean | null
}

export const StatusDot = React.memo(function StatusDot({ good }: StatusDotProps) {
  const bg = good === true ? 'bg-hh-green' : good === false ? 'bg-hh-red' : 'bg-hh-yellow'
  const label = good === true ? '정상' : good === false ? '위험' : '주의'
  return <span className={`inline-block w-2 h-2 rounded-full ${bg} mr-1.5`} role="img" aria-label={label} />
})
