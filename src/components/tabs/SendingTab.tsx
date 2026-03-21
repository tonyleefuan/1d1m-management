'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/lib/use-toast'
import { Radio, RefreshCw, Image as ImageIcon, Loader2 } from 'lucide-react'
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
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  error_message: string | null
  estimated_time: string
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
}

// ─── Component ──────────────────────────────────────────

export function SendingTab() {
  const { showSuccess, showError } = useToast()

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
  const [statusFilter, setStatusFilter] = useState('')

  // ─── Fetch ───

  const fetchDevices = useCallback(async () => {
    const res = await fetch('/api/admin/devices')
    if (res.ok) {
      const json = await res.json()
      setDevices(json.data || [])
    }
  }, [])

  const fetchSettings = useCallback(async () => {
    const res = await fetch('/api/sending/settings')
    if (res.ok) {
      const data = await res.json()
      setStartTime(data.send_start_time || '04:00')
      setMsgDelay(Number(data.send_message_delay) || 3)
      setFileDelay(Number(data.send_file_delay) || 6)
    }
  }, [])

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedDevice) params.set('device_id', selectedDevice)
    if (statusFilter) params.set('status', statusFilter)
    const res = await fetch(`/api/sending/queue?${params}`)
    if (res.ok) {
      const json = await res.json()
      setQueue(json.data || [])
      setSummary(json.summary || {})
    }
    setLoading(false)
  }, [selectedDevice, statusFilter])

  useEffect(() => { fetchDevices(); fetchSettings() }, [fetchDevices, fetchSettings])
  useEffect(() => { fetchQueue() }, [fetchQueue])

  // ─── Actions ───

  const saveSettings = async () => {
    setSavingSettings(true)
    const res = await fetch('/api/sending/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        send_start_time: startTime,
        send_message_delay: msgDelay,
        send_file_delay: fileDelay,
      }),
    })
    if (res.ok) {
      showSuccess('발송 설정이 저장되었습니다')
      setSettingsDirty(false)
    } else {
      showError('설정 저장에 실패했습니다')
    }
    setSavingSettings(false)
  }

  const generateQueue = async () => {
    setGenerating(true)
    const res = await fetch('/api/sending/generate', { method: 'POST' })
    const json = await res.json()
    if (res.ok) {
      showSuccess(`대기열 ${json.generated}건 생성 완료`)
      fetchQueue()
    } else {
      showError(json.error || '대기열 생성 실패')
    }
    setGenerating(false)
  }

  const clearQueue = async (deviceId?: string) => {
    const target = deviceId || selectedDevice || undefined
    const label = target ? getDeviceName(target) : '전체'
    if (!confirm(`${label} 대기열을 삭제하시겠습니까?`)) return
    const res = await fetch('/api/sending/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: target || null }),
    })
    if (res.ok) {
      showSuccess(`${label} 대기열 삭제 완료`)
      fetchQueue()
    } else {
      showError('대기열 삭제에 실패했습니다')
    }
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

  const STATUS_MAP: Record<string, { label: string; className: string }> = {
    pending: { label: '대기', className: 'bg-muted text-muted-foreground' },
    sent: { label: '성공', className: 'bg-emerald-100 text-emerald-800' },
    failed: { label: '실패', className: 'bg-destructive/10 text-destructive' },
  }

  const PRIORITY_LABELS: Record<number, string> = {
    1: '아주 빨리',
    2: '빨리',
    3: '보통',
    4: '늦게',
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
              <label className="text-xs text-muted-foreground">시작 시각</label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => { setStartTime(e.target.value); setSettingsDirty(true) }}
                className="w-[120px] h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">메시지 간격 (초)</label>
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
              <label className="text-xs text-muted-foreground">파일 간격 (초)</label>
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
                {savingSettings ? <Loader2 className="h-3 w-3 animate-spin" /> : '저장'}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              {queue.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => clearQueue()} className="h-8 text-destructive hover:text-destructive">
                  {selectedDevice ? '이 PC 대기열 삭제' : '전체 대기열 삭제'}
                </Button>
              )}
              <Button size="sm" onClick={generateQueue} disabled={generating} className="h-8">
                {generating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                대기열 생성
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PC 탭 */}
      <div className="flex items-center gap-1 border-b">
        <button
          onClick={() => setSelectedDevice('')}
          className={cn(
            'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
            !selectedDevice ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          전체 ({totalSummary.total})
        </button>
        {devices.filter(d => d.is_active).map((d) => {
          const s = summary[d.id] || { total: 0, pending: 0, sent: 0, failed: 0 }
          return (
            <button
              key={d.id}
              onClick={() => setSelectedDevice(d.id)}
              className={cn(
                'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                selectedDevice === d.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {d.name || d.phone_number.slice(-4)} ({s.total})
            </button>
          )
        })}
      </div>

      {/* 요약 + 필터 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">전체 {displaySummary.total}</span>
          <Badge variant="secondary" className="text-xs">대기 {displaySummary.pending}</Badge>
          <Badge variant="default" className="text-xs bg-emerald-500">성공 {displaySummary.sent}</Badge>
          {displaySummary.failed > 0 && (
            <Badge variant="destructive" className="text-xs">실패 {displaySummary.failed}</Badge>
          )}
        </div>
        <div className="ml-auto">
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
        </div>
      </div>

      {/* 대기열 테이블 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : queue.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={Radio}
                title="대기열이 없습니다"
                description="'대기열 생성' 버튼을 눌러 오늘 발송 목록을 생성하세요"
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">예약시간</TableHead>
                  {!selectedDevice && <TableHead className="w-[120px]">PC</TableHead>}
                  <TableHead className="w-[120px]">카톡이름</TableHead>
                  <TableHead className="w-[80px]">상품</TableHead>
                  <TableHead className="w-[60px] text-center">Day</TableHead>
                  <TableHead className="w-[50px] text-center">타입</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead className="w-[60px] text-center">상태</TableHead>
                  <TableHead className="w-[80px]">실제시간</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item) => {
                  const sub = item.subscription
                  const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.pending
                  return (
                    <TableRow key={item.id} className={cn(
                      item.status === 'failed' && 'bg-destructive/5',
                      item.status === 'sent' && 'text-muted-foreground',
                    )}>
                      <TableCell className="py-1 text-xs tabular-nums font-mono">
                        {item.estimated_time}
                      </TableCell>
                      {!selectedDevice && (
                        <TableCell className="py-1 text-xs">
                          {getDeviceName(item.device_id)}
                        </TableCell>
                      )}
                      <TableCell className="py-1 text-xs font-medium">
                        {item.kakao_friend_name}
                      </TableCell>
                      <TableCell className="py-1 text-xs font-mono">
                        {sub?.product?.sku_code || '-'}
                      </TableCell>
                      <TableCell className="py-1 text-center text-xs tabular-nums">
                        {sub?.day || '-'}
                      </TableCell>
                      <TableCell className="py-1 text-center text-xs">
                        {item.image_path
                          ? <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700">파일</Badge>
                          : <Badge variant="outline" className="text-[10px] px-1.5 py-0">텍스트</Badge>
                        }
                      </TableCell>
                      <TableCell className="py-1 text-xs max-w-[400px] truncate">
                        {item.image_path
                          ? item.image_path.split('/').pop()
                          : item.message_content.slice(0, 80)
                        }
                      </TableCell>
                      <TableCell className="py-1 text-center">
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', statusInfo.className)}>
                          {statusInfo.label}
                        </Badge>
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
    </div>
  )
}
