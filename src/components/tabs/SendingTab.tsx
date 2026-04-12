'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge, type StatusType } from '@/components/ui/status-badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { FilterBar } from '@/components/ui/filter-bar'
import { Spinner } from '@/components/ui/spinner'
import { SkeletonTable } from '@/components/ui/skeleton'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/lib/use-toast'
import { Checkbox } from '@/components/ui/checkbox'
import { CollapsibleCard } from '@/components/ui/collapsible'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Progress } from '@/components/ui/progress'
import { Radio, RefreshCw, Upload, Download, Search, Info, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────

interface QueueItem {
  id: string
  subscription_id: string
  device_id: string
  send_date: string
  kakao_friend_name: string
  message_content: string
  image_path: string | null
  sort_order: number
  message_seq: string | null
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  error_message: string | null
  estimated_time: string
  day_number: number | null
  subscription?: {
    id: string
    last_sent_day: number
    duration_days: number
    send_priority: number
    product?: { sku_code: string; title: string }
  }
}

interface DeviceSummary {
  total: number
  pending: number
  sent: number
  failed: number
}

interface SendDevice {
  id: string
  phone_number: string
  name: string | null
  is_active: boolean
  color: string | null
}

// ─── Constants ──────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; statusType: StatusType }> = {
  pending: { label: '대기', statusType: 'neutral' },
  sent: { label: '성공', statusType: 'success' },
  failed: { label: '실패', statusType: 'error' },
}

/** 18시(KST) 기준 디폴트 날짜: 18시 이전 → 오늘, 18시 이후 → 내일 */
function getDefaultSendDate(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const kstH = kst.getUTCHours()

  if (kstH >= 18) {
    kst.setUTCDate(kst.getUTCDate() + 1)
  }
  return kst.toISOString().slice(0, 10)
}

// ─── Component ──────────────────────────────────────────

