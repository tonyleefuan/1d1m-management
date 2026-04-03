'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { FilterBar } from '@/components/ui/filter-bar'
import { Spinner } from '@/components/ui/spinner'
import { SkeletonTable } from '@/components/ui/skeleton'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/lib/use-toast'
import { Checkbox } from '@/components/ui/checkbox'
import { Radio, RefreshCw, Upload, Download, Search } from 'lucide-react'
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
    day: number
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
  const [devices, setDevices] = useState<SendDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatingProgress, setGeneratingProgress] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')

  // 체크박스 + 검색
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  // 구글시트 연동
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [lastExportAt, setLastExportAt] = useState<string | null>(null)
  const [lastImportAt, setLastImportAt] = useState<string | null>(null)

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

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/sending/settings')
      if (!res.ok) throw new Error('설정 로드 실패')
      const data = await res.json()
      const st = data.send_start_time || '04:00'
      setStartTime(st)
      setMsgDelay(Number(data.send_message_delay) || 3)
      setFileDelay(Number(data.send_file_delay) || 6)
      // 설정 로드 후 디폴트 날짜 계산
      if (!sendDate) {
        setSendDate(getDefaultSendDate())
      }
      // 구글시트 연동 시각
      setLastExportAt(data.last_sheet_export_at || null)
      setLastImportAt(data.last_sheet_import_at || null)
    } catch (err) {
      showError(err instanceof Error ? err.message : '발송 설정을 불러오는데 실패했습니다')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showError])

  const fetchQueue = useCallback(async () => {
    if (!sendDate) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ date: sendDate })
      if (selectedDevice) params.set('device_id', selectedDevice)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/sending/queue?${params}`)
      if (!res.ok) throw new Error('발송 대기열 로드 실패')
      const json = await res.json()
      setQueue(json.data || [])
      setSummary(json.summary || {})
    } catch (err) {
      showError(err instanceof Error ? err.message : '발송 대기열을 불러오는데 실패했습니다')
    }
    setLoading(false)
  }, [sendDate, selectedDevice, statusFilter, showError])

  useEffect(() => { fetchDevices(); fetchSettings() }, [fetchDevices, fetchSettings])
  useEffect(() => { fetchQueue() }, [fetchQueue])

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
    setGenerating(true)
    setGeneratingProgress('PC 목록 조회 중...')

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
        showSuccess('발송 대상이 없습니다')
        setGenerating(false)
        setGeneratingProgress(null)
        return
      }

      // 2단계: PC별 순차 생성
      let totalGenerated = 0
      for (let i = 0; i < deviceList.length; i++) {
        const device = deviceList[i]
        setGeneratingProgress(`${device.phone_number} 처리 중... (${i + 1}/${deviceList.length} PC, 현재 ${totalGenerated}건)`)

        const devRes = await fetch('/api/sending/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: sendDate, device_id: device.id }),
        })
        const devJson = await devRes.json()
        if (!devRes.ok) throw new Error(devJson.error || `${device.phone_number} 생성 실패`)
        totalGenerated += devJson.generated || 0
      }

      showSuccess(`대기열 ${totalGenerated}건 생성 완료 (${deviceList.length}개 PC)`)
      fetchQueue()
    } catch (err) {
      showError(err instanceof Error ? err.message : '대기열 생성 실패')
    }

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
      fetchQueue()
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
    setGenerating(true)
    try {
      await fetch('/api/sending/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: null, date: sendDate }),
      })
      const genRes = await fetch('/api/sending/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: sendDate }),
      })
      const json = await genRes.json()
      if (!genRes.ok) throw new Error(json.error || '대기열 재생성 실패')
      showSuccess(`대기열 재생성 완료: ${json.generated}건`)
      fetchQueue()
    } catch (err) {
      showError(err instanceof Error ? err.message : '대기열 재생성 실패')
    }
    setGenerating(false)
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
    try {
      const res = await fetch('/api/sending/export-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: sendDate, force: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '시트 내보내기 실패')

      let msg = `구글시트 내보내기 완료: ${json.total}건 (${json.devices}개 PC)`
      if (json.autoImported) {
        msg += '\n(이전 미수거 결과를 자동으로 가져왔습니다)'
      }
      showSuccess(msg)
      setLastExportAt(new Date().toISOString())
      fetchQueue()
    } catch (err) {
      showError(err instanceof Error ? err.message : '시트 내보내기에 실패했습니다')
    }
    setExporting(false)
  }

  const handleExportSelected = async () => {
    if (selectedIds.size === 0) return
    setExporting(true)
    try {
      const res = await fetch('/api/sending/export-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: sendDate, queue_ids: Array.from(selectedIds), force: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '선택 내보내기 실패')
      showSuccess(`선택 내보내기 완료: ${json.total}건 (${json.devices}개 PC)${json.appended ? ' — 시트에 추가됨' : ''}`)
      setLastExportAt(new Date().toISOString())
      setSelectedIds(new Set())
      fetchQueue()
    } catch (err) {
      showError(err instanceof Error ? err.message : '선택 내보내기에 실패했습니다')
    }
    setExporting(false)
  }

  const handleImportResults = async () => {
    setImporting(true)
    try {
      const res = await fetch('/api/sending/import-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: sendDate }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '결과 가져오기 실패')
      showSuccess(`결과 가져오기 완료: 성공 ${json.sent}건, 실패 ${json.failed}건, 미처리 ${json.skipped}건`)
      setLastImportAt(new Date().toISOString())
      fetchQueue()
    } catch (err) {
      showError(err instanceof Error ? err.message : '결과 가져오기에 실패했습니다')
    }
    setImporting(false)
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

  const displaySummary = selectedDevice ? (summary[selectedDevice] || { total: 0, pending: 0, sent: 0, failed: 0 }) : totalSummary

  // 검색 필터링
  const filteredQueue = searchQuery
    ? queue.filter(item => {
        const q = searchQuery.toLowerCase()
        return item.kakao_friend_name?.toLowerCase().includes(q) ||
          item.message_content?.toLowerCase().includes(q) ||
          item.subscription?.product?.sku_code?.toLowerCase().includes(q)
      })
    : queue

  // 전체 선택/해제
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredQueue.map(item => item.id)))
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

  const isAllSelected = filteredQueue.length > 0 && filteredQueue.every(item => selectedIds.has(item.id))

  const formatTime = (isoStr: string | null) => {
    if (!isoStr) return '-'
    try {
      return new Date(isoStr).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch { return '-' }
  }

  // ─── Render ───

  return (
    <div className="space-y-4">
      <PageHeader
        title="발송 모니터링"
        description="PC별 발송 현황과 성공률을 모니터링합니다"
      />

      {/* 발송 설정 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">발송 설정</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">발송 날짜</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={sendDate}
                  onChange={(e) => setSendDate(e.target.value)}
                  className="w-[150px] h-8 text-xs"
                />
                {(() => {
                  const kstToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
                  const kstTomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d) })()
                  if (sendDate === kstToday) return <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">오늘</span>
                  if (sendDate === kstTomorrow) return <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">내일</span>
                  return null
                })()}
              </div>
            </div>
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
            <div className="ml-auto flex gap-2">
              {queue.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => clearQueue()} className="h-8 text-destructive hover:text-destructive">
                  {selectedDevice ? '이 PC 대기열 삭제' : '전체 대기열 삭제'}
                </Button>
              )}
              <div className="flex items-center gap-2">
                {generating && generatingProgress && (
                  <span className="text-xs text-muted-foreground max-w-[300px] truncate">{generatingProgress}</span>
                )}
                <Button size="sm" onClick={generateQueue} disabled={generating} className="h-8">
                  {generating ? <Spinner size="xs" className="mr-1" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                  대기열 생성
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 구글시트 연동 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">구글시트 연동</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button
              size="sm"
              onClick={handleExportSheet}
              disabled={exporting || totalSummary.total === 0}
              className="h-8"
            >
              {exporting ? <Spinner size="xs" className="mr-1" /> : <Upload className="mr-1 h-3 w-3" />}
              구글시트 내보내기
            </Button>
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleExportSelected}
                disabled={exporting}
                className="h-8"
              >
                {exporting ? <Spinner size="xs" className="mr-1" /> : <Upload className="mr-1 h-3 w-3" />}
                선택 내보내기 ({selectedIds.size}건)
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleImportResults}
              disabled={importing || totalSummary.total === 0}
              className="h-8"
            >
              {importing ? <Spinner size="xs" className="mr-1" /> : <Download className="mr-1 h-3 w-3" />}
              결과 가져오기
            </Button>
            <div className="ml-auto flex gap-4 text-xs text-muted-foreground">
              <span>마지막 내보내기: {formatTime(lastExportAt)}</span>
              <span>마지막 결과 수거: {formatTime(lastImportAt)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 대기열 상태 */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {totalSummary.total > 0 ? (
              <>대기열: <StatusBadge status="success" size="xs">생성 완료 ({totalSummary.total}건)</StatusBadge></>
            ) : (
              <>대기열: <span className="text-muted-foreground">없음</span></>
            )}
          </span>
          {sendDate && (
            <span className="text-xs text-muted-foreground">({sendDate})</span>
          )}
        </div>
        <div className="flex gap-2">
          {totalSummary.total > 0 && totalSummary.sent === 0 && totalSummary.failed === 0 && (
            <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={generating} className="h-7 text-xs">
              {generating ? <Spinner size="xs" className="mr-1" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              재생성
            </Button>
          )}
          {(totalSummary.sent > 0 || totalSummary.failed > 0) && (
            <span className="text-xs text-muted-foreground py-1">결과가 있어 재생성 불가</span>
          )}
        </div>
      </div>

      {/* PC별 요약 카드 */}
      {devices.filter(d => d.is_active).length > 0 && (
        <div className="grid grid-cols-5 gap-3">
          {devices.filter(d => d.is_active).map((d) => {
            const s = summary[d.id] || { total: 0, pending: 0, sent: 0, failed: 0 }
            return (
              <Card key={d.id} className="cursor-pointer hover:border-foreground/30 transition-colors border-l-4" style={{ borderLeftColor: d.color || undefined }} onClick={() => setSelectedDevice(d.id)}>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center justify-between">
                    <span>{d.phone_number}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs">대기 <span className="font-semibold">{s.pending}</span></span>
                    <span className="text-xs"><StatusBadge status="success" size="xs" variant="dot">성공 {s.sent}{s.total > 0 && ` (${Math.round((s.sent / s.total) * 100)}%)`}</StatusBadge></span>
                    <span className="text-xs"><StatusBadge status="error" size="xs" variant="dot">실패 {s.failed}{s.total > 0 && ` (${Math.round((s.failed / s.total) * 100)}%)`}</StatusBadge></span>
                  </div>
                  {s.total > 0 && (
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${Math.round((s.sent / s.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* PC 탭 */}
      <Tabs value={selectedDevice || '__all__'} onValueChange={(v) => setSelectedDevice(v === '__all__' ? '' : v)}>
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[100px] text-xs">
                <SelectValue placeholder="전체 상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="pending">대기</SelectItem>
                <SelectItem value="sent">성공</SelectItem>
                <SelectItem value="failed">실패</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="이름/상품 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
          {loading ? (
            <SkeletonTable cols={10} rows={8} />
          ) : queue.length === 0 ? (
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
                {filteredQueue.map((item) => {
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
                        {item.day_number || sub?.day || '-'}
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
        </CardContent>
      </Card>

      {ConfirmDialogElement}
    </div>
  )
}
