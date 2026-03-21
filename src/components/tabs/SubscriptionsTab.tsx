'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { STATUS_LABELS, STATUS_COLORS, type SubscriptionStatus } from '@/lib/constants'

interface SubRow {
  id: string
  status: SubscriptionStatus
  start_date: string | null
  end_date: string | null
  duration_days: number
  current_day: number
  d_day: number
  friend_confirmed: boolean
  friend_confirmed_at: string | null
  memo: string | null
  device_id: string | null
  customer: { id: string; name: string; phone: string | null; phone_last4: string | null; kakao_friend_name: string | null; email: string | null }
  product: { id: string; sku_code: string; title: string; message_type: string }
  device: { id: string; phone_number: string; name: string | null } | null
}

interface SummaryData {
  live: number; pending: number; pause: number; archive: number; cancel: number; today_sending: number
}

const STATUS_OPTIONS: SubscriptionStatus[] = ['live', 'pending', 'pause', 'archive', 'cancel']

// --- 요약 카드 ---
function SummaryCards({ data }: { data: SummaryData | null }) {
  if (!data) return null
  const cards = [
    { label: '발송중', value: data.live, color: 'text-green-600 bg-green-50' },
    { label: '대기', value: data.pending, color: 'text-yellow-600 bg-yellow-50' },
    { label: '일시정지', value: data.pause, color: 'text-orange-600 bg-orange-50' },
    { label: '오늘 발송', value: data.today_sending, color: 'text-blue-600 bg-blue-50' },
  ]
  return (
    <div className="flex gap-3 mb-4">
      {cards.map(c => (
        <div key={c.label} className={cn('px-4 py-2 rounded', c.color)}>
          <div className="text-xs opacity-70">{c.label}</div>
          <div className="text-lg font-bold">{c.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  )
}

// --- 필터바 ---
function FilterBar({
  filters, setFilters, devices, products
}: {
  filters: any; setFilters: (f: any) => void
  devices: { id: string; phone_number: string; name: string | null }[]
  products: { id: string; sku_code: string; title: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value, page: 1 })}
        className="px-3 py-1.5 border rounded text-sm">
        <option value="">전체 상태</option>
        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
      </select>
      <select value={filters.device_id} onChange={e => setFilters({ ...filters, device_id: e.target.value, page: 1 })}
        className="px-3 py-1.5 border rounded text-sm">
        <option value="">전체 PC</option>
        {devices.map(d => <option key={d.id} value={d.id}>{d.phone_number} {d.name ? `(${d.name})` : ''}</option>)}
      </select>
      <select value={filters.product_id} onChange={e => setFilters({ ...filters, product_id: e.target.value, page: 1 })}
        className="px-3 py-1.5 border rounded text-sm">
        <option value="">전체 상품</option>
        {products.map(p => <option key={p.id} value={p.id}>{p.sku_code} — {p.title}</option>)}
      </select>
      <select value={filters.friend_confirmed} onChange={e => setFilters({ ...filters, friend_confirmed: e.target.value, page: 1 })}
        className="px-3 py-1.5 border rounded text-sm">
        <option value="">친구확인 전체</option>
        <option value="true">확인됨</option>
        <option value="false">미확인</option>
      </select>
      <input type="text" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value, page: 1 })}
        placeholder="고객명 / 카톡이름 / 뒷4자리 검색"
        className="px-3 py-1.5 border rounded text-sm w-60" />
    </div>
  )
}