export function SendingTab() {
  const { showSuccess, showError } = useToast()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()

  // 발송 설정
  const [startTime, setStartTime] = useState('04:00')
  const [msgDelay, setMsgDelay] = useState(3)
  const [fileDelay, setFileDelay] = useState(6)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  // 발송 날짜
  const [sendDate, setSendDate] = useState('')

  // 대기열
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [summary, setSummary] = useState<Record<string, DeviceSummary>>({})
  const [totalCount, setTotalCount] = useState(0)
  const [devices, setDevices] = useState<SendDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const generatingRef = useRef(false)
  const [generatingProgress, setGeneratingProgress] = useState<string | null>(null)
  const [generateLogs, setGenerateLogs] = useState<string[]>([])
  const addGenLog = (msg: string) => setGenerateLogs(prev => [...prev, msg])
  const [statusFilter, setStatusFilter] = useState('all')

  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const PAGE_LIMIT = 100

  // 체크박스 + 검색
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 어제 결과 수거
  const [yesterdayPendingCount, setYesterdayPendingCount] = useState(0)
  const [yesterdayDate, setYesterdayDate] = useState('')
  const [yesterdayImportResult, setYesterdayImportResult] = useState<{ sent: number; failed: number } | null>(null)

  // 구글시트 연동
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState('')
  const [importing, setImporting] = useState(false)
  const [lastExportAt, setLastExportAt] = useState<string | null>(null)
  const [lastImportAt, setLastImportAt] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<{
    totalDevices: number
    currentIndex: number
    currentName: string
    phase: 'sheets' | 'db' | 'subscriptions' | 'repair' | 'done'
    results: { phone: string; name: string; rows: number; error?: string }[]
    logs: string[]
  } | null>(null)

  // 실패 처리
  const [failureModalDevice, setFailureModalDevice] = useState<string | null>(null)
  const failureAction = 'retry_now' as const
  const [failureSubmitting, setFailureSubmitting] = useState(false)

  // ─── Fetch ───

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/devices')
      if (!res.ok) throw new Error('디바이스 목록 로드 실패')
      const json = await res.json()
      setDevices(Array.isArray(json) ? json : json.data || [])
    } catch (err) {
      showError(err instanceof Error ? err.message : '디바이스 목록을 불러오는데 실패했습니다')
    }
  }, [showError])

  // 요약만 빠르게 (초기 로딩용)
  const fetchSummary = useCallback(async () => {
    if (!sendDate) return
    setSummaryLoading(true)
    try {
      const res = await fetch(`/api/sending/queue-summary?date=${sendDate}`)
      if (!res.ok) throw new Error('요약 로드 실패')
      const json = await res.json()
      setSummary(json.summary || {})
      setTotalCount(json.totalCount || 0)
      // settings도 여기서 받아옴
      const s = json.settings || {}
      setStartTime(String(s.send_start_time || '04:00'))
      setMsgDelay(Number(s.send_message_delay) || 3)
      setFileDelay(Number(s.send_file_delay) || 6)
      setLastExportAt(s.last_sheet_export_at || null)
      setLastImportAt(s.last_sheet_import_at || null)
      setSettingsDirty(false)
      setYesterdayPendingCount(json.yesterdayPendingCount ?? 0)
      setYesterdayDate(json.yesterdayDate ?? '')
      setYesterdayImportResult(null)
    } catch (err) {
      showError(err instanceof Error ? err.message : '요약을 불러오는데 실패했습니다')
    }
    setSummaryLoading(false)
  }, [sendDate, showError])

  // 상세 대기열 (페이지네이션)
  const fetchQueue = useCallback(async (page = 1) => {
    if (!sendDate) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ date: sendDate, page: String(page), limit: String(PAGE_LIMIT) })
      if (selectedDevice) params.set('device_id', selectedDevice)
      if (statusFilter && statusFilter !== 'all') {
        params.set('status', statusFilter)
        if (statusFilter === 'failed') params.set('unresolved', 'true')
      }
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await fetch(`/api/sending/queue?${params}`)
      if (!res.ok) throw new Error('발송 대기열 로드 실패')
      const json = await res.json()
      setQueue(json.data || [])
      setCurrentPage(json.pagination?.page || 1)
      setTotalPages(json.pagination?.totalPages || 0)
    } catch (err) {
      showError(err instanceof Error ? err.message : '발송 대기열을 불러오는데 실패했습니다')
    }
    setLoading(false)
  }, [sendDate, selectedDevice, statusFilter, debouncedSearch, showError])

  // 검색 디바운스 (500ms)
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setCurrentPage(1)
    }, 500)
  }

  // 초기 디폴트 날짜 설정
  useEffect(() => {
    if (!sendDate) setSendDate(getDefaultSendDate())
  }, [sendDate])

  useEffect(() => { fetchDevices() }, [fetchDevices])
  useEffect(() => { fetchSummary() }, [fetchSummary])
  useEffect(() => { fetchQueue(currentPage) }, [fetchQueue, currentPage])

  // ─── Actions ───

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      const res = await fetch('/api/sending/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          send_start_time: startTime,
          send_message_delay: msgDelay,
          send_file_delay: fileDelay,
        }),
      })
      if (!res.ok) throw new Error('설정 저장 실패')
      showSuccess('발송 설정이 저장되었습니다')
      setSettingsDirty(false)
    } catch (err) {
      showError(err instanceof Error ? err.message : '설정 저장에 실패했습니다')
    }
    setSavingSettings(false)
  }

  const generateQueue = async () => {
    if (generatingRef.current) return
    generatingRef.current = true
    setGenerating(true)
    setGenerateLogs([])
    setGeneratingProgress('PC 목록 조회 중...')
    addGenLog('📋 PC 목록 조회 중...')

    try {
      // 1단계: PC 목록 가져오기
      const listRes = await fetch('/api/sending/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: sendDate }),
      })
      const listJson = await listRes.json()
      if (!listRes.ok) throw new Error(listJson.error || '대기열 생성 실패')

      const deviceList = listJson.devices || []
      if (!deviceList.length) {
        addGenLog('⚠️ 활성 PC가 없습니다')
        showSuccess('발송 대상이 없습니다')
        generatingRef.current = false
        setGenerating(false)
        setGeneratingProgress(null)
        return
      }
      addGenLog(`✅ PC ${deviceList.length}대 확인`)

      // 2단계: PC별 순차 생성 (개별 PC 실패해도 나머지 계속 진행)
      let totalGenerated = 0
      let skippedDevices = 0
      const failedDevices: string[] = []
      const zeroDevices: string[] = []
      for (let i = 0; i < deviceList.length; i++) {
        const device = deviceList[i]
        setGeneratingProgress(`${device.phone_number} 처리 중... (${i + 1}/${deviceList.length} PC, 현재 ${totalGenerated}건)`)

        try {
          const devRes = await fetch('/api/sending/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: sendDate, device_id: device.id }),
          })
          const devJson = await devRes.json()
          if (!devRes.ok) {
            const errMsg = `${device.phone_number}: ${devJson.error || '생성 실패'}`
            failedDevices.push(errMsg)
            addGenLog(`❌ ${errMsg}`)
            continue
          }
          const gen = devJson.generated || 0
          totalGenerated += gen
          if (devJson.skipped) {
            skippedDevices++
            addGenLog(`   ${device.phone_number} — 스킵 (이미 존재)`)
            continue
          }
          if (gen === 0) {
            const reason = devJson.reason === 'no_live_subscriptions' ? '활성 구독 없음'
              : devJson.reason === 'all_skipped' ? `메시지 없음 ${devJson.skippedNoMsg}건, Day초과 ${devJson.skippedDayRange}건`
              : '원인 불명'
            zeroDevices.push(`${device.phone_number}: ${reason}`)
            addGenLog(`   ${device.phone_number} — 0건 (${reason})`)
          } else {
            addGenLog(`   ${device.phone_number} — ${gen}건 생성 (구독 ${devJson.subscriptions}건)`)
          }
        } catch (err) {
          const errMsg = `${device.phone_number}: ${err instanceof Error ? err.message : '네트워크 오류'}`
          failedDevices.push(errMsg)
          addGenLog(`❌ ${errMsg}`)
        }
      }

      // 결과 요약 로그
      addGenLog('')
      if (failedDevices.length > 0) {
        addGenLog(`⚠️ 실패 ${failedDevices.length}개 PC`)
        showError(`${failedDevices.length}개 PC 실패:\n${failedDevices.join('\n')}`)
      }
      if (skippedDevices === deviceList.length && failedDevices.length === 0) {
        addGenLog('⚠️ 모든 PC에 이미 대기열이 존재합니다')
        showError('모든 PC에 이미 대기열이 존재합니다. 삭제 후 재생성하세요.')
      } else if (totalGenerated > 0) {
        addGenLog(`🎉 완료 — 총 ${totalGenerated}건 생성 (${deviceList.length}개 PC${skippedDevices > 0 ? `, ${skippedDevices}개 스킵` : ''}${failedDevices.length > 0 ? `, ${failedDevices.length}개 실패` : ''})`)
        showSuccess(`대기열 ${totalGenerated}건 생성 완료`)
      }
      fetchSummary(); fetchQueue(1)
    } catch (err) {
      addGenLog(`❌ 오류: ${err instanceof Error ? err.message : '대기열 생성 실패'}`)
      showError(err instanceof Error ? err.message : '대기열 생성 실패')
    }

    generatingRef.current = false
    setGenerating(false)
    setGeneratingProgress(null)
  }

  const clearQueue = async (deviceId?: string) => {
    const target = deviceId || selectedDevice || undefined
    const label = target ? getDeviceName(target) : '전체'
    const ok = await confirm({
      title: '대기열 삭제',
      description: `${label} 대기열을 삭제하시겠습니까?`,
      variant: 'destructive',
      confirmLabel: '삭제',
    })
    if (!ok) return
    try {
      const res = await fetch('/api/sending/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: target || null, date: sendDate }),
      })
      if (!res.ok) throw new Error('대기열 삭제 실패')
      showSuccess(`${label} 대기열 삭제 완료`)
      setSelectedIds(new Set())
      fetchSummary(); fetchQueue(1)
    } catch (err) {
      showError(err instanceof Error ? err.message : '대기열 삭제에 실패했습니다')
    }
  }

  const handleRegenerate = async () => {
    const ok = await confirm({
      title: '대기열 재생성',
      description: '기존 대기열을 삭제하고 다시 생성하시겠습니까?',
      variant: 'warning',
      confirmLabel: '재생성',
    })
    if (!ok) return
    if (generatingRef.current) return
    generatingRef.current = true
    setGenerating(true)
    setGenerateLogs([])
    setGeneratingProgress('기존 대기열 삭제 중...')
    addGenLog('🗑️ 기존 대기열 삭제 중...')
    try {
      const clearRes = await fetch('/api/sending/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: null, date: sendDate }),
      })
      if (!clearRes.ok) {
        const clearJson = await clearRes.json().catch(() => ({}))
        throw new Error(clearJson.error || '기존 대기열 삭제 실패')
      }
      addGenLog('✅ 기존 대기열 삭제 완료')

      // PC별 순차 생성 (generateQueue와 동일 로직)
      setGeneratingProgress('PC 목록 조회 중...')
      addGenLog('📋 PC 목록 조회 중...')
      const listRes = await fetch('/api/sending/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: sendDate }),
      })
      const listJson = await listRes.json()
      if (!listRes.ok) throw new Error(listJson.error || '대기열 재생성 실패')

      const deviceList = listJson.devices || []
      addGenLog(`✅ PC ${deviceList.length}대 확인`)
      let totalGenerated = 0
      const failedDevices: string[] = []
      for (let i = 0; i < deviceList.length; i++) {
        const device = deviceList[i]
        setGeneratingProgress(`${device.phone_number} 처리 중... (${i + 1}/${deviceList.length} PC, 현재 ${totalGenerated}건)`)
        try {
          const devRes = await fetch('/api/sending/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: sendDate, device_id: device.id }),
          })
          const devJson = await devRes.json()
          if (!devRes.ok) {
            const errMsg = `${device.phone_number}: ${devJson.error || '생성 실패'}`
            failedDevices.push(errMsg)
            addGenLog(`❌ ${errMsg}`)
            continue
          }
          const gen = devJson.generated || 0
          totalGenerated += gen
          addGenLog(`   ${device.phone_number} — ${gen > 0 ? `${gen}건 생성` : '0건'}`)
        } catch (err) {
          const errMsg = `${device.phone_number}: ${err instanceof Error ? err.message : '네트워크 오류'}`
          failedDevices.push(errMsg)
          addGenLog(`❌ ${errMsg}`)
        }
      }

      addGenLog('')
      if (failedDevices.length > 0) {
        addGenLog(`⚠️ 실패 ${failedDevices.length}개 PC`)
        showError(`재생성 중 ${failedDevices.length}개 PC 실패:\n${failedDevices.join('\n')}`)
      }
      if (totalGenerated > 0) {
        addGenLog(`🎉 재생성 완료 — 총 ${totalGenerated}건 (${deviceList.length}개 PC${failedDevices.length > 0 ? `, ${failedDevices.length}개 실패` : ''})`)
        showSuccess(`대기열 재생성 완료: ${totalGenerated}건`)
      } else if (failedDevices.length === 0) {
        addGenLog('✅ 재생성 완료 (발송 대상 없음)')
        showSuccess('재생성 완료 (발송 대상 없음)')
      }
      fetchSummary(); fetchQueue(1)
    } catch (err) {
      addGenLog(`❌ 오류: ${err instanceof Error ? err.message : '대기열 재생성 실패'}`)
      showError(err instanceof Error ? err.message : '대기열 재생성 실패')
    }
    generatingRef.current = false
    setGenerating(false)
    setGeneratingProgress(null)
  }

  const handleExportSheet = async () => {
    // 같은 날짜에 이미 내보냈으면 확인
    const lastExportDate = lastExportAt
      ? new Date(new Date(lastExportAt).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null
    if (lastExportDate === sendDate) {
      const ok = await confirm({
        title: '구글시트 내보내기',
        description: '이미 내보낸 기록이 있습니다. 시트를 초기화하고 다시 내보내시겠습니까?',
        variant: 'warning',
        confirmLabel: '내보내기',
      })
      if (!ok) return
    }

    setExporting(true)
    setExportProgress('준비 중...')
    setGenerateLogs([])
    addGenLog('📤 시트 내보내기 시작...')
    try {
      const res = await fetch('/api/sending/export-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: sendDate, force: true }),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || '시트 내보내기 실패')
      }

      // SSE 스트리밍 응답 처리
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let lastResult: { total?: number; devices?: number; autoImported?: boolean } = {}

      if (reader) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'clearing') {
                setExportProgress('시트 초기화 중...')
                addGenLog('🗑️ 시트 초기화 중...')
              } else if (data.type === 'start') {
                setExportProgress(`${data.totalItems}건 내보내기 시작 (${data.totalDevices}개 PC)`)
                addGenLog(`📋 ${data.totalItems}건 내보내기 시작 (${data.totalDevices}개 PC)`)
              } else if (data.type === 'device_start') {
                setExportProgress(`${data.device} 쓰는 중... (${data.deviceIndex}/${data.totalDevices} PC, ${data.items}건)`)
              } else if (data.type === 'device_done') {
                setExportProgress(`${data.device} 완료 (${data.deviceIndex}/${data.totalDevices} PC, 누적 ${data.totalWritten}건)`)
                addGenLog(`   ${data.device} — ${data.items}건 완료`)
              } else if (data.type === 'complete') {
                lastResult = data
              } else if (data.type === 'error') {
                throw new Error(data.error)
              }
            } catch (e) {
              if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e
            }
          }
        }
      }

      let msg = `구글시트 내보내기 완료: ${lastResult.total ?? 0}건 (${lastResult.devices ?? 0}개 PC)`
      if (lastResult.autoImported) {
        msg += '\n(이전 미수거 결과를 자동으로 가져왔습니다)'
        addGenLog('ℹ️ 이전 미수거 결과 자동 가져오기 완료')
      }
      addGenLog(`🎉 시트 내보내기 완료 — ${lastResult.total ?? 0}건 (${lastResult.devices ?? 0}개 PC)`)
      showSuccess(msg)
      setLastExportAt(new Date().toISOString())
      fetchSummary(); fetchQueue(1)
    } catch (err) {
      addGenLog(`❌ 시트 내보내기 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
      showError(err instanceof Error ? err.message : '시트 내보내기에 실패했습니다')
    }
    setExporting(false)
    setExportProgress('')
  }

  const handleClearSheet = async () => {
    const ok = await confirm({
      title: '구글시트 초기화',
      description: '모든 PC 시트의 데이터를 삭제하고 헤더만 남깁니다. 계속하시겠습니까?',
      variant: 'warning',
      confirmLabel: '초기화',
    })
    if (!ok) return

    setExporting(true)
    setExportProgress('시트 초기화 중...')
    setGenerateLogs([])
    addGenLog('🗑️ 시트 초기화 중...')
    try {
      const res = await fetch('/api/sending/clear-sheet', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '시트 초기화 실패')
      addGenLog(`✅ ${json.message || '시트 초기화 완료'}`)
      showSuccess(json.message || '시트 초기화 완료')
    } catch (err) {
      addGenLog(`❌ 시트 초기화 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
      showError(err instanceof Error ? err.message : '시트 초기화에 실패했습니다')
    }
    setExporting(false)
    setExportProgress('')
  }

  const handleExportSelected = async () => {
    if (selectedIds.size === 0) return
    setExporting(true)
    try {
      // #8: export-sheet는 SSE 스트림 응답 — JSON이 아님
      const res = await fetch('/api/sending/export-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: sendDate, queue_ids: Array.from(selectedIds), force: true }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '선택 내보내기 실패')
      }
      // SSE 스트림에서 complete 이벤트 대기
      const reader = res.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        let buffer = ''
        let lastResult: any = {}
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'complete') lastResult = data
              else if (data.type === 'error') throw new Error(data.error)
            } catch (e) { if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e }
          }
        }
        showSuccess(`선택 내보내기 완료: ${lastResult.total ?? 0}건 (${lastResult.devices ?? 0}개 PC)`)
      }
      setLastExportAt(new Date().toISOString())
      setSelectedIds(new Set())
      fetchSummary(); fetchQueue(1)
    } catch (err) {
      showError(err instanceof Error ? err.message : '선택 내보내기에 실패했습니다')
    }
    setExporting(false)
  }

  const handleImportResults = async (targetDate?: string) => {
    const date = targetDate || sendDate
    setImporting(true)
    setImportProgress({ totalDevices: 0, currentIndex: 0, currentName: '준비 중...', phase: 'sheets', results: [], logs: [] })
    try {
      const res = await fetch('/api/sending/import-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, stream: true }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '결과 가져오기 실패')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('스트림 읽기 실패')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))

            if (event.type === 'start') {
              setImportProgress(prev => prev ? { ...prev, totalDevices: event.totalDevices } : prev)
            } else if (event.type === 'device_start') {
              setImportProgress(prev => prev ? { ...prev, currentIndex: event.index, currentName: event.name || event.phone } : prev)
            } else if (event.type === 'device_done') {
              setImportProgress(prev => prev ? {
                ...prev,
                results: [...prev.results, { phone: event.phone, name: event.name, rows: event.rows }],
              } : prev)
            } else if (event.type === 'device_error') {
              setImportProgress(prev => prev ? {
                ...prev,
                results: [...prev.results, { phone: event.phone, name: event.name, rows: 0, error: event.error }],
              } : prev)
            } else if (event.type === 'db_update_start') {
              setImportProgress(prev => prev ? {
                ...prev, phase: 'db',
                logs: [...prev.logs, `📝 큐 상태 업데이트 중... (${event.total}건)`],
              } : prev)
            } else if (event.type === 'db_update_done') {
              setImportProgress(prev => prev ? {
                ...prev,
                logs: [...prev.logs, `✅ 큐 업데이트 완료 — 성공 ${event.sent}건, 실패 ${event.failed}건`],
              } : prev)
            } else if (event.type === 'sub_update_start') {
              setImportProgress(prev => prev ? {
                ...prev, phase: 'subscriptions',
                logs: [...prev.logs, '📊 구독 상태 반영 중...'],
              } : prev)
            } else if (event.type === 'sub_update_progress') {
              setImportProgress(prev => prev ? {
                ...prev,
                logs: [...prev.logs, `   ${event.message}`],
              } : prev)
            } else if (event.type === 'complete') {
              setImportProgress(prev => prev ? {
                ...prev, phase: 'done',
                logs: [...prev.logs, `🎉 완료 — 성공 ${event.sent}건, 실패 ${event.failed}건, 미처리 ${event.skipped}건`],
              } : prev)
              showSuccess(`결과 수거 완료: 성공 ${event.sent}건, 실패 ${event.failed}건, 미처리 ${event.skipped}건`)
              if (date && date !== sendDate) {
                setYesterdayImportResult({ sent: event.sent ?? 0, failed: event.failed ?? 0 })
                setYesterdayPendingCount(0)
              }
              setLastImportAt(new Date().toISOString())
              fetchSummary(); fetchQueue(1)
            } else if (event.type === 'error') {
              setImportProgress(prev => prev ? {
                ...prev,
                logs: [...prev.logs, `❌ 오류: ${event.error || event.message}`],
              } : prev)
              showError(event.error || event.message || '알 수 없는 오류')
            }
          } catch (e) { if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e }
        }
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : '결과 가져오기에 실패했습니다')
    }
    setImporting(false)
    setTimeout(() => setImportProgress(null), 10000) // 10초 후 진행 상황 숨기기
  }

  const handleFailureAction = async () => {
    if (!failureModalDevice) return
    setFailureSubmitting(true)
    try {
      const res = await fetch('/api/sending/handle-failures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: failureModalDevice, sendDate, action: failureAction }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '처리 실패')
      showSuccess(`실패 건 처리 완료: ${json.count}건`)
      setFailureModalDevice(null)
      fetchSummary(); fetchQueue(1)
    } catch (err) {
      showError(err instanceof Error ? err.message : '실패 건 처리에 실패했습니다')
    }
    setFailureSubmitting(false)
  }

  // ─── Helpers ───

  const getDeviceName = (id: string) => {
    const d = devices.find(d => d.id === id)
    return d ? `${d.phone_number}${d.name ? ` (${d.name})` : ''}` : id
  }

  const totalSummary = Object.values(summary).reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      pending: acc.pending + s.pending,
      sent: acc.sent + s.sent,
      failed: acc.failed + s.failed,
    }),
    { total: 0, pending: 0, sent: 0, failed: 0 },
  )

  // ─── 버튼 상태 가이드 ───
  const getActionPhase = () => {
    if (totalSummary.total === 0) return 'generate'
    if (totalSummary.failed > 0) return 'failure' // 실패 처리 우선
    if (!lastExportAt) return 'export'
    const exportTime = new Date(lastExportAt).getTime()
    const importTime = lastImportAt ? new Date(lastImportAt).getTime() : 0
    if (exportTime > importTime) return 'import'
    return 'done'
  }
  const actionPhase = getActionPhase()

  const displaySummary = selectedDevice ? (summary[selectedDevice] || { total: 0, pending: 0, sent: 0, failed: 0 }) : totalSummary

  // 전체 선택/해제 (현재 페이지만)
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(queue.map(item => item.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds)
    if (checked) next.add(id)
    else next.delete(id)
    setSelectedIds(next)
  }

  const isAllSelected = queue.length > 0 && queue.every(item => selectedIds.has(item.id))

  const formatTime = (isoStr: string | null) => {
    if (!isoStr) return '-'
    try {
      return new Date(isoStr).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch { return '-' }
  }

  // ─── Render helpers ───

  const kstToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  const kstYesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d) })()
  const kstTomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d) })()
  const formatShort = (d: string) => { if (!d || !d.includes('-')) return d || '-'; const [, m, day] = d.split('-'); return `${Number(m)}/${Number(day)}` }
  const addDays = (dateStr: string, days: number) => { if (!dateStr || !dateStr.includes('-')) return dateStr || ''; const d = new Date(dateStr + 'T00:00:00+09:00'); d.setDate(d.getDate() + days); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d) }

  // 스텝 정의
  const STEPS = [
    { id: 'generate' as const, num: 1, label: '대기열 생성', desc: '구독자별 발송 메시지 목록을 만듭니다' },
    { id: 'export' as const,   num: 2, label: '시트 내보내기', desc: '생성된 대기열을 구글시트로 전송합니다' },
    { id: 'import' as const,   num: 3, label: '결과 수거', desc: '발송 완료 후 성공/실패 결과를 가져옵니다' },
  ] as const

  const stepIndex = actionPhase === 'generate' ? 0
    : actionPhase === 'export' ? 1
    : actionPhase === 'import' ? 2
    : actionPhase === 'failure' ? 2 // 실패 처리는 3단계 이후
    : 3 // done

  // ─── Render ───

  return (
    <TooltipProvider>
    <div className="space-y-6">
      {/* ── 헤더: 날짜 선택 ── */}
      <div>
        <h2 className="text-2xl font-bold">{sendDate} 발송 현황</h2>
        <p className="text-sm text-muted-foreground mt-1">PC별 발송 현황과 성공률을 모니터링합니다</p>
        <div className="flex gap-1 mt-3">
          {[
            { date: kstYesterday, label: formatShort(kstYesterday) },
            { date: kstToday, label: formatShort(kstToday) },
            { date: kstTomorrow, label: formatShort(kstTomorrow) },
          ].map(tab => (
            <Button
              key={tab.date}
              size="sm"
              variant={sendDate === tab.date ? 'default' : 'outline'}
              onClick={() => { setSendDate(tab.date); setCurrentPage(1) }}
              className="h-8 text-xs"
            >
              {tab.label}
            </Button>
          ))}
          <Input
            type="date"
            value={sendDate}
            onChange={(e) => { setSendDate(e.target.value); setCurrentPage(1) }}
            className="w-[140px] h-8 text-xs ml-2"
          />
        </div>
      </div>

      {/* ── 워크플로우 스텝퍼 ── */}
      <Card>
        <CardContent className="p-4">
          {/* 스텝 인디케이터 */}
          <div className="flex items-center gap-1 mb-4">
            {STEPS.map((step, i) => {
              const isDone = i < stepIndex
              const isCurrent = i === stepIndex
              return (
                <React.Fragment key={step.id}>
                  {i > 0 && (
                    <div className={cn('flex-1 h-px mx-1', isDone ? 'bg-foreground' : 'bg-border')} />
                  )}
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors',
                      isDone && 'bg-foreground text-background',
                      isCurrent && 'bg-primary text-primary-foreground ring-2 ring-primary/30',
                      !isDone && !isCurrent && 'bg-muted text-muted-foreground',
                    )}>
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : step.num}
                    </div>
                    <div>
                      <p className={cn('text-sm font-medium leading-none', isCurrent && 'text-primary', !isDone && !isCurrent && 'text-muted-foreground')}>
                        {step.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                </React.Fragment>
              )
            })}
            {/* 완료 상태 */}
            {stepIndex >= 3 && (
              <>
                <div className="flex-1 h-px mx-1 bg-foreground" />
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium text-foreground">완료</p>
                </div>
              </>
            )}
          </div>

          {/* 현재 스텝 액션 영역 — 5단계 플로우 */}
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t">

            {/* STEP 0: 어제 결과 수거 */}
            {yesterdayPendingCount > 0 && !yesterdayImportResult && (
              <>
                <Button
                  size="sm"
                  onClick={() => handleImportResults(yesterdayDate)}
                  disabled={importing}
                  variant="default"
                  className="h-9"
                >
                  {importing ? <Spinner size="xs" className="mr-1.5" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                  {formatShort(yesterdayDate)} 결과 수거 ({yesterdayPendingCount.toLocaleString()}건)
                </Button>
                <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
              </>
            )}
            {yesterdayImportResult && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2a9d99]" />
                  <span>{formatShort(yesterdayDate)} 수거 완료</span>
                  <span className="text-muted-foreground">— 성공 {yesterdayImportResult.sent.toLocaleString()} · 실패 {yesterdayImportResult.failed.toLocaleString()}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
              </>
            )}

            {/* STEP 1: 대기열 생성 */}
            <Button
              size="sm"
              onClick={generateQueue}
              disabled={generating}
              variant={actionPhase === 'generate' ? 'default' : 'outline'}
              className="h-9"
            >
              {generating ? <Spinner size="xs" className="mr-1.5" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              {formatShort(sendDate)} 대기열 생성
            </Button>

            <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />

            {/* STEP 2: 시트 초기화 */}
            <Button
              size="sm"
              onClick={handleClearSheet}
              disabled={exporting}
              variant="outline"
              className="h-9"
            >
              시트 초기화
            </Button>

            <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />

            {/* STEP 3: 시트 내보내기 */}
            <Button
              size="sm"
              onClick={handleExportSheet}
              disabled={exporting || importing}
              variant={actionPhase === 'export' ? 'default' : 'outline'}
              className="h-9"
            >
              {exporting ? <Spinner size="xs" className="mr-1.5" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              {formatShort(sendDate)} 시트 내보내기
            </Button>

            <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />

            {/* STEP 4: 결과 가져오기 */}
            <Button
              size="sm"
              onClick={() => handleImportResults()}
              disabled={importing || exporting}
              variant={actionPhase === 'import' ? 'default' : 'outline'}
              className="h-9"
            >
              {importing ? <Spinner size="xs" className="mr-1.5" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
              {formatShort(sendDate)} 결과 가져오기
            </Button>

            {/* 진행 상황 텍스트 */}
            {generating && generatingProgress && (
              <span className="text-sm font-medium text-primary animate-pulse">{generatingProgress}</span>
            )}
            {/* 대기열 생성 상세 로그 */}
            {generateLogs.length > 0 && (
              <div className="w-full mt-2 font-mono text-xs text-muted-foreground bg-muted/30 rounded p-2 max-h-[300px] overflow-y-auto" ref={el => { if (el) el.scrollTop = el.scrollHeight }}>
                {generateLogs.map((log, i) => (
                  <div key={i} className={cn(
                    log.startsWith('✅') && 'text-foreground',
                    log.startsWith('🎉') && 'text-foreground font-medium',
                    log.startsWith('❌') && 'text-destructive',
                    log.startsWith('⚠️') && 'text-warning',
                  )}>{log}</div>
                ))}
              </div>
            )}
            {exportProgress && (
              <span className="text-xs text-muted-foreground animate-pulse">{exportProgress}</span>
            )}

            {/* 우측 부가 버튼 */}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {selectedIds.size > 0 && (
                <Button size="sm" variant="secondary" onClick={handleExportSelected} disabled={exporting} className="h-8">
                  <Upload className="mr-1 h-3 w-3" />
                  선택 내보내기 ({selectedIds.size}건)
                </Button>
              )}
              {totalCount > 0 && totalSummary.sent === 0 && totalSummary.failed === 0 && (
                <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={generating} className="h-8 text-xs">
                  {generating ? <Spinner size="xs" className="mr-1" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                  재생성
                </Button>
              )}
              {totalCount > 0 && (
                <Button size="sm" variant="outline" onClick={() => clearQueue()} className="h-8 text-destructive hover:text-destructive text-xs">
                  대기열 삭제
                </Button>
              )}
            </div>
          </div>

          {/* 내보내기/수거 타임스탬프 */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>마지막 내보내기: {formatTime(lastExportAt)}</span>
              <span>마지막 결과 수거: {formatTime(lastImportAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              {(totalSummary.sent > 0 || totalSummary.failed > 0) && (
                <span className="text-xs text-muted-foreground">결과가 있어 재생성 불가</span>
              )}
            </div>
          </div>

          {/* 결과 가져오기 진행 상황 */}
          {importProgress && (
            <div className="mt-3 pt-3 border-t space-y-2">
              {/* 시트 읽기 단계 */}
              {importProgress.phase === 'sheets' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">
                    {importing
                      ? `시트 읽는 중... (${importProgress.currentIndex + 1}/${importProgress.totalDevices}) ${importProgress.currentName}`
                      : '완료'}
                  </span>
                  {importProgress.totalDevices > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {importProgress.results.length}/{importProgress.totalDevices}
                    </span>
                  )}
                </div>
              )}
              {importProgress.phase !== 'sheets' && importProgress.totalDevices > 0 && (
                <div className="text-xs text-muted-foreground">
                  ✅ 시트 읽기 완료 ({importProgress.totalDevices}개 PC)
                </div>
              )}
              {importProgress.totalDevices > 0 && importProgress.phase === 'sheets' && (
                <Progress value={(importProgress.results.length / importProgress.totalDevices) * 100} className="h-1.5" />
              )}
              {importProgress.results.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {importProgress.results.map((r, i) => (
                    <span
                      key={i}
                      className={cn('text-xs px-2 py-0.5 rounded', r.error ? 'bg-destructive/10 text-destructive' : r.rows > 0 ? 'bg-muted' : 'bg-muted text-muted-foreground')}
                    >
                      {r.name || r.phone} {r.error ? '✗' : `${r.rows}건`}
                    </span>
                  ))}
                </div>
              )}
              {/* 상세 로그 */}
              {importProgress.logs.length > 0 && (
                <div className="mt-2 space-y-0.5 font-mono text-xs text-muted-foreground bg-muted/30 rounded p-2 max-h-[300px] overflow-y-auto" ref={el => { if (el) el.scrollTop = el.scrollHeight }}>
                  {importProgress.logs.map((log, i) => (
                    <div key={i} className={cn(
                      log.startsWith('✅') && 'text-foreground',
                      log.startsWith('🎉') && 'text-foreground font-medium',
                      log.startsWith('❌') && 'text-destructive',
                      log.startsWith('⚠️') && 'text-warning',
                    )}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 발송 설정 (접을 수 있는 영역) ── */}
      <CollapsibleCard
        title="발송 설정"
        description={`시작 ${startTime} · 메시지 ${msgDelay}초 · 파일 ${fileDelay}초`}
        action={settingsDirty ? (
          <Button size="sm" onClick={saveSettings} disabled={savingSettings} className="h-7 text-xs">
            {savingSettings ? <Spinner size="xs" /> : '저장'}
          </Button>
        ) : undefined}
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">시작 시각</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => { setStartTime(e.target.value); setSettingsDirty(true) }}
              className="w-[120px] h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">메시지 간격 (초)</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={msgDelay}
              onChange={(e) => { setMsgDelay(Number(e.target.value)); setSettingsDirty(true) }}
              className="w-[80px] h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">파일 간격 (초)</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={fileDelay}
              onChange={(e) => { setFileDelay(Number(e.target.value)); setSettingsDirty(true) }}
              className="w-[80px] h-8 text-xs"
            />
          </div>
          {settingsDirty && (
            <Button size="sm" onClick={saveSettings} disabled={savingSettings} className="h-8">
              {savingSettings ? <Spinner size="xs" /> : '저장'}
            </Button>
          )}
        </div>
      </CollapsibleCard>

      {/* ── 대기열 상태 배너 ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {totalSummary.total > 0 ? (
              <>대기열: <StatusBadge status="success" size="xs">생성 완료 ({totalSummary.total.toLocaleString()}건)</StatusBadge></>
            ) : (
              <>대기열: <span className="text-muted-foreground">없음</span></>
            )}
          </span>
          {sendDate && <span className="text-xs text-muted-foreground">({sendDate})</span>}
        </div>
        {totalSummary.total > 0 && totalSummary.pending === totalSummary.total && lastExportAt && (
          <p className="text-xs text-foreground font-medium flex items-center gap-1">
            <Info className="h-3 w-3" />
            발송 완료 후 &quot;결과 가져오기&quot;를 눌러야 결과가 반영됩니다
          </p>
        )}
      </div>

      {/* ── PC별 요약 카드 ── */}
      {devices.filter(d => d.is_active).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {devices.filter(d => d.is_active).map((d) => {
            const s = summary[d.id] || { total: 0, pending: 0, sent: 0, failed: 0 }
            const successRate = s.total > 0 ? Math.round((s.sent / s.total) * 100) : 0
            const failRate = s.total > 0 ? Math.round((s.failed / s.total) * 100) : 0
            const isSelected = selectedDevice === d.id
            return (
              <Card
                key={d.id}
                className={cn(
                  'cursor-pointer transition-all border-l-4',
                  isSelected ? 'ring-2 ring-primary/40 shadow-md' : 'hover:border-foreground/30 hover:shadow-sm',
                )}
                style={{ borderLeftColor: d.color || undefined }}
                onClick={() => { setSelectedDevice(isSelected ? '' : d.id); setCurrentPage(1) }}
              >
                <CardContent className="p-4">
                  {/* PC 이름 */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-sm">{d.phone_number}</span>
                    <span className="text-xs text-muted-foreground">{d.name || ''}</span>
                  </div>

                  {/* 핵심 지표: 3열 그리드 */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center">
                      <p className="text-xl font-bold tabular-nums">{s.pending}</p>
                      <p className="text-[10px] text-muted-foreground">대기</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-emerald-600 tabular-nums">{s.sent.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">성공 ({successRate}%)</p>
                    </div>
                    <div className="text-center">
                      <p className={cn('text-xl font-bold tabular-nums', s.failed > 0 ? 'text-destructive' : 'text-muted-foreground')}>{s.failed}</p>
                      <p className="text-[10px] text-muted-foreground">실패{s.total > 0 ? ` (${failRate}%)` : ''}</p>
                    </div>
                  </div>

                  {/* 프로그레스 바: 성공(초록) + 실패(빨강) */}
                  {s.total > 0 && (
                    <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${successRate}%` }}
                      />
                      {s.failed > 0 && (
                        <div
                          className="h-full bg-destructive transition-all duration-500"
                          style={{ width: `${failRate}%` }}
                        />
                      )}
                    </div>
                  )}

                  {/* 실패 처리 옵션 */}
                  {s.failed > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-8 text-xs justify-between"
                        onClick={(e) => {
                          e.stopPropagation()
                          setFailureModalDevice(d.id)
                        }}
                      >
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3" />
                          실패 {s.failed}건 처리
                        </span>
                        <span className="text-muted-foreground">실패 처리 ›</span>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* PC 탭 */}
      <Tabs value={selectedDevice || '__all__'} onValueChange={(v) => { setSelectedDevice(v === '__all__' ? '' : v); setCurrentPage(1) }}>
        <TabsList className="w-full justify-start overflow-x-auto h-auto p-1">
          <TabsTrigger value="__all__" className="text-xs">
            전체 ({totalSummary.total})
          </TabsTrigger>
          {devices.filter(d => d.is_active).map((d) => {
            const s = summary[d.id] || { total: 0, pending: 0, sent: 0, failed: 0 }
            return (
              <TabsTrigger key={d.id} value={d.id} className="text-xs">
                <span className="flex items-center gap-1">
                  {d.color && <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />}
                  {d.phone_number}
                </span>
                <span className="block text-muted-foreground ml-1">
                  {s.sent}/{s.total}
                  {s.failed > 0 && <span className="text-destructive ml-0.5">({s.failed})</span>}
                </span>
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      {/* 요약 + 필터 */}
      <FilterBar
        filters={
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1) }}>
              <SelectTrigger className="h-8 w-[100px] text-xs">
                <SelectValue placeholder="전체 상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="pending">대기</SelectItem>
                <SelectItem value="sent">성공</SelectItem>
                <SelectItem value="failed">미해결 실패</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="이름 검색"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-8 w-[180px] text-xs pl-7"
              />
            </div>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">전체 {displaySummary.total}</span>
            <StatusBadge status="neutral" size="xs">대기 {displaySummary.pending}</StatusBadge>
            <StatusBadge status="success" size="xs">성공 {displaySummary.sent}</StatusBadge>
            <StatusBadge status="error" size="xs">실패 {displaySummary.failed}</StatusBadge>
          </div>
        }
      />

      {/* 대기열 테이블 */}
      <Card>
        <CardContent className="p-0">
          {(loading || summaryLoading) ? (
            <SkeletonTable cols={10} rows={8} />
          ) : totalCount === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={Radio}
                title="대기열이 없습니다"
                description="'대기열 생성' 버튼을 눌러 발송 목록을 생성하세요"
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    />
                  </TableHead>
                  <TableHead className="whitespace-nowrap">예약시간</TableHead>
                  {!selectedDevice && <TableHead className="whitespace-nowrap">PC</TableHead>}
                  <TableHead className="whitespace-nowrap">카톡이름</TableHead>
                  <TableHead className="whitespace-nowrap">상품</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Day</TableHead>
                  <TableHead className="text-center whitespace-nowrap">순서</TableHead>
                  <TableHead className="text-center whitespace-nowrap">타입</TableHead>
                  <TableHead className="whitespace-nowrap">내용</TableHead>
                  <TableHead className="text-center whitespace-nowrap">상태</TableHead>
                  <TableHead className="whitespace-nowrap">처리시간</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item) => {
                  const sub = item.subscription
                  const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending
                  return (
                    <TableRow key={item.id} className={cn(
                      item.status === 'failed' && 'bg-destructive/5',
                      item.status === 'sent' && 'text-muted-foreground',
                      selectedIds.has(item.id) && 'bg-primary/5',
                    )}>
                      <TableCell className="py-1">
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={(checked) => handleSelectOne(item.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell className="py-1 text-xs tabular-nums font-mono whitespace-nowrap">
                        {item.estimated_time}
                      </TableCell>
                      {!selectedDevice && (
                        <TableCell className="py-1 text-xs whitespace-nowrap">
                          {devices.find(d => d.id === item.device_id)?.phone_number || '-'}
                        </TableCell>
                      )}
                      <TableCell className="py-1 text-xs font-medium whitespace-nowrap">
                        {item.kakao_friend_name}
                      </TableCell>
                      <TableCell className="py-1 text-xs font-mono whitespace-nowrap">
                        {sub?.product?.sku_code || '-'}
                      </TableCell>
                      <TableCell className="py-1 text-center text-xs tabular-nums whitespace-nowrap">
                        {item.day_number || (sub?.last_sent_day != null ? sub.last_sent_day + 1 : '-')}
                      </TableCell>
                      <TableCell className="py-1 text-center text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                        {item.message_seq || '-'}
                      </TableCell>
                      <TableCell className="py-1 text-center text-xs whitespace-nowrap">
                        {item.image_path ? '파일' : '텍스트'}
                      </TableCell>
                      <TableCell className="py-1 text-xs max-w-[250px] truncate">
                        {item.image_path
                          ? item.image_path.split('/').pop()
                          : item.message_content.slice(0, 60)
                        }
                      </TableCell>
                      <TableCell className="py-1 text-center">
                        <StatusBadge status={statusConfig.statusType} size="xs">
                          {statusConfig.label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="py-1 text-xs tabular-nums font-mono">
                        {item.sent_at ? new Date(item.sent_at).toLocaleTimeString('ko-KR', { hour12: false }) : '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-muted-foreground">
                {((currentPage - 1) * PAGE_LIMIT) + 1}–{Math.min(currentPage * PAGE_LIMIT, totalCount)}건 / 총 {totalCount}건
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  이전
                </Button>
                <span className="text-xs px-2 tabular-nums">{currentPage} / {totalPages}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  다음
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 실패 처리 모달 */}
      <Dialog open={!!failureModalDevice} onOpenChange={() => setFailureModalDevice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              실패 건 처리 — {devices.find(d => d.id === failureModalDevice)?.phone_number}
              {(() => {
                const s = failureModalDevice ? summary[failureModalDevice] : null
                return s ? ` (${s.failed}건)` : ''
              })()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              실패한 메시지를 구글시트에 다시 추가합니다. 수동으로 발송 후 결과 가져오기를 다시 눌러주세요.
            </p>
            <div className="text-xs text-muted-foreground bg-muted rounded p-2 space-y-1">
              <p><strong>고정 메시지</strong>: 실패한 메시지는 다음 대기열 생성 시 자동으로 재발송됩니다 (최대 3일치).</p>
              <p><strong>실시간 메시지</strong>: 밀린 날짜는 재발송 없이 기간 연장으로 처리됩니다 (항상 오늘 메시지 1건만 발송).</p>
              <p>3일 연속 발송에 실패한 구독은 자동으로 일시정지되며, 구독 관리에서 직접 재개할 수 있습니다.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFailureModalDevice(null)} disabled={failureSubmitting}>
              취소
            </Button>
            <Button onClick={handleFailureAction} disabled={failureSubmitting}>
              {failureSubmitting ? '처리 중...' : '지금 다시 보내기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ConfirmDialogElement}
    </div>
    </TooltipProvider>
  )
}
