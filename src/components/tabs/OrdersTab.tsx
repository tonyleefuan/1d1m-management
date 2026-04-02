'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Upload, Package, ShoppingCart, Trash2, Users } from 'lucide-react'
import { FilterBar } from '@/components/ui/filter-bar'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonTable } from '@/components/ui/skeleton'
import { Toast } from '@/components/ui/Toast'
import { useToast } from '@/lib/use-toast'
import { MetricCard } from '@/components/ui/metric-card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import type { Order, OrderItem, Product, Customer } from '@/lib/types'

interface UploadPreviewItem {
  imweb_order_no: string
  customer_name: string
  customer_phone: string
  product_sku: string
  duration_days: number
  allocated_amount: number
  is_addon: boolean
}

interface UploadResult {
  total: number
  new_count: number
  duplicate_count: number
  unknown_skus: string[]
  items: UploadPreviewItem[]
  duplicates: string[]
}

/** OrderItem with joined order (including customer) and product from the list API */
interface OrderItemWithRelations extends OrderItem {
  order?: Order & { customer?: Customer }
  product?: Product
}

/* ── FileUploadArea ────────────────────────────────── */
function FileUploadArea({
  onUploaded,
  onError,
}: {
  onUploaded: (result: UploadResult) => void
  onError: (msg: string) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      onError('엑셀 파일(.xlsx, .xls) 또는 CSV 파일만 업로드할 수 있습니다')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/orders/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        onError(data.error || '업로드 실패')
        return
      }
      onUploaded(data)
    } catch {
      onError('서버 연결 실패')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer',
            dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/40',
            uploading && 'opacity-50 pointer-events-none',
          )}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files[0]
            if (f) handleFile(f)
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
          role="button"
          tabIndex={0}
          aria-label="파일 업로드 영역"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            aria-label="주문 엑셀 파일 선택"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          {uploading ? (
            <Spinner size="lg" className="mx-auto mb-3" />
          ) : (
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          )}
          <p className="text-sm text-muted-foreground">
            {uploading ? '업로드 중...' : '아임웹 주문 엑셀 파일을 드래그하거나 클릭하여 선택'}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">.xlsx, .xls, .csv</p>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── syncContactsToDrive (비동기 — 주문 저장 후 백그라운드) ── */
async function syncContactsToDrive(
  items: UploadPreviewItem[],
  showSuccess: (msg: string) => void,
  showError: (msg: string) => void,
) {
  try {
    const contacts = items.map(item => ({
      name: item.customer_name,
      phone: item.customer_phone,
    }))

    const res = await fetch('/api/orders/sync-contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts }),
    })

    if (!res.ok) {
      const d = await res.json()
      showError(`연락처 동기화 실패: ${d.error}`)
      return
    }

    const d = await res.json()
    showSuccess(`연락처 ${d.contact_count}건 Google Drive 업로드 완료 (${d.file_name})`)
  } catch {
    showError('연락처 동기화 중 오류가 발생했습니다')
  }
}

