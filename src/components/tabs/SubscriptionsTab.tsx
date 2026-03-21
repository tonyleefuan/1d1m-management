'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { StatGroup } from '@/components/ui/stat-group'
import { FilterBar } from '@/components/ui/filter-bar'
import { Button } from '@/components/ui/button'
import { StatusBadge, type StatusType } from '@/components/ui/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonTable } from '@/components/ui/skeleton'
import { Toast } from '@/components/ui/Toast'
import { useToast } from '@/lib/use-toast'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { SUBSCRIPTION_STATUSES, STATUS_LABELS, type SubscriptionStatus } from '@/lib/constants'
import { Users, Send, Pause, Clock, FileText, MessageSquare } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────

interface SubRow {
  id: string
  status: SubscriptionStatus
  start_date: string | null
  end_date: string | null
  duration_days: number
  day: number
  d_day: number
  friend_confirmed: boolean
  friend_confirmed_at: string | null
  memo: string | null
  device_id: string | null
  customer: {
    id: string
    name: string
    phone: string | null
    phone_last4: string | null
    kakao_friend_name: string | null
    email: string | null
  }
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
}

interface SummaryData {
  live: number
  pending: number
  pause: number
  archive: number
  cancel: number
  today_sending: number
}

interface DeviceOption {
  id: string
  phone_number: string
  name: string | null
}

interface ProductOption {
  id: string
  sku_code: string
  title: string
}

// ─── Constants ───────────────────────────────────────────

const STATUS_MAP: Record<string, { status: StatusType; label: string }> = {
  live: { status: 'success', label: '발송중' },
  pending: { status: 'warning', label: '대기' },
  pause: { status: 'info', label: '일시정지' },
  archive: { status: 'neutral', label: '종료' },
  cancel: { status: 'error', label: '취소' },
}

const PAGE_SIZE = 50

// ─── API helper ──────────────────────────────────────────

