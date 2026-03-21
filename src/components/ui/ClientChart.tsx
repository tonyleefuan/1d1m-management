'use client'

import { useState, useEffect, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  height: number
}

/** Wrapper that only renders chart children after mount to avoid Recharts SSR issues */
export function ClientChart({ children, height }: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div style={{ width: '100%', height }} className="flex flex-col justify-center gap-2 px-4">
        <div className="skeleton" style={{ height: 14, width: '60%' }} />
        <div className="skeleton" style={{ height: Math.max(40, height - 60), width: '100%' }} />
        <div className="skeleton" style={{ height: 12, width: '40%' }} />
      </div>
    )
  }

  return <>{children}</>
}
