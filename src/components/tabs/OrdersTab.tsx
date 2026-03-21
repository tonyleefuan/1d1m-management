'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Upload, Package, ShoppingCart } from 'lucide-react'
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

interface UploadResult {
  total: number
  new_count: number
  duplicate_count: number
  unknown_skus: string[]
  items: any[]
  duplicates: string[]
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
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            {uploading ? '업로드 중...' : '아임웹 주문 엑셀 파일을 드래그하거나 클릭하여 선택'}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">.xlsx, .xls, .csv</p>
        </div>
      </CardContent>
    </Card>
  )
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
                    <TableHead className="text-xs">전화번호</TableHead>
                    <TableHead className="text-xs">상품</TableHead>
                    <TableHead className="text-xs">기간</TableHead>
                    <TableHead className="text-xs text-right">배분금액</TableHead>
                    <TableHead className="text-xs text-center">1+1</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((item: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs py-2">{item.imweb_order_no}</TableCell>
                      <TableCell className="text-xs py-2">{item.customer_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2">{item.customer_phone}</TableCell>
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
          {saving ? '저장 중...' : `${result.new_count}건 저장 + 구독 생성`}
        </Button>
      </div>
    </div>
  )
}

/* ── OrderList ─────────────────────────────────────── */
function OrderList() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 50
  const { toast, showError, clearToast } = useToast()

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/list?page=${page}&limit=${limit}`)
      const data = await res.json()
      setOrders(data.data || [])
      setTotal(data.total || 0)
    } catch {
      showError('주문 목록을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [page, showError])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const totalPages = Math.ceil(total / limit)

  if (loading) return <SkeletonTable cols={6} rows={8} />

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="주문 내역이 없습니다"
        description="아임웹 주문 엑셀을 업로드하여 주문을 등록하세요"
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">총 {total?.toLocaleString()}건</p>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>주문일</TableHead>
                <TableHead>고객명</TableHead>
                <TableHead>상품</TableHead>
                <TableHead>기간</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead className="text-center">1+1</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground text-xs">
                    {item.order?.ordered_at?.slice(0, 10)}
                  </TableCell>
                  <TableCell>{item.order?.customer?.name}</TableCell>
                  <TableCell className="font-mono text-xs">{item.product?.sku_code}</TableCell>
                  <TableCell className="text-muted-foreground">{item.duration_days}일</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.allocated_amount?.toLocaleString()}원
                  </TableCell>
                  <TableCell className="text-center">
                    {item.is_addon && (
                      <StatusBadge status="info" size="xs">1+1</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
          <span className="text-sm text-muted-foreground">
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
