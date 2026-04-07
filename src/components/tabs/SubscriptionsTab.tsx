'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { FilterBar } from '@/components/ui/filter-bar'
import { Button } from '@/components/ui/button'
import { StatusBadge, type StatusType } from '@/components/ui/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'
import { Toast } from '@/components/ui/Toast'
import { useToast } from '@/lib/use-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { PC_COLORS, type SubscriptionStatus } from '@/lib/constants'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import { Timeline } from '@/components/ui/timeline'
import { Send, Pause, FileText, RefreshCw, Upload } from 'lucide-react'
import { FloatingChatButton } from '@/components/ui/floating-chat'
// CSV import removed — use scripts/import-subscriptions.ts for bulk import

// ─── Types ───────────────────────────────────────────────

interface SubRow {
  id: string
  status: SubscriptionStatus
  start_date: string | null
  end_date: string | null
  duration_days: number
  day: number
  d_day: number | null
  resume_date: string | null
  memo: string | null
  device_id: string | null
  send_priority: 1 | 2 | 3 | 4
  created_at?: string
  order_item?: {
    order?: {
      ordered_at?: string
      imweb_order_no?: string
    }
  } | null
  matched_order_no?: string | null
  customer: {
    id: string
    name: string
    phone: string | null
    phone_last4: string | null
    kakao_friend_name: string | null
  }
  product_id: string
  product: {
    id: string
    sku_code: string
    title: string
    message_type: string
  }
  device: {
    id: string
    phone_number: string
    name: string | null
  } | null
  // New computed fields from API
  current_day: number
  computed_status: 'active' | 'pending' | 'completed' | 'paused' | 'cancelled'
  computed_end_date: string
  pending_days: number[]
  missed_days: number
  // New DB fields
  last_sent_day: number
  backlog_mode: 'flagged' | 'bulk' | 'sequential' | null
  failure_date: string | null
  paused_days: number
  /** @deprecated DB 컬럼 잔존 — 코드 로직에서는 status === 'cancel' 사용 */
  is_cancelled: boolean
}

interface LogEntry {
  id: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  memo: string | null
  created_at: string
  user: { name: string } | null
}

interface DeviceOption {
  id: string
  phone_number: string
  name: string | null
  color: string | null
}

interface ProductOption {
  id: string
  sku_code: string
  title: string
}

// ─── Constants ───────────────────────────────────────────

const STATUS_MAP: Record<string, { status: StatusType; label: string; className?: string }> = {
  live: { status: 'info', label: '발송중' },
  pending: { status: 'warning', label: '대기' },
  pause: { status: 'neutral', label: '일시정지', className: 'bg-purple-100/60 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  archive: { status: 'neutral', label: '종료' },
  cancel: { status: 'error', label: '취소' },
}

const COMPUTED_STATUS_MAP: Record<string, { status: StatusType; label: string; className?: string }> = {
  active: { status: 'info', label: '활성' },
  pending: { status: 'warning', label: '대기' },
  completed: { status: 'neutral', label: '완료' },
  paused: { status: 'neutral', label: '정지', className: 'bg-purple-100/60 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  cancelled: { status: 'error', label: '취소' },
}

const FAILURE_BADGE_MAP: Record<string, { status: StatusType; label: string; className?: string }> = {
  flagged: { status: 'error', label: '🔴 실패' },
}

const PAGE_SIZE_OPTIONS = [50, 100, 200] as const

function getDeviceColor(device: DeviceOption | null, devices: DeviceOption[]): string | undefined {
  if (!device) return undefined
  if (device.color) return device.color
  const idx = devices.findIndex(d => d.id === device.id)
  return idx >= 0 ? PC_COLORS[idx % PC_COLORS.length] : undefined
}

// ─── API helper ──────────────────────────────────────────

async function updateSubscription(id: string, updates: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/subscriptions/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: data.error }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: '서버 연결에 실패했습니다' }
  }
}

async function bulkUpdateSubscriptions(ids: string[], updates: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/subscriptions/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, ...updates }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── Main Component ──────────────────────────────────────

const kstDateShort = (offsetDays: number) => {
  const d = new Date(); d.setDate(d.getDate() + offsetDays)
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
  const [, m, day] = s.split('-'); return `${Number(m)}/${Number(day)}`
}

