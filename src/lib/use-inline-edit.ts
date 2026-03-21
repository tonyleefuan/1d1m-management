'use client'

import { useState, useCallback } from 'react'

/* ═══════════════════════════════════════════════════════════════════
 *  useInlineEdit — 테이블 행 인라인 편집 훅
 *
 *  5개+ 탭에서 반복되는 패턴을 공통화:
 *  - editingId 상태 관리
 *  - 입력값 상태 관리
 *  - 저장/취소 핸들러
 *  - 로딩 상태
 *
 *  사용법:
 *    const nameEdit = useInlineEdit(async (id, value) => {
 *      await apiPut(`/api/items/${id}`, { name: value })
 *      reload()
 *    })
 *
 *    // 테이블에서:
 *    nameEdit.editingId === row.id
 *      ? <Input value={nameEdit.value} onChange={e => nameEdit.setValue(e.target.value)}
 *               onKeyDown={e => e.key === 'Enter' && nameEdit.submit(row.id)}
 *               onBlur={() => nameEdit.cancel()} />
 *      : <span onDoubleClick={() => nameEdit.start(row.id, row.name)}>{row.name}</span>
 * ═══════════════════════════════════════════════════════════════════ */

interface UseInlineEditReturn {
  /** 현재 편집 중인 항목 ID (null이면 편집 모드 아님) */
  editingId: string | null
  /** 현재 입력값 */
  value: string
  /** 입력값 변경 */
  setValue: (v: string) => void
  /** 저장 중 여부 */
  saving: boolean
  /** 편집 시작 */
  start: (id: string, currentValue: string) => void
  /** 저장 실행 */
  submit: (id: string) => Promise<void>
  /** 편집 취소 */
  cancel: () => void
  /** 에러 메시지 */
  error: string | null
}

export function useInlineEdit(
  onSave: (id: string, value: string) => Promise<void>,
): UseInlineEditReturn {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = useCallback((id: string, currentValue: string) => {
    setEditingId(id)
    setValue(currentValue)
    setError(null)
  }, [])

  const submit = useCallback(async (id: string) => {
    setSaving(true)
    setError(null)
    try {
      await onSave(id, value)
      setEditingId(null)
    } catch (e: any) {
      setError(e?.message ?? '저장 실패')
    } finally {
      setSaving(false)
    }
  }, [onSave, value])

  const cancel = useCallback(() => {
    setEditingId(null)
    setValue('')
    setError(null)
  }, [])

  return { editingId, value, setValue, saving, start, submit, cancel, error }
}