// --- 인라인 수정 ---
async function updateSubscription(id: string, updates: any): Promise<boolean> {
  try {
    const res = await fetch('/api/subscriptions/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    return res.ok
  } catch { return false }
}

// --- 메인 탭 ---
export function SubscriptionsTab() {
  const [subs, setSubs] = useState<SubRow[]>([])
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [devices, setDevices] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [filters, setFilters] = useState({
    status: '', device_id: '', product_id: '', friend_confirmed: '', search: '', page: 1,
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Fetch reference data
  useEffect(() => {
    fetch('/api/products/list').then(r => r.json()).then(d => setProducts(d || []))
    fetch('/api/admin/devices').then(r => r.json()).then(d => setDevices(d?.data || d || []))
    fetch('/api/subscriptions/summary').then(r => r.json()).then(setSummary)
  }, [])

  // Fetch subscriptions
  const fetchSubs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(filters.page))
    params.set('limit', '50')
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
    } catch { console.error('Failed to fetch subscriptions') }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => { fetchSubs() }, [fetchSubs])

  // Debounced search
  const [searchTimeout, setSearchTimeout] = useState<any>(null)
  const handleSearchChange = (search: string) => {
    if (searchTimeout) clearTimeout(searchTimeout)
    const t = setTimeout(() => setFilters(f => ({ ...f, search, page: 1 })), 300)
    setSearchTimeout(t)
  }

  // Inline update handlers
  const handleStatusChange = async (id: string, status: string) => {
    if (await updateSubscription(id, { status })) {
      fetchSubs()
      fetch('/api/subscriptions/summary').then(r => r.json()).then(setSummary)
    }
  }

  const handleDeviceChange = async (id: string, device_id: string) => {
    if (await updateSubscription(id, { device_id: device_id || null })) fetchSubs()
  }

  const handleFriendToggle = async (id: string, confirmed: boolean) => {
    if (await updateSubscription(id, { friend_confirmed: confirmed })) fetchSubs()
  }

  const handleStartDateChange = async (id: string, start_date: string) => {
    if (!start_date || start_date.length !== 10) return // 완전한 YYYY-MM-DD만 허용
    if (await updateSubscription(id, { status: 'live', start_date })) {
      fetchSubs()
      fetch('/api/subscriptions/summary').then(r => r.json()).then(setSummary)
    }
  }

  // Bulk actions
  const handleBulkStatus = async (status: string) => {
    if (selectedIds.size === 0) return
    const res = await fetch('/api/subscriptions/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds), status }),
    })
    if (res.ok) {
      setSelectedIds(new Set())
      fetchSubs()
      fetch('/api/subscriptions/summary').then(r => r.json()).then(setSummary)
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === subs.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(subs.map(s => s.id)))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">구독 관리</h2>
        {selectedIds.size > 0 && (
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-500">{selectedIds.size}건 선택</span>
            <button onClick={() => handleBulkStatus('live')} className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">발송 시작</button>
            <button onClick={() => handleBulkStatus('pause')} className="px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">일시정지</button>
            <button onClick={() => handleBulkStatus('cancel')} className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">취소</button>
          </div>
        )}
      </div>

      <SummaryCards data={summary} />

      <FilterBar filters={filters} setFilters={setFilters} devices={devices} products={products} />

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">로딩 중...</div>
      ) : subs.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">구독 내역이 없습니다</div>
      ) : (
        <>
          <div className="text-xs text-gray-500 mb-2">총 {total?.toLocaleString()}건</div>
          <div className="bg-white border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2.5 w-8">
                    <input type="checkbox" checked={selectedIds.size === subs.length && subs.length > 0}
                      onChange={toggleSelectAll} className="rounded" />
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">고객명</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">카톡이름</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">상품</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">시작일</th>
                  <th className="text-center px-3 py-2.5 font-medium text-gray-600">Day</th>
                  <th className="text-center px-3 py-2.5 font-medium text-gray-600">D-Day</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">상태</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">PC</th>
                  <th className="text-center px-3 py-2.5 font-medium text-gray-600">친구확인</th>
                </tr>
              </thead>
              <tbody>
                {subs.map(sub => (
                  <tr key={sub.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selectedIds.has(sub.id)}
                        onChange={() => toggleSelect(sub.id)} className="rounded" />
                    </td>
                    <td className="px-3 py-2">{sub.customer?.name}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{sub.customer?.kakao_friend_name || '-'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{sub.product?.sku_code}</td>
                    <td className="px-3 py-2 text-xs">
                      {sub.status === 'pending' && !sub.start_date ? (
                        <input type="date" className="px-2 py-1 border rounded text-xs"
                          onChange={e => handleStartDateChange(sub.id, e.target.value)} />
                      ) : (
                        sub.start_date || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-xs">
                      {sub.start_date ? sub.current_day : '-'}
                    </td>
                    <td className={cn('px-3 py-2 text-center tabular-nums text-xs font-medium',
                      sub.d_day <= 0 ? 'text-red-500' : sub.d_day <= 7 ? 'text-orange-500' : 'text-gray-600'
                    )}>
                      {sub.start_date ? sub.d_day : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <select value={sub.status} onChange={e => handleStatusChange(sub.id, e.target.value)}
                        className={cn('px-2 py-0.5 rounded text-xs border-0 font-medium', {
                          'bg-green-100 text-green-700': sub.status === 'live',
                          'bg-yellow-100 text-yellow-700': sub.status === 'pending',
                          'bg-orange-100 text-orange-700': sub.status === 'pause',
                          'bg-gray-100 text-gray-500': sub.status === 'archive',
                          'bg-red-100 text-red-700': sub.status === 'cancel',
                        })}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select value={sub.device_id || ''} onChange={e => handleDeviceChange(sub.id, e.target.value)}
                        className="px-2 py-0.5 rounded text-xs border bg-white">
                        <option value="">미배정</option>
                        {devices.map((d: any) => <option key={d.id} value={d.id}>{d.phone_number?.slice(-4)}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={sub.friend_confirmed}
                        onChange={e => handleFriendToggle(sub.id, e.target.checked)} className="rounded" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 50 && (
            <div className="flex justify-center gap-2 mt-4">
              <button onClick={() => setFilters(f => ({ ...f, page: Math.max(1, f.page - 1) }))}
                disabled={filters.page === 1} className="px-3 py-1 text-sm border rounded disabled:opacity-30">이전</button>
              <span className="px-3 py-1 text-sm text-gray-500">{filters.page} / {Math.ceil(total / 50)}</span>
              <button onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                disabled={filters.page >= Math.ceil(total / 50)} className="px-3 py-1 text-sm border rounded disabled:opacity-30">다음</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