/* ── UploadPreview ─────────────────────────────────── */
function UploadPreview({
  result,
  onConfirm,
  onCancel,
  showSuccess,
  showError,
}: {
  result: UploadResult
  onConfirm: () => void
  onCancel: () => void
  showSuccess: (msg: string) => void
  showError: (msg: string) => void
}) {
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/orders/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: result.items }),
      })
      if (!res.ok) {
        const d = await res.json()
        showError(d.error || '저장 실패')
        return
      }
      const d = await res.json()
      showSuccess(`저장 완료! 주문 ${d.saved_orders}건, 품목 ${d.saved_items}건, 구독 ${d.saved_subscriptions}건 생성`)

      // 연락처 동기화: Google Drive에 CSV 업로드 → Apps Script가 연락처 등록
      syncContactsToDrive(result.items, showSuccess, showError)

      onConfirm()
    } catch {
      showError('서버 연결 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard title="총 건수" value={String(result.total)} icon={Package} />
        <MetricCard
          title="신규"
          value={String(result.new_count)}
        />
        <MetricCard
          title="중복"
          value={String(result.duplicate_count)}
        />
        <MetricCard
          title="미등록 SKU"
          value={result.unknown_skus.length > 0 ? result.unknown_skus.join(', ') : '없음'}
        />
      </div>

      {/* Preview table */}
      {result.items.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">주문번호</TableHead>
                    <TableHead className="text-xs">고객명</TableHead>
                    <TableHead className="text-xs">상품</TableHead>
                    <TableHead className="text-xs">기간</TableHead>
                    <TableHead className="text-xs text-right">배분금액</TableHead>
                    <TableHead className="text-xs text-center">1+1</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs py-2">{item.imweb_order_no}</TableCell>
                      <TableCell className="text-xs py-2">{item.customer_name}</TableCell>
                      <TableCell className="text-xs py-2">{item.product_sku}</TableCell>
                      <TableCell className="text-xs py-2">{item.duration_days}일</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-2">
                        {item.allocated_amount?.toLocaleString()}원
                      </TableCell>
                      <TableCell className="text-center py-2">
                        {item.is_addon && (
                          <StatusBadge status="info" size="xs">1+1</StatusBadge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>취소</Button>
        <Button
          onClick={handleConfirm}
          disabled={saving || result.new_count === 0}
        >
          {saving ? <><Spinner size="sm" className="mr-1.5" /> 저장 중...</> : `${result.new_count}건 저장 + 구독 생성`}
        </Button>
      </div>
    </div>
  )
}

/* ── OrderList ─────────────────────────────────────── */
function OrderList() {
  const [orders, setOrders] = useState<OrderItemWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()
  const limit = 50
  const { toast, showSuccess, showError, clearToast } = useToast()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const lastClickedIdx = useRef<number | null>(null)
  const { confirm, ConfirmDialogElement } = useConfirmDialog()

  const toggleSelect = (id: string, event?: React.MouseEvent) => {
    const currentIdx = orders.findIndex((o) => o.id === id)

    if (event?.shiftKey && lastClickedIdx.current !== null && currentIdx !== -1) {
      const start = Math.min(lastClickedIdx.current, currentIdx)
      const end = Math.max(lastClickedIdx.current, currentIdx)
      setSelectedIds(prev => {
        const next = new Set(prev)
        orders.slice(start, end + 1).forEach((o) => next.add(o.id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }
    lastClickedIdx.current = currentIdx
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)))
    }
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: '주문 삭제',
      description: `선택한 ${selectedIds.size}건의 주문을 삭제하시겠습니까? 관련 구독도 함께 삭제됩니다.`,
      variant: 'destructive',
    })
    if (!ok) return
    setDeleting(true)
    try {
      const res = await fetch('/api/orders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      showSuccess(`${data.deleted}건 삭제 완료`)
      setSelectedIds(new Set())
      fetchOrders()
    } catch {
      showError('삭제에 실패했습니다')
    } finally {
      setDeleting(false)
    }
  }

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setSelectedIds(new Set())
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('search', search)
      const res = await fetch(`/api/orders/list?${params}`)
      const data = await res.json()
      setOrders(data.data || [])
      setTotal(data.total || 0)
    } catch {
      showError('주문 목록을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [page, search, showError])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  useEffect(() => {
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearch(value)
      setPage(1)
    }, 300)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-3">
      {/* Filter Bar */}
      <FilterBar
        search={{
          value: searchInput,
          onChange: handleSearchChange,
          placeholder: '고객명 / 주문번호 검색',
        }}
        actions={
          selectedIds.size > 0 ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{selectedIds.size}건 선택</Badge>
              <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
                <Trash2 className="h-3 w-3 mr-1" />
                삭제
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">총 {total?.toLocaleString()}건</span>
          )
        }
      />

      {loading ? (
        <SkeletonTable cols={8} rows={8} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="주문 내역이 없습니다"
          description="아임웹 주문 엑셀을 업로드하여 주문을 등록하세요"
        />
      ) : (
        <>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={orders.length > 0 && selectedIds.size === orders.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-[100px]">주문일</TableHead>
                  <TableHead>고객명</TableHead>
                  <TableHead>상품</TableHead>
                  <TableHead>상품명</TableHead>
                  <TableHead className="w-[70px] text-center">기간</TableHead>
                  <TableHead className="w-[100px] text-right">금액</TableHead>
                  <TableHead className="w-[50px] text-center">1+1</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell
                      className="py-1.5 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleSelect(item.id, e as unknown as React.MouseEvent)
                      }}
                    >
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => {}}
                        className="pointer-events-none"
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs tabular-nums py-1.5 whitespace-nowrap">
                      {item.order?.ordered_at?.slice(0, 10)}
                    </TableCell>
                    <TableCell className="font-medium text-sm py-1.5">{item.order?.customer?.name}</TableCell>
                    <TableCell className="font-mono text-xs py-1.5">{item.product?.sku_code}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[200px] py-1.5">
                      {item.product?.title || '-'}
                    </TableCell>
                    <TableCell className="text-center text-xs tabular-nums py-1.5 whitespace-nowrap">{item.duration_days}일</TableCell>
                    <TableCell className="text-right tabular-nums text-xs py-1.5 whitespace-nowrap">
                      {item.allocated_amount?.toLocaleString()}원
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      {item.is_addon && (
                        <StatusBadge status="info" size="xs">1+1</StatusBadge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= totalPages}
              >
                다음
              </Button>
            </div>
          )}
        </>
      )}
      {ConfirmDialogElement}
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}

/* ── OrdersTab (main export) ───────────────────────── */
export function OrdersTab() {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const { toast, showSuccess, showError, clearToast } = useToast()

  return (
    <div className="space-y-6">
      <PageHeader
        title="주문 관리"
        description="아임웹 주문 엑셀을 업로드하여 구독을 생성합니다"
      />

      {!uploadResult ? (
        <FileUploadArea
          onUploaded={setUploadResult}
          onError={showError}
        />
      ) : (
        <UploadPreview
          result={uploadResult}
          onConfirm={() => {
            setUploadResult(null)
            setRefreshKey(k => k + 1)
          }}
          onCancel={() => setUploadResult(null)}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

      <OrderList key={refreshKey} />

      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}