export function SubscriptionsTab() {
  // Data state
  const [subs, setSubs] = useState<SubRow[]>([])
  const [loading, setLoading] = useState(true) // 초기 로딩 (Skeleton 표시)
  const [dailyUpdating, setDailyUpdating] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [refreshing, setRefreshing] = useState(false) // 리프레시 (Skeleton 미표시)
  const [total, setTotal] = useState(0)
  const isFirstLoad = useRef(true)
  const [devices, setDevices] = useState<DeviceOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [defaultDeviceId, setDefaultDeviceId] = useState<string | null>(null)

  // Filter state
  const [filters, setFilters] = useState({
    status: '',
    device_id: '',
    product_id: '',
    search: '',
    page: 1,
    pageSize: 50 as number,
    sort: 'start_date',
    order: 'desc' as 'asc' | 'desc',
  })

  // CSV Import state
  const [importOpen, setImportOpen] = useState(false)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Pause popover state
  const [pausePopoverId, setPausePopoverId] = useState<string | null>(null)
  const [pauseResumeDate, setPauseResumeDate] = useState('')

  // Detail sheet state
  const [detailSub, setDetailSub] = useState<SubRow | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [memoValue, setMemoValue] = useState('')

  // Inline edit state for kakao_friend_name
  const [editingKakaoId, setEditingKakaoId] = useState<string | null>(null)
  const [editingKakaoValue, setEditingKakaoValue] = useState('')

  // Search debounce
  const [searchInput, setSearchInput] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  // Toast
  const { toast, showSuccess, showError, clearToast } = useToast()

  // Confirm dialog
  const { confirm, ConfirmDialogElement } = useConfirmDialog()

  // ─── Data fetching ───────────────────────────────────

  useEffect(() => {
    fetch('/api/products/list')
      .then((r) => r.json())
      .then((d) => setProducts(d || []))
      .catch((err) => { console.error('상품 목록 로딩 실패:', err) })
    fetch('/api/admin/devices')
      .then((r) => r.json())
      .then((d) => setDevices(d?.data || d || []))
      .catch((err) => { console.error('디바이스 목록 로딩 실패:', err) })
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => setDefaultDeviceId(d.default_device_id || null))
      .catch((err) => { console.error('설정 로딩 실패:', err) })
  }, [])

  const fetchSubs = useCallback(async () => {
    // 첫 로딩만 Skeleton, 이후는 조용히 리프레시
    if (isFirstLoad.current) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    const params = new URLSearchParams()
    params.set('page', String(filters.page))
    params.set('limit', String(filters.pageSize))
    if (filters.status) params.set('status', filters.status)
    if (filters.device_id) params.set('device_id', filters.device_id)
    if (filters.product_id) params.set('product_id', filters.product_id)
    if (filters.search) params.set('search', filters.search)
    params.set('sort', filters.sort)
    params.set('order', filters.order)

    try {
      const res = await fetch(`/api/subscriptions/list?${params}`)
      if (!res.ok) throw new Error('API 오류')
      const data = await res.json()
      setSubs(data.data || [])
      setTotal(data.total || 0)
    } catch {
      showError('구독 목록을 불러오는데 실패했습니다')
    } finally {
      setLoading(false)
      setRefreshing(false)
      isFirstLoad.current = false
    }
  }, [filters, showError])

  useEffect(() => {
    fetchSubs()
  }, [fetchSubs])

  // searchTimer cleanup on unmount
  useEffect(() => {
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [])

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value)
      if (searchTimer.current) clearTimeout(searchTimer.current)
      searchTimer.current = setTimeout(() => {
        setFilters((f) => ({ ...f, search: value, page: 1 }))
      }, 300)
    },
    [],
  )

  // ─── Optimistic update helper ───────────────────────

  /** 로컬 state를 먼저 변경하고, API 실패 시 스냅샷에서 롤백 */
  const optimisticUpdate = useCallback(
    async (id: string, patch: Partial<SubRow>, apiUpdates: Record<string, unknown>, successMsg: string) => {
      // 1. 스냅샷 저장 + 즉시 로컬 반영
      let snapshot: SubRow | undefined
      setSubs((prev) => {
        snapshot = prev.find((s) => s.id === id)
        return prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      })
      // 2. 백그라운드 API 호출
      const result = await updateSubscription(id, apiUpdates)
      if (result.ok) {
        showSuccess(successMsg)
      } else {
        // 3. 실패 시 스냅샷으로 롤백 (리페치 없음)
        if (snapshot) {
          setSubs((prev) => prev.map((s) => (s.id === id ? snapshot! : s)))
        }
        showError(result.error || '변경에 실패했습니다. 다시 시도해주세요.')
      }
      return result.ok
    },
    [showSuccess, showError],
  )

  // ─── Inline update handlers ──────────────────────────

  const handleDeviceChange = async (id: string, deviceId: string) => {
    const device = deviceId ? devices.find((d) => d.id === deviceId) || null : null
    await optimisticUpdate(
      id,
      { device_id: deviceId || null, device: device as SubRow['device'] },
      { device_id: deviceId || null },
      'PC가 변경되었습니다',
    )
  }

  const handleKakaoNameSave = async (id: string, value: string) => {
    setEditingKakaoId(null)
    const sub = subs.find((s) => s.id === id)
    if (!sub) return
    const trimmed = value.trim()
    if (trimmed === (sub.customer?.kakao_friend_name || '')) return
    await optimisticUpdate(
      id,
      { customer: { ...sub.customer, kakao_friend_name: trimmed || null } },
      { kakao_friend_name: trimmed },
      '카톡이름이 변경되었습니다',
    )
  }

  const handleProductChange = async (subId: string, productId: string) => {
    const product = products.find(p => p.id === productId)
    if (!product) return
    const result = await updateSubscription(subId, { product_id: productId })
    if (result.ok) {
      showSuccess(`상품이 ${product.sku_code}(으)로 변경되었습니다`)
      fetchSubs()
    } else {
      showError(result.error || '상품 변경에 실패했습니다')
    }
  }

  const handleMemoSave = async () => {
    if (!detailSub) return
    await optimisticUpdate(
      detailSub.id,
      { memo: memoValue },
      { memo: memoValue },
      '메모가 저장되었습니다',
    )
    setDetailSub((prev) => (prev ? { ...prev, memo: memoValue } : null))
  }

  // ─── Failure resolution ─────────────────────────────

  const [resolveDialogOpen, setResolveDialogOpen] = useState(false)
  const [resolvingSub, setResolvingSub] = useState<SubRow | null>(null)

  const handleResolveFailure = async (sub: SubRow, action: 'manual_sent' | 'bulk' | 'sequential') => {
    const res = await fetch('/api/subscriptions/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: sub.id,
        resolve_failure: { action },
      }),
    })
    if (res.ok) {
      showSuccess(action === 'manual_sent' ? '직접 발송 처리됨' : action === 'bulk' ? '몰아서 보내기 설정됨' : '하루씩 보내기 설정됨')
      setResolveDialogOpen(false)
      setResolvingSub(null)
      fetchSubs()
    } else {
      showError('실패 해제 중 오류가 발생했습니다')
    }
  }

  // ─── Bulk actions ────────────────────────────────────

  const handleBulkStatus = async (status: string) => {
    if (selectedIds.size === 0) return
    if (await bulkUpdateSubscriptions(Array.from(selectedIds), { status })) {
      showSuccess(`${selectedIds.size}건의 상태가 ${STATUS_MAP[status]?.label ?? status}(으)로 변경되었습니다`)
      setSelectedIds(new Set())
      fetchSubs()
    } else {
      showError('일괄 상태 변경에 실패했습니다')
    }
  }

  // ─── Selection (Shift+Click 범위 선택 지원) ─────────

  const lastClickedIdx = useRef<number | null>(null)

  const toggleSelect = (id: string, event?: React.MouseEvent) => {
    const currentIdx = subs.findIndex((s) => s.id === id)

    if (event?.shiftKey && lastClickedIdx.current !== null && currentIdx !== -1) {
      // Shift+Click: 범위 선택
      const start = Math.min(lastClickedIdx.current, currentIdx)
      const end = Math.max(lastClickedIdx.current, currentIdx)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (let i = start; i <= end; i++) {
          next.add(subs[i].id)
        }
        return next
      })
    } else {
      // 일반 클릭: 토글
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }
    lastClickedIdx.current = currentIdx
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === subs.length && subs.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(subs.map((s) => s.id)))
    }
  }

  // ─── Bulk device assignment ────────────────────────

  const handleBulkDevice = async (deviceId: string) => {
    if (selectedIds.size === 0) return
    if (await bulkUpdateSubscriptions(Array.from(selectedIds), { device_id: deviceId || null })) {
      const device = devices.find((d) => d.id === deviceId)
      showSuccess(`${selectedIds.size}건의 PC가 ${device ? device.phone_number : '미배정'}(으)로 변경되었습니다`)
      setSelectedIds(new Set())
      fetchSubs()
    } else {
      showError('일괄 PC 변경에 실패했습니다')
    }
  }

  // ─── Detail sheet + history ─────────────────────────

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  const openDetail = async (sub: SubRow) => {
    setDetailSub(sub)
    setMemoValue(sub.memo || '')
    setSheetOpen(true)
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/subscriptions/logs?subscription_id=${sub.id}`)
      if (res.ok) setLogs(await res.json())
      else setLogs([])
    } catch (err) { console.error('히스토리 로딩 실패:', err); setLogs([]) } finally { setLogsLoading(false) }
  }

  // ─── Pagination ──────────────────────────────────────

  const totalPages = Math.ceil(total / filters.pageSize)

  // ─── Sort helpers ──────────────────────────────────────

  const toggleSort = (field: string) => {
    setFilters((f) => ({
      ...f,
      sort: field,
      order: f.sort === field && f.order === 'desc' ? 'asc' : 'desc',
      page: 1,
    }))
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (filters.sort !== field) return <span className="text-muted-foreground/30 ml-0.5">↕</span>
    return <span className="ml-0.5">{filters.order === 'asc' ? '↑' : '↓'}</span>
  }

  // ─── Default device handler ────────────────────────────

  const handleDefaultDeviceChange = async (deviceId: string) => {
    const value = deviceId === '__none__' ? null : deviceId
    setDefaultDeviceId(value)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'default_device_id', value }),
      })
      if (res.ok) showSuccess('기본 PC가 설정되었습니다')
      else showError('기본 PC 설정에 실패했습니다')
    } catch {
      showError('기본 PC 설정에 실패했습니다')
    }
  }

  // ─── Quick filter tabs ───────────────────────────────

  const quickFilters = [
    { label: '전체', active: filters.status === '', onClick: () => setFilters((f) => ({ ...f, status: '', page: 1 })) },
    { label: '발송중', active: filters.status === 'live', onClick: () => setFilters((f) => ({ ...f, status: 'live', page: 1 })) },
    { label: '대기', active: filters.status === 'pending', onClick: () => setFilters((f) => ({ ...f, status: 'pending', page: 1 })) },
    { label: '일시정지', active: filters.status === 'pause', onClick: () => setFilters((f) => ({ ...f, status: 'pause', page: 1 })) },
    { label: '종료', active: filters.status === 'archive', onClick: () => setFilters((f) => ({ ...f, status: 'archive', page: 1 })) },
    { label: '취소', active: filters.status === 'cancel', onClick: () => setFilters((f) => ({ ...f, status: 'cancel', page: 1 })) },
  ]

  // ─── Render ──────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <PageHeader title="구독 관리" description="고객별 구독 현황을 관리합니다 · Day = 가장 최근 발송 Day (발송 모니터링의 Day는 다음 발송할 Day)">
        <Button
          size="sm"
          variant="outline"
          disabled={dailyUpdating}
          onClick={async () => {
            setDailyUpdating(true)
            try {
              const res = await fetch('/api/subscriptions/daily-update', { method: 'POST' })
              if (!res.ok) throw new Error()
              const data = await res.json()
              const total = data.pending_to_live + data.live_to_archive + data.pause_to_live
              if (total > 0) {
                showSuccess(`상태 업데이트 완료 — 발송시작 ${data.pending_to_live}, 만료 ${data.live_to_archive}, 재개 ${data.pause_to_live}`)
                fetchSubs()
              } else {
                showSuccess('변경 대상이 없습니다')
              }
            } catch {
              showError('상태 업데이트에 실패했습니다')
            } finally {
              setDailyUpdating(false)
            }
          }}
        >
          <RefreshCw className={cn('mr-1 h-3 w-3', dailyUpdating && 'animate-spin')} />
          상태 업데이트
        </Button>
      </PageHeader>

      {/* 2.5 PC 배정 설정 */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-xs font-medium">기본 PC</span>
        <Select
          value={defaultDeviceId || '__none__'}
          onValueChange={handleDefaultDeviceChange}
        >
          <SelectTrigger className="h-7 w-[200px] text-xs">
            <SelectValue placeholder="미설정" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">미설정</SelectItem>
            {devices.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: getDeviceColor(d, devices) }}
                  />
                  {d.phone_number}{d.name ? ` (${d.name})` : ''}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground">
          새 주문 확정 시 과거 배정 이력이 없으면 이 PC로 자동 배정
        </span>
      </div>

      {/* 3. Filter Bar */}
      <FilterBar
        search={{
          value: searchInput,
          onChange: handleSearchChange,
          placeholder: '고객명 / 카톡이름 / 뒷4자리 검색',
        }}
        quickFilters={quickFilters}
        filters={
          <>
            <Select
              value={filters.device_id}
              onValueChange={(v) => setFilters((f) => ({ ...f, device_id: v === '__all__' ? '' : v, page: 1 }))}
            >
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="전체 PC" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체 PC</SelectItem>
                {devices.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: getDeviceColor(d, devices) }}
                      />
                      {d.phone_number}{d.name ? ` (${d.name})` : ''}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.product_id}
              onValueChange={(v) => setFilters((f) => ({ ...f, product_id: v === '__all__' ? '' : v, page: 1 }))}
            >
              <SelectTrigger className="w-[240px] h-8 text-xs">
                <SelectValue placeholder="전체 상품" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체 상품</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.sku_code} {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        layout="stacked"
      />

      {/* Bulk action bar — 테이블 바로 위 */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-muted/80 backdrop-blur rounded-lg border">
          <Badge variant="secondary" className="text-xs">
            {selectedIds.size}건 선택
          </Badge>
          <Button size="sm" variant="outline" onClick={() => handleBulkStatus('live')}>
            <Send className="mr-1 h-3 w-3" />
            발송 시작
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkStatus('pause')}>
            <Pause className="mr-1 h-3 w-3" />
            일시정지
          </Button>
          <Select onValueChange={(v) => handleBulkDevice(v === '__none__' ? '' : v)}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="PC 일괄 배정" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">미배정</SelectItem>
              {devices.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: getDeviceColor(d, devices) }}
                    />
                    {d.phone_number}{d.name ? ` (${d.name})` : ''}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="destructive" onClick={() => handleBulkStatus('cancel')}>
            취소
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto">
            선택 해제
          </Button>
        </div>
      )}

      {/* 4. Table */}
      {loading ? (
        <SkeletonTable rows={10} cols={14} />
      ) : subs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="구독 내역이 없습니다"
          description="주문을 업로드하면 구독이 자동 생성됩니다"
        />
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            총 {total.toLocaleString()}건
          </div>
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table className="whitespace-nowrap">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.size === subs.length && subs.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-[90px] cursor-pointer select-none" onClick={() => toggleSort('created_at')}>
                    주문일 <SortIcon field="created_at" />
                  </TableHead>
                  <TableHead className="w-[130px]">주문번호</TableHead>
                  <TableHead className="w-[80px]">상태</TableHead>
                  <TableHead className="w-[90px]">발송상태</TableHead>
                  <TableHead className="w-[110px]">PC</TableHead>
                  <TableHead className="min-w-[80px]">고객명</TableHead>
                  <TableHead className="min-w-[80px]">카톡이름</TableHead>
                  <TableHead
                    className="w-[50px] text-center cursor-pointer select-none"
                    onClick={() => toggleSort('day')}
                    title="가장 최근 발송 Day (발송 모니터링의 Day는 다음 발송할 Day)"
                  >
                    최근 발송 <SortIcon field="day" />
                  </TableHead>
                  <TableHead className="w-[90px]">상품</TableHead>
                  <TableHead className="min-w-[120px]">상품명</TableHead>
                  <TableHead className="w-[60px] text-center">기간</TableHead>
                  <TableHead className="w-[110px] cursor-pointer select-none" onClick={() => toggleSort('start_date')}>
                    시작일 <SortIcon field="start_date" />
                  </TableHead>
                  <TableHead className="w-[90px] cursor-pointer select-none" onClick={() => toggleSort('end_date')}>
                    종료일 <SortIcon field="end_date" />
                  </TableHead>
                  <TableHead className="w-[60px] text-center">D-Day</TableHead>
                  <TableHead className="w-[100px]">정지/재개</TableHead>
                  <TableHead className="w-[80px] text-center">발송순서</TableHead>
                  <TableHead className="min-w-[100px]">메모</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((sub) => {
                  return (
                    <TableRow key={sub.id} className="group">
                      {/* 1. Checkbox (Shift+Click 범위 선택 지원) */}
                      <TableCell
                        className="py-1 cursor-pointer select-none"
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          toggleSelect(sub.id, e)
                        }}
                      >
                        <Checkbox
                          checked={selectedIds.has(sub.id)}
                          className="pointer-events-none"
                        />
                      </TableCell>

                      {/* 주문일 */}
                      <TableCell className="py-1 text-xs tabular-nums text-muted-foreground">
                        {sub.order_item?.order?.ordered_at?.slice(0, 10) || sub.created_at?.slice(0, 10) || '-'}
                      </TableCell>

                      {/* 주문번호 */}
                      <TableCell className="py-1 font-mono text-[11px] text-muted-foreground">
                        {sub.matched_order_no || sub.order_item?.order?.imweb_order_no || '-'}
                      </TableCell>

                      {/* 상태 (읽기 전용) */}
                      <TableCell className="py-1">
                        <StatusBadge
                          status={COMPUTED_STATUS_MAP[sub.computed_status]?.status ?? 'neutral'}
                          size="xs"
                          className={COMPUTED_STATUS_MAP[sub.computed_status]?.className}
                        >
                          {COMPUTED_STATUS_MAP[sub.computed_status]?.label ?? sub.computed_status}
                        </StatusBadge>
                      </TableCell>

                      {/* 발송상태 */}
                      <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                        {sub.backlog_mode === 'flagged' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-0 cursor-pointer"
                            title={`${sub.failure_date || ''} 발송 실패`}
                            onClick={() => {
                              setResolvingSub(sub)
                              setResolveDialogOpen(true)
                            }}
                          >
                            <StatusBadge
                              status={FAILURE_BADGE_MAP[sub.backlog_mode]?.status ?? 'error'}
                              size="xs"
                              className={FAILURE_BADGE_MAP[sub.backlog_mode]?.className}
                            >
                              {FAILURE_BADGE_MAP[sub.backlog_mode]?.label ?? sub.backlog_mode}
                            </StatusBadge>
                          </Button>
                        ) : (
                          <StatusBadge status="success" size="xs">✅ 정상</StatusBadge>
                        )}
                      </TableCell>

                      {/* PC */}
                      <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={sub.device_id || '__none__'}
                          onValueChange={(v) => handleDeviceChange(sub.id, v === '__none__' ? '' : v)}
                        >
                          <SelectTrigger
                            className="h-6 w-[140px] text-xs border-0 bg-transparent px-1"
                          >
                            <SelectValue placeholder="미배정">
                              <span className="flex items-center gap-1.5">
                                {sub.device_id && (() => {
                                  const color = getDeviceColor(
                                    devices.find(d => d.id === sub.device_id) || null,
                                    devices
                                  )
                                  return color ? (
                                    <span
                                      className="inline-block w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: color }}
                                    />
                                  ) : null
                                })()}
                                <span className="truncate">
                                  {(() => {
                                    const dev = devices.find(d => d.id === sub.device_id)
                                    return dev ? dev.phone_number : '미배정'
                                  })()}
                                </span>
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">미배정</SelectItem>
                            {devices.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: getDeviceColor(d, devices) }}
                                  />
                                  {d.phone_number}{d.name ? ` (${d.name})` : ''}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* 고객명 */}
                      <TableCell
                        className="py-1 text-xs font-medium cursor-pointer"
                        onClick={() => openDetail(sub)}
                      >
                        {sub.customer?.name}
                      </TableCell>

                      {/* 3. 카톡이름 (inline editable) */}
                      <TableCell className="py-1 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                        {editingKakaoId === sub.id ? (
                          <Input
                            autoFocus
                            className="h-6 w-[100px] text-xs px-1"
                            value={editingKakaoValue}
                            onChange={(e) => setEditingKakaoValue(e.target.value)}
                            onBlur={() => handleKakaoNameSave(sub.id, editingKakaoValue)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleKakaoNameSave(sub.id, editingKakaoValue)
                              if (e.key === 'Escape') setEditingKakaoId(null)
                            }}
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:text-foreground"
                            onClick={() => {
                              setEditingKakaoId(sub.id)
                              setEditingKakaoValue(sub.customer?.kakao_friend_name || '')
                            }}
                          >
                            {sub.customer?.kakao_friend_name || '-'}
                          </span>
                        )}
                      </TableCell>

                      {/* Day */}
                      <TableCell className="py-1 text-center text-xs tabular-nums" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-transparent hover:border-muted-foreground/40 hover:bg-muted/50 cursor-pointer transition-colors text-foreground"
                          title="클릭하여 Day 변경"
                          onClick={() => {
                            const input = prompt(`다음 발송할 Day를 입력하세요.\n\n현재 Day: ${sub.current_day}\n\n예) 30 입력 → Day 30부터 발송\n(1~${sub.duration_days} 범위)`)
                            if (input === null) return
                            const num = parseInt(input, 10)
                            if (isNaN(num) || num < 1 || num > sub.duration_days) {
                              showError(`1~${sub.duration_days} 범위의 숫자를 입력하세요`)
                              return
                            }
                            updateSubscription(sub.id, { last_sent_day: num - 1 }).then(result => {
                              if (result.ok) {
                                showSuccess(`Day ${num}부터 발송됩니다`)
                                fetchSubs()
                              } else {
                                showError(result.error || 'Day 변경에 실패했습니다')
                              }
                            })
                          }}
                        >
                          {sub.last_sent_day > 0 ? sub.last_sent_day : '-'}
                        </button>
                      </TableCell>

                      {/* 5. 상품 */}
                      <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={sub.product_id}
                          onValueChange={(v) => handleProductChange(sub.id, v)}
                        >
                          <SelectTrigger className="h-6 w-[100px] text-xs border-0 bg-transparent px-1 font-mono">
                            <SelectValue>{sub.product?.sku_code || '-'}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.sku_code} — {p.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* 5.5 상품명 */}
                      <TableCell className="py-1 text-xs text-muted-foreground">
                        {sub.product?.title || '-'}
                      </TableCell>

                      {/* 6. 기간 */}
                      <TableCell className="py-1 text-center text-xs tabular-nums">
                        {sub.duration_days}일
                      </TableCell>

                      {/* 7. 시작일 */}
                      <TableCell className="py-1 text-xs tabular-nums">
                        {sub.start_date || '-'}
                      </TableCell>

                      {/* 8. 종료일 */}
                      <TableCell className="py-1 text-xs tabular-nums">
                        {sub.end_date || '-'}
                      </TableCell>

                      {/* 10. D-Day */}
                      <TableCell
                        className={cn(
                          'py-1 text-center text-xs tabular-nums font-medium',
                          sub.computed_status === 'paused'
                            ? 'text-muted-foreground'
                            : sub.d_day !== null && sub.d_day <= 0
                              ? 'text-destructive'
                              : sub.d_day !== null && sub.d_day <= 7
                                ? 'text-amber-600 dark:text-amber-400'
                                : '',
                        )}
                      >
                        {sub.computed_status === 'paused' ? '정지' : sub.d_day !== null ? sub.d_day : '-'}
                      </TableCell>

                      {/* 정지/재개 */}
                      <TableCell className="py-1 text-xs" onClick={(e) => e.stopPropagation()}>
                        {(sub.computed_status === 'paused' || sub.computed_status === 'active') ? (
                          <Popover
                            open={pausePopoverId === sub.id}
                            onOpenChange={(open) => {
                              if (!open) {
                                setPausePopoverId(null)
                                setPauseResumeDate('')
                              }
                            }}
                          >
                            <div className="flex items-center gap-1.5">
                              <PopoverTrigger asChild>
                                <div>
                                  <Switch
                                    size="sm"
                                    checked={sub.computed_status !== 'paused'}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        // 재개: pause → live (바로 실행)
                                        optimisticUpdate(
                                          sub.id,
                                          { status: 'live' as SubscriptionStatus, computed_status: 'active', paused_at: null, resume_date: null } as unknown as Partial<SubRow>,
                                          { status: 'live' },
                                          '정지 해제'
                                        )
                                      } else {
                                        // 정지: 팝오버 열어서 재개예정일 입력
                                        setPausePopoverId(sub.id)
                                        setPauseResumeDate('')
                                      }
                                    }}
                                  />
                                </div>
                              </PopoverTrigger>
                              <span className={cn('text-[11px]', sub.computed_status === 'paused' ? 'text-purple-700 dark:text-purple-300' : 'text-muted-foreground')}>
                                {sub.computed_status === 'paused'
                                  ? (sub.resume_date ? `~${sub.resume_date.slice(5)}` : '정지')
                                  : '발송중'}
                              </span>
                            </div>
                            <PopoverContent align="start" className="w-56 p-3">
                              <div className="space-y-3">
                                <p className="text-xs font-medium">재개예정일 (선택)</p>
                                <Input
                                  type="date"
                                  className="h-8 text-xs"
                                  value={pauseResumeDate}
                                  min={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())}
                                  onChange={(e) => setPauseResumeDate(e.target.value)}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 h-7 text-xs"
                                    onClick={() => {
                                      setPausePopoverId(null)
                                      setPauseResumeDate('')
                                    }}
                                  >
                                    취소
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="flex-1 h-7 text-xs"
                                    onClick={() => {
                                      const now = new Date().toISOString()
                                      optimisticUpdate(
                                        sub.id,
                                        {
                                          status: 'pause' as SubscriptionStatus,
                                          computed_status: 'paused',
                                          paused_at: now,
                                          ...(pauseResumeDate ? { resume_date: pauseResumeDate } : {}),
                                        } as unknown as Partial<SubRow>,
                                        {
                                          status: 'pause',
                                          paused_at: now,
                                          ...(pauseResumeDate ? { resume_date: pauseResumeDate } : {}),
                                        },
                                        pauseResumeDate ? `${pauseResumeDate}까지 정지` : '무기한 정지'
                                      )
                                      setPausePopoverId(null)
                                      setPauseResumeDate('')
                                    }}
                                  >
                                    정지
                                  </Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>

                      {/* 16. 발송순서 */}
                      <TableCell className="py-1 text-center" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={String(sub.send_priority || 3)}
                          onValueChange={(v) =>
{
                              const p = Number(v) as 1|2|3|4
                              optimisticUpdate(sub.id, { send_priority: p }, { send_priority: p }, '발송순서 변경')
                            }
                          }
                        >
                          <SelectTrigger className="h-6 w-[90px] text-xs border-0 bg-transparent px-1">
                            <SelectValue>
                              {({ 1: '🐆 아주빨리', 2: '🐇 빨리', 3: '🚶 보통', 4: '🐢 늦게' } as Record<number, string>)[(sub.send_priority || 3)]}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">🐆 아주빨리</SelectItem>
                            <SelectItem value="2">🐇 빨리</SelectItem>
                            <SelectItem value="3">🚶 보통</SelectItem>
                            <SelectItem value="4">🐢 늦게</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* 메모 */}
                      <TableCell
                        className="py-1 text-xs text-muted-foreground cursor-pointer truncate max-w-[150px]"
                        title={sub.memo || undefined}
                        onClick={() => openDetail(sub)}
                      >
                        {sub.memo ? sub.memo.slice(0, 20) + (sub.memo.length > 20 ? '...' : '') : '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-1">
              {PAGE_SIZE_OPTIONS.map((size) => (
                <Button
                  key={size}
                  variant={filters.pageSize === size ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setFilters((f) => ({ ...f, pageSize: size, page: 1 }))}
                >
                  {size}개
                </Button>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))}
                  disabled={filters.page === 1}
                >
                  이전
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {filters.page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                  disabled={filters.page >= totalPages}
                >
                  다음
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* 5. Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" size="md">
          <SheetHeader>
            <SheetTitle>{detailSub?.customer?.name ?? '구독 상세'}</SheetTitle>
            <SheetDescription>
              {detailSub?.product?.sku_code} &middot; {detailSub?.product?.title}
            </SheetDescription>
          </SheetHeader>

          {detailSub && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {/* Customer info */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">고객 정보</h3>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <div className="text-muted-foreground">이름</div>
                  <div>{detailSub.customer.name}</div>
                  <div className="text-muted-foreground">뒷4자리</div>
                  <div>{detailSub.customer.phone_last4 || '-'}</div>
                  <div className="text-muted-foreground">카톡이름</div>
                  <div>{detailSub.customer.kakao_friend_name || '-'}</div>
                </div>
              </section>

              {/* Subscription details */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">구독 정보</h3>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <div className="text-muted-foreground">상태</div>
                  <div>
                    <StatusBadge status={COMPUTED_STATUS_MAP[detailSub.computed_status]?.status ?? 'neutral'} size="sm" className={COMPUTED_STATUS_MAP[detailSub.computed_status]?.className}>
                      {COMPUTED_STATUS_MAP[detailSub.computed_status]?.label ?? detailSub.computed_status}
                    </StatusBadge>
                  </div>
                  <div className="text-muted-foreground">상품</div>
                  <div><span className="font-mono text-xs">{detailSub.product.sku_code}</span> <span className="text-xs text-muted-foreground">{detailSub.product.title}</span></div>
                  <div className="text-muted-foreground">주문일</div>
                  <div className="tabular-nums">{detailSub.order_item?.order?.ordered_at?.slice(0, 10) || detailSub.created_at?.slice(0, 10) || '-'}</div>
                  <div className="text-muted-foreground">기간</div>
                  <div>{detailSub.duration_days}일</div>
                  <div className="text-muted-foreground">시작일</div>
                  <div className="tabular-nums">{detailSub.start_date || '-'}</div>
                  <div className="text-muted-foreground">종료일</div>
                  <div className="tabular-nums">{detailSub.end_date || '-'}</div>
                  <div className="text-muted-foreground">Day / D-Day</div>
                  <div className="tabular-nums">
                    {detailSub.computed_status === 'paused'
                      ? `${detailSub.current_day}일째 / 정지`
                      : detailSub.start_date
                        ? `${detailSub.current_day}일째 / D-${detailSub.d_day ?? '-'}`
                        : '-'}
                  </div>
                  <div className="text-muted-foreground">PC</div>
                  <div>
                    {detailSub.device
                      ? `${detailSub.device.phone_number?.slice(-4)} ${detailSub.device.name ? `(${detailSub.device.name})` : ''}`
                      : '미배정'}
                  </div>
                  <div className="text-muted-foreground">발송상태</div>
                  <div className="flex items-center gap-2">
                    {detailSub.backlog_mode === 'flagged' ? (
                      <>
                        <StatusBadge
                          status={FAILURE_BADGE_MAP[detailSub.backlog_mode]?.status ?? 'error'}
                          size="xs"
                          className={FAILURE_BADGE_MAP[detailSub.backlog_mode]?.className}
                        >
                          {FAILURE_BADGE_MAP[detailSub.backlog_mode]?.label ?? detailSub.backlog_mode}
                        </StatusBadge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 text-[10px] px-1.5"
                          onClick={() => {
                            setResolvingSub(detailSub)
                            setResolveDialogOpen(true)
                          }}
                        >
                          해결
                        </Button>
                      </>
                    ) : (
                      <StatusBadge status="success" size="xs">✅ 정상</StatusBadge>
                    )}
                  </div>
                  <div className="text-muted-foreground">마지막 발송 Day</div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">Day {detailSub.last_sent_day ?? 0}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-5 text-[10px] px-1.5"
                      onClick={async () => {
                        const input = prompt(`다음 발송할 Day를 입력하세요.\n\n현재 마지막 발송: Day ${detailSub.last_sent_day ?? 0}\n\n예) 30 입력 → Day 30부터 발송\n(1~${detailSub.duration_days} 범위)`)
                        if (input === null) return
                        const num = parseInt(input, 10)
                        if (isNaN(num) || num < 1 || num > detailSub.duration_days) {
                          showError(`1~${detailSub.duration_days} 범위의 숫자를 입력하세요`)
                          return
                        }
                        const result = await updateSubscription(detailSub.id, { last_sent_day: num - 1 })
                        if (result.ok) {
                          showSuccess(`Day ${num}부터 발송됩니다`)
                          fetchSubs()
                          setDetailSub({ ...detailSub, last_sent_day: num - 1 })
                        } else {
                          showError(result.error || 'Day 변경에 실패했습니다')
                        }
                      }}
                    >
                      변경
                    </Button>
                  </div>
                  {detailSub.computed_status === 'paused' && (
                    <>
                      <div className="text-muted-foreground">재개예정일</div>
                      <div>
                        <Input
                          type="date"
                          className="h-7 w-[140px] text-xs"
                          value={detailSub.resume_date || ''}
                          onChange={async (e) => {
                            const val = e.target.value || null
                            const result = await updateSubscription(detailSub.id, { resume_date: val })
                            if (result.ok) {
                              setDetailSub((prev) => prev ? { ...prev, resume_date: val } : null)
                              setSubs((prev) => prev.map((s) => s.id === detailSub.id ? { ...s, resume_date: val } : s))
                              showSuccess('재개예정일이 변경되었습니다')
                            } else {
                              showError(result.error || '재개예정일 변경에 실패했습니다')
                            }
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* Memo */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">메모</h3>
                <Textarea
                  value={memoValue}
                  onChange={(e) => setMemoValue(e.target.value)}
                  placeholder="메모를 입력하세요..."
                  rows={4}
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleMemoSave}>
                    메모 저장
                  </Button>
                </div>
              </section>

              {/* History Timeline */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">히스토리</h3>
                {logsLoading ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : (
                  <Timeline
                    variant="compact"
                    items={[
                      // 변경 로그
                      ...logs.map(log => ({
                        date: log.created_at?.slice(0, 16)?.replace('T', ' ') || '',
                        title: log.old_value && log.new_value
                          ? `${log.field_name === 'status' ? '상태' : log.field_name}: ${log.old_value} → ${log.new_value}`
                          : log.new_value
                            ? `${log.field_name}: ${log.new_value}`
                            : log.action || '변경',
                        description: [log.user?.name ? `by ${log.user.name}` : '', log.memo].filter(Boolean).join(' · ') || undefined,
                        status: (log.field_name === 'status'
                          ? log.new_value === 'live' ? 'success'
                            : log.new_value === 'cancel' ? 'error'
                            : log.new_value === 'pause' ? 'warning'
                            : log.new_value === 'archive' ? 'neutral'
                            : 'info'
                          : 'info') as 'success' | 'warning' | 'error' | 'info' | 'neutral',
                      })),
                      // 구독 생성
                      ...(detailSub.created_at ? [{
                        date: detailSub.created_at.slice(0, 16).replace('T', ' '),
                        title: '구독 생성',
                        description: `${detailSub.product.sku_code} · ${detailSub.duration_days}일`,
                        status: 'info' as const,
                      }] : []),
                      // 주문일
                      ...(detailSub.order_item?.order?.ordered_at ? [{
                        date: detailSub.order_item.order.ordered_at.slice(0, 16).replace('T', ' '),
                        title: '주문 접수',
                        description: detailSub.customer.name,
                        status: 'neutral' as const,
                      }] : []),
                    ]}
                  />
                )}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 6. Failure Resolution Dialog */}
      <Dialog open={resolveDialogOpen && !!resolvingSub} onOpenChange={(open) => { if (!open) { setResolveDialogOpen(false); setResolvingSub(null) } }}>
        <DialogContent className="max-w-[380px]">
          {resolvingSub && (
            <>
              <DialogHeader>
                <DialogTitle className="text-sm">
                  {resolvingSub.customer?.kakao_friend_name || resolvingSub.customer?.name} — {resolvingSub.product?.sku_code}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">
                      Day {resolvingSub.last_sent_day + 1}~{resolvingSub.current_day} 미발송
                    </p>
                    <p className="text-xs text-muted-foreground">
                      사유: 발송 실패
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-left h-auto px-3 py-2.5"
                  onClick={() => handleResolveFailure(resolvingSub, 'manual_sent')}
                >
                  <div>
                    <div className="text-sm font-medium">직접 보냈어요</div>
                    <div className="text-xs text-muted-foreground">Day {resolvingSub.current_day + 1}부터 정상 진행</div>
                  </div>
                </Button>

                <Button
                  variant="ghost"
                  className="w-full justify-start text-left h-auto px-3 py-2.5"
                  onClick={() => handleResolveFailure(resolvingSub, 'bulk')}
                >
                  <div>
                    <div className="text-sm font-medium">밀린 것 몰아서 보내기</div>
                    <div className="text-xs text-muted-foreground">{kstDateShort(1)} Day{resolvingSub.last_sent_day + 1}~{resolvingSub.current_day + 1} 한번에 발송</div>
                  </div>
                </Button>

                <Button
                  variant="ghost"
                  className="w-full justify-start text-left h-auto px-3 py-2.5"
                  onClick={() => handleResolveFailure(resolvingSub, 'sequential')}
                >
                  <div>
                    <div className="text-sm font-medium">밀린 것부터 하루씩 보내기</div>
                    <div className="text-xs text-muted-foreground">{kstDateShort(1)} Day{resolvingSub.last_sent_day + 1}, {kstDateShort(2)} Day{resolvingSub.last_sent_day + 2}, ... 종료일 연장</div>
                  </div>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 7. Confirm Dialog */}
      {ConfirmDialogElement}

      {/* 7. Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={clearToast} />
      )}


      {/* 9. AI Chat */}
      <FloatingChatButton tabId="subscriptions" userEmail="admin" />
    </div>
  )
}
