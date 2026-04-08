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
import { Radio, RefreshCw, RotateCcw } from 'lucide-react'
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

  // 대기열
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [summary, setSummary] = useState<Record<string, DeviceSummary>>({})
  const [devices, setDevices] = useState<SendDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [retrying, setRetrying] = useState(false)

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
      setStartTime(data.send_start_time || '04:00')
      setMsgDelay(Number(data.send_message_delay) || 3)
      setFileDelay(Number(data.send_file_delay) || 6)
    } catch (err) {
      showError(err instanceof Error ? err.message : '발송 설정을 불러오는데 실패했습니다')
    }
  }, [showError])

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
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
  }, [selectedDevice, statusFilter, showError])

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
    try {
      const res = await fetch('/api/sending/generate', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '대기열 생성 실패')
      showSuccess(`대기열 ${json.generated}건 생성 완료`)
      fetchQueue()
    } catch (err) {
      showError(err instanceof Error ? err.message : '대기열 생성 실패')
    }
    setGenerating(false)
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
        body: JSON.stringify({ device_id: target || null }),
      })
      if (!res.ok) throw new Error('대기열 삭제 실패')
      showSuccess(`${label} 대기열 삭제 완료`)
      fetchQueue()
    } catch (err) {
      showError(err instanceof Error ? err.message : '대기열 삭제에 실패했습니다')
    }
  }

  const handleRetry = async () => {
    if (selectedIds.size === 0) return
    const ok = await confirm({
      title: '다시 보내기',
      description: `선택한 ${selectedIds.size}건을 다시 발송 대기열에 추가하시겠습니까?`,
      confirmLabel: '다시 보내기',
    })
    if (!ok) return
    setRetrying(true)
    try {
      const res = await fetch('/api/sending/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!res.ok) throw new Error('다시 보내기 실패')
      const json = await res.json()
      showSuccess(`${json.updated}건 다시 보내기 설정 완료`)
      setSelectedIds(new Set())
      fetchQueue()
    } catch (err) {
      showError(err instanceof Error ? err.message : '다시 보내기에 실패했습니다')
    }
    setRetrying(false)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === queue.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(queue.map(q => q.id)))
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
      // 기존 대기열 삭제
      const clearRes = await fetch('/api/sending/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: null }),
      })
      if (!clearRes.ok) throw new Error('대기열 삭제 실패')
      // 크론 API로 재생성
      const genRes = await fetch('/api/cron/generate-queue', { method: 'POST' })
      const json = await genRes.json()
      if (!genRes.ok) throw new Error(json.error || '대기열 재생성 실패')
      showSuccess(`대기열 재생성 완료: ${json.total}건`)
      fetchQueue()
    } catch (err) {
      showError(err instanceof Error ? err.message : '대기열 재생성 실패')
    }
    setGenerating(false)
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

  // Auto-refresh when there are pending items
  useEffect(() => {
    if (totalSummary.pending > 0) {
      const interval = setInterval(() => {
        fetchQueue()
      }, 30000) // 30 seconds
      return () => clearInterval(interval)
    }
  }, [totalSummary.pending, fetchQueue])

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
              <Button size="sm" onClick={generateQueue} disabled={generating} className="h-8">
                {generating ? <Spinner size="xs" className="mr-1" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                대기열 생성
              </Button>
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
        </div>
        <div className="flex gap-2">
          {totalSummary.total > 0 && totalSummary.sent === 0 && (
            <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={generating} className="h-7 text-xs">
              {generating ? <Spinner size="xs" className="mr-1" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              재생성
            </Button>
          )}
          {totalSummary.sent > 0 && (
            <span className="text-xs text-muted-foreground py-1">발송 중에는 재생성 불가</span>
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
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">전체 {displaySummary.total}</span>
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
              className={cn(
                'cursor-pointer rounded-full transition-all',
                statusFilter === 'pending' && 'ring-2 ring-foreground ring-offset-1',
              )}
            >
              <StatusBadge status="neutral" size="xs">대기 {displaySummary.pending}</StatusBadge>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'sent' ? 'all' : 'sent')}
              className={cn(
                'cursor-pointer rounded-full transition-all',
                statusFilter === 'sent' && 'ring-2 ring-foreground ring-offset-1',
              )}
            >
              <StatusBadge status="success" size="xs">성공 {displaySummary.sent}</StatusBadge>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'failed' ? 'all' : 'failed')}
              className={cn(
                'cursor-pointer rounded-full transition-all',
                statusFilter === 'failed' && 'ring-2 ring-foreground ring-offset-1',
              )}
            >
              <StatusBadge status="error" size="xs">실패 {displaySummary.failed}</StatusBadge>
            </button>
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
                description="'대기열 생성' 버튼을 눌러 오늘 발송 목록을 생성하세요"
              />
            </div>
          ) : (
            <>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b">
                  <span className="text-sm font-medium">{selectedIds.size}건 선택</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRetry}
                    disabled={retrying}
                    className="h-7 text-xs"
                  >
                    {retrying ? <Spinner size="xs" className="mr-1" /> : <RotateCcw className="mr-1 h-3 w-3" />}
                    다시 보내기
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedIds(new Set())}
                    className="h-7 text-xs text-muted-foreground"
                  >
                    선택 해제
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <input
                        type="checkbox"
                        checked={queue.length > 0 && selectedIds.size === queue.length}
                        onChange={toggleSelectAll}
                        className="rounded border-border"
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
                        selectedIds.has(item.id) && 'bg-muted/50',
                      )}>
                        <TableCell className="py-1">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            className="rounded border-border"
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
            </>
          )}
        </CardContent>
      </Card>

      {ConfirmDialogElement}
    </div>
  )
}
