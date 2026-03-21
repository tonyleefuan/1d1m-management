'use client'

import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
  onClose?: () => void
}

const STYLES = {
  success: { bg: '#f0fdf4', border: '#04D1AE', color: '#065f46' },
  error: { bg: '#fef2f2', border: '#FD5046', color: '#7f1d1d' },
  info: { bg: '#eef2ff', border: '#2959FD', color: '#1e3a8a' },
}

export function Toast({ message, type = 'success', duration = 4000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      onClose?.()
    }, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  if (!visible) return null

  const s = STYLES[type]
  return (
    <div role="alert" aria-live="polite" style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      fontSize: 12, padding: '8px 14px', borderRadius: 8,
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}20`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      animation: 'fadeIn 0.2s ease',
    }}>
      {message}
    </div>
  )
}