async function updateSubscription(id: string, updates: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/subscriptions/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    return res.ok
  } catch {
    return false
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

export function SubscriptionsTab() {
  // Data state
  const [subs, setSubs] = useState<SubRow[]>([])
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true) // 초기 로딩 (Skeleton 표시)
  const [refreshing, setRefreshing] = useState(false) // 리프레시 (Skeleton 미표시)
  const [total, setTotal] = useState(0)
  const isFirstLoad = useRef(true)
  const [devices, setDevices] = useState<DeviceOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])

  // Filter state
  const [filters, setFilters] = useState({
    status: '',
    device_id: '',
    product_id: '',
    friend_confirmed: '',
    search: '',
    page: 1,
  })

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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

  // ─── Data fetching ───────────────────────────────────

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions/summary')
      if (!res.ok) return
      const data = await res.json()
      setSummary(data)
    } catch {
      // silent
    }
  }, [])

  // 자연 정렬 (PC 1, PC 2, ... PC 10)
  const naturalSort = (a: DeviceOption, b: DeviceOption) => {
    const nameA = a.name || ''
    const nameB = b.name || ''
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' })
  }

  useEffect(() => {
    fetch('/api/products/list')
      .then((r) => r.json())
      .then((d) => setProducts(d || []))
      .catch(() => {})
    fetch('/api/admin/devices')
      .then((r) => r.json())
      .then((d) => {
        const list = d?.data || d || []
        setDevices(list.sort(naturalSort))
      })
      .catch(() => {})
    fetchSummary()
  }, [fetchSummary])

  const fetchSubs = useCallback(async () => {
    // 첫 로딩만 Skeleton, 이후는 조용히 리프레시
    if (isFirstLoad.current) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    const params = new URLSearchParams()
    params.set('page', String(filters.page))
    params.set('limit', String(PAGE_SIZE))
    if (filters.status) params.set('status', filters.status)
    if (filters.device_id) params.set('device_id', filters.device_id)
    if (filters.product_id) params.set('product_id', filters.product_id)
    if (filters.friend_confirmed) params.set('friend_confirmed', filters.friend_confirmed)
    if (filters.search) params.set('search', filters.search)

    try {
      const res = await fetch(`/api/subscriptions/list?${params}`)
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
      const ok = await updateSubscription(id, apiUpdates)
      if (ok) {
        showSuccess(successMsg)
      } else {
        // 3. 실패 시 스냅샷으로 롤백 (리페치 없음)
        if (snapshot) {
          setSubs((prev) => prev.map((s) => (s.id === id ? snapshot! : s)))
        }
        showError('변경에 실패했습니다. 다시 시도해주세요.')
      }
      return ok
    },
    [showSuccess, showError],
  )

  // ─── Inline update handlers ──────────────────────────

  const handleStatusChange = async (id: string, status: string) => {
    const ok = await optimisticUpdate(
      id,
      { status: status as SubscriptionStatus },
      { status },
      `상태가 ${STATUS_MAP[status]?.label ?? status}(으)로 변경되었습니다`,
    )
    if (ok) fetchSummary() // summary만 갱신 (목록은 이미 반영됨)
  }

  const handleDeviceChange = async (id: string, deviceId: string) => {
    const device = deviceId ? devices.find((d) => d.id === deviceId) || null : null
    await optimisticUpdate(
      id,
      { device_id: deviceId || null, device: device as SubRow['device'] },
      { device_id: deviceId || null },
      'PC가 변경되었습니다',
    )
  }

  const handleFriendToggle = async (id: string, confirmed: boolean) => {
    await optimisticUpdate(
      id,
      { friend_confirmed: confirmed },
      { friend_confirmed: confirmed },
      confirmed ? '친구 확인 완료' : '친구 확인 해제',
    )
  }

  const handleStartDateChange = async (id: string, startDate: string) => {
    if (!startDate || startDate.length !== 10) return
    const endDate = new Date(startDate)
    const sub = subs.find((s) => s.id === id)
    if (sub) endDate.setDate(endDate.getDate() + sub.duration_days - 1)
    const ok = await optimisticUpdate(
      id,
      {
        status: 'live' as SubscriptionStatus,
        start_date: startDate,
        end_date: endDate.toISOString().slice(0, 10),
      },
      { status: 'live', start_date: startDate },
      '시작일이 설정되고 발송이 시작되었습니다',
    )
    if (ok) fetchSummary()
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

  // ─── Bulk actions ────────────────────────────────────

  const handleBulkStatus = async (status: string) => {
    if (selectedIds.size === 0) return
    if (await bulkUpdateSubscriptions(Array.from(selectedIds), { status })) {
      showSuccess(`${selectedIds.size}건의 상태가 ${STATUS_MAP[status]?.label ?? status}(으)로 변경되었습니다`)
      setSelectedIds(new Set())
      fetchSubs()
      fetchSummary()
    } else {
      showError('일괄 상태 변경에 실패했습니다')
    }
  }

  // ─── Selection ───────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === subs.length && subs.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(subs.map((s) => s.id)))
    }
  }

  // ─── Detail sheet ────────────────────────────────────

  const openDetail = (sub: SubRow) => {
    setDetailSub(sub)
    setMemoValue(sub.memo || '')
    setSheetOpen(true)
  }

  // ─── Pagination ──────────────────────────────────────

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ─── Quick filter tabs ───────────────────────────────

  const quickFilters = [
    { label: '전체', count: summary ? summary.live + summary.pending + summary.pause + summary.archive + summary.cancel : undefined, active: filters.status === '', onClick: () => setFilters((f) => ({ ...f, status: '', page: 1 })) },
    { label: '발송중', count: summary?.live, active: filters.status === 'live', onClick: () => setFilters((f) => ({ ...f, status: 'live', page: 1 })) },
    { label: '대기', count: summary?.pending, active: filters.status === 'pending', onClick: () => setFilters((f) => ({ ...f, status: 'pending', page: 1 })) },
    { label: '일시정지', count: summary?.pause, active: filters.status === 'pause', onClick: () => setFilters((f) => ({ ...f, status: 'pause', page: 1 })) },
    { label: '종료', count: summary?.archive, active: filters.status === 'archive', onClick: () => setFilters((f) => ({ ...f, status: 'archive', page: 1 })) },
    { label: '취소', count: summary?.cancel, active: filters.status === 'cancel', onClick: () => setFilters((f) => ({ ...f, status: 'cancel', page: 1 })) },
  ]

  // ─── Stat cards ──────────────────────────────────────

  const stats = [
    { title: '발송 중', value: String(summary?.live ?? 0), icon: Send },
    { title: '대기', value: String(summary?.pending ?? 0), icon: Clock },
    { title: '일시정지', value: String(summary?.pause ?? 0), icon: Pause },
    { title: '오늘 발송', value: String(summary?.today_sending ?? 0), icon: MessageSquare },
  ]

  // ─── Render ──────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <PageHeader title="구독 관리" description="고객별 구독 현황을 관리합니다">
        {selectedIds.size > 0 && (
          <>
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
            <Button size="sm" variant="destructive" onClick={() => handleBulkStatus('cancel')}>
              취소
            </Button>
          </>
        )}
      </PageHeader>

      {/* 2. Stat Group */}
      <StatGroup stats={stats} cols={4} variant="compact" />

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
                    {d.phone_number?.slice(-4)} {d.name ? `(${d.name})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.product_id}
              onValueChange={(v) => setFilters((f) => ({ ...f, product_id: v === '__all__' ? '' : v, page: 1 }))}
            >
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="전체 상품" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체 상품</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.sku_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.friend_confirmed}
              onValueChange={(v) => setFilters((f) => ({ ...f, friend_confirmed: v === '__all__' ? '' : v, page: 1 }))}
            >
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder="친구확인" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">친구확인 전체</SelectItem>
                <SelectItem value="true">확인됨</SelectItem>
                <SelectItem value="false">미확인</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        layout="stacked"
      />

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
                  <TableHead className="min-w-[80px]">고객명</TableHead>
                  <TableHead className="w-[70px]">뒷4자리</TableHead>
                  <TableHead className="min-w-[80px]">카톡이름</TableHead>
                  <TableHead className="w-[90px]">상품</TableHead>
                  <TableHead className="min-w-[120px]">상품명</TableHead>
                  <TableHead className="w-[60px] text-center">기간</TableHead>
                  <TableHead className="w-[110px]">시작일</TableHead>
                  <TableHead className="w-[90px]">종료일</TableHead>
                  <TableHead className="w-[50px] text-center">Day</TableHead>
                  <TableHead className="w-[60px] text-center">D-Day</TableHead>
                  <TableHead className="w-[120px]">상태</TableHead>
                  <TableHead className="w-[110px]">PC</TableHead>
                  <TableHead className="w-[60px] text-center">친구확인</TableHead>
                  <TableHead className="min-w-[100px]">메모</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((sub) => {
                  const sm = STATUS_MAP[sub.status]
                  return (
                    <TableRow key={sub.id} className="group">
                      {/* 1. Checkbox */}
                      <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(sub.id)}
                          onCheckedChange={() => toggleSelect(sub.id)}
                        />
                      </TableCell>

                      {/* 2. 고객명 */}
                      <TableCell
                        className="py-1 text-xs font-medium cursor-pointer"
                        onClick={() => openDetail(sub)}
                      >
                        {sub.customer?.name}
                      </TableCell>

                      {/* 3. 뒷4자리 */}
                      <TableCell className="py-1 text-xs text-muted-foreground tabular-nums">
                        {sub.customer?.phone_last4 ? `••••${sub.customer.phone_last4}` : '-'}
                      </TableCell>

                      {/* 4. 카톡이름 (inline editable) */}
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

                      {/* 5. 상품 */}
                      <TableCell className="py-1 font-mono text-xs">
                        {sub.product?.sku_code}
                      </TableCell>

                      {/* 5.5 상품명 */}
                      <TableCell className="py-1 text-xs text-muted-foreground truncate max-w-[160px]">
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

                      {/* 9. Day */}
                      <TableCell className="py-1 text-center text-xs tabular-nums">
                        {sub.start_date ? sub.day : '-'}
                      </TableCell>

                      {/* 10. D-Day */}
                      <TableCell
                        className={cn(
                          'py-1 text-center text-xs tabular-nums font-medium',
                          sub.start_date && sub.d_day <= 0
                            ? 'text-destructive'
                            : sub.start_date && sub.d_day <= 7
                              ? 'text-amber-600'
                              : '',
                        )}
                      >
                        {sub.start_date ? sub.d_day : '-'}
                      </TableCell>

                      {/* 11. 상태 */}
                      <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={sub.status}
                          onValueChange={(v) => handleStatusChange(sub.id, v)}
                        >
                          <SelectTrigger className="h-6 w-[100px] border-0 bg-transparent px-0 text-xs focus:ring-0">
                            <StatusBadge status={sm?.status ?? 'neutral'} size="xs">
                              {sm?.label ?? sub.status}
                            </StatusBadge>
                          </SelectTrigger>
                          <SelectContent>
                            {SUBSCRIPTION_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                <StatusBadge status={STATUS_MAP[s].status} size="xs">
                                  {STATUS_MAP[s].label}
                                </StatusBadge>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* 12. PC */}
                      <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={sub.device_id || '__none__'}
                          onValueChange={(v) => handleDeviceChange(sub.id, v === '__none__' ? '' : v)}
                        >
                          <SelectTrigger className="h-6 w-[140px] text-xs">
                            <SelectValue placeholder="미배정" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">미배정</SelectItem>
                            {devices.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.phone_number}{d.name ? ` (${d.name})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* 13. 친구확인 */}
                      <TableCell className="py-1 text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={sub.friend_confirmed}
                          onCheckedChange={(checked) =>
                            handleFriendToggle(sub.id, checked === true)
                          }
                        />
                      </TableCell>

                      {/* 14. 메모 */}
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
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
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
                  <div className="text-muted-foreground">연락처</div>
                  <div>
                    {detailSub.customer.phone
                      ? `${detailSub.customer.phone.slice(0, 3)}-••••-${detailSub.customer.phone_last4 ?? '••••'}`
                      : '-'}
                  </div>
                  <div className="text-muted-foreground">카톡이름</div>
                  <div>{detailSub.customer.kakao_friend_name || '-'}</div>
                  <div className="text-muted-foreground">이메일</div>
                  <div>{detailSub.customer.email || '-'}</div>
                </div>
              </section>

              {/* Subscription details */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">구독 정보</h3>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <div className="text-muted-foreground">상태</div>
                  <div>
                    <StatusBadge status={STATUS_MAP[detailSub.status]?.status ?? 'neutral'} size="sm">
                      {STATUS_MAP[detailSub.status]?.label ?? detailSub.status}
                    </StatusBadge>
                  </div>
                  <div className="text-muted-foreground">상품</div>
                  <div className="font-mono text-xs">{detailSub.product.sku_code}</div>
                  <div className="text-muted-foreground">기간</div>
                  <div>{detailSub.duration_days}일</div>
                  <div className="text-muted-foreground">시작일</div>
                  <div className="tabular-nums">{detailSub.start_date || '-'}</div>
                  <div className="text-muted-foreground">종료일</div>
                  <div className="tabular-nums">{detailSub.end_date || '-'}</div>
                  <div className="text-muted-foreground">Day / D-Day</div>
                  <div className="tabular-nums">
                    {detailSub.start_date
                      ? `${detailSub.day}일째 / D-${detailSub.d_day}`
                      : '-'}
                  </div>
                  <div className="text-muted-foreground">PC</div>
                  <div>
                    {detailSub.device
                      ? `${detailSub.device.phone_number?.slice(-4)} ${detailSub.device.name ? `(${detailSub.device.name})` : ''}`
                      : '미배정'}
                  </div>
                  <div className="text-muted-foreground">친구확인</div>
                  <div>
                    {detailSub.friend_confirmed ? (
                      <StatusBadge status="success" size="xs">확인됨</StatusBadge>
                    ) : (
                      <StatusBadge status="neutral" size="xs">미확인</StatusBadge>
                    )}
                  </div>
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
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 6. Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={clearToast} />
      )}
    </div>
  )
}
