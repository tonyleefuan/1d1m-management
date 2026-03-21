'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export interface ToastState {
  message: string
  type: 'success' | 'error' | 'info'
}

/**
 * 통합 토스트 훅 — 탭 간 일관된 알림 패턴
 *
 * 사용법:
 *   const { toast, showToast, showError, showSuccess, clearToast } = useToast()
 *
 *   showSuccess('저장되었습니다')
 *   showError('저장에 실패했습니다')
 *   showToast('안내 메시지', 'info')
 *
 *   // JSX에서:
 *   {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
 */
export function useToast(duration = 4000) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const clearToast = useCallback(() => {
    setToast(null)
  }, [])

  const showToast = useCallback((message: string, type: ToastState['type'] = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ message, type })
    timerRef.current = setTimeout(() => setToast(null), duration)
  }, [duration])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const showSuccess = useCallback((message: string) => showToast(message, 'success'), [showToast])
  const showError = useCallback((message: string) => showToast(message, 'error'), [showToast])

  return { toast, showToast, showSuccess, showError, clearToast }
}
