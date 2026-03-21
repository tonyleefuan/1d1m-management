'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

interface UploadResult {
  total: number
  new_count: number
  duplicate_count: number
  unknown_skus: string[]
  items: any[]
  duplicates: string[]
}

function FileUploadArea({ onUploaded }: { onUploaded: (result: UploadResult) => void }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError('엑셀 파일(.xlsx, .xls) 또는 CSV 파일만 업로드할 수 있습니다')
      return
    }
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/orders/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setError(data.error || '업로드 실패'); return }
      onUploaded(data)
    } catch { setError('서버 연결 실패') } finally { setUploading(false) }
  }

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
        dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400',
        uploading && 'opacity-50 pointer-events-none'
      )}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      <p className="text-sm text-gray-500">{uploading ? '업로드 중...' : '아임웹 주문 엑셀 파일을 드래그하거나 클릭하여 선택'}</p>
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
    </div>
  )
}

function UploadPreview({ result, onConfirm, onCancel }: { result: UploadResult; onConfirm: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/orders/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: result.items }),
      })
      if (!res.ok) { const d = await res.json(); alert(d.error || '저장 실패'); return }
      const d = await res.json()
      alert(`저장 완료! 주문 ${d.saved_orders}건, 품목 ${d.saved_items}건, 구독 ${d.saved_subscriptions}건 생성`)
      onConfirm()
    } catch { alert('서버 연결 실패') } finally { setSaving(false) }
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex gap-4 mb-4">
        <div className="px-4 py-2 bg-blue-50 rounded"><div className="text-xs text-gray-500">총 건수</div><div className="text-lg font-bold">{result.total}</div></div>
        <div className="px-4 py-2 bg-green-50 rounded"><div className="text-xs text-gray-500">신규</div><div className="text-lg font-bold text-green-600">{result.new_count}</div></div>
        <div className="px-4 py-2 bg-yellow-50 rounded"><div className="text-xs text-gray-500">중복</div><div className="text-lg font-bold text-yellow-600">{result.duplicate_count}</div></div>
        {result.unknown_skus.length > 0 && (
          <div className="px-4 py-2 bg-red-50 rounded"><div className="text-xs text-gray-500">미등록 SKU</div><div className="text-sm font-bold text-red-600">{result.unknown_skus.join(', ')}</div></div>
        )}
      </div>
      {result.items.length > 0 && (
        <div className="max-h-[400px] overflow-auto border rounded mb-4">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium">주문번호</th>
                <th className="text-left px-3 py-2 font-medium">고객명</th>
                <th className="text-left px-3 py-2 font-medium">전화번호</th>
                <th className="text-left px-3 py-2 font-medium">상품</th>
                <th className="text-left px-3 py-2 font-medium">기간</th>
                <th className="text-right px-3 py-2 font-medium">배분금액</th>
                <th className="text-center px-3 py-2 font-medium">1+1</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item: any, i: number) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-mono">{item.imweb_order_no}</td>
                  <td className="px-3 py-1.5">{item.customer_name}</td>
                  <td className="px-3 py-1.5 text-gray-500">{item.customer_phone}</td>
                  <td className="px-3 py-1.5">{item.product_sku}</td>
                  <td className="px-3 py-1.5">{item.duration_days}일</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{item.allocated_amount?.toLocaleString()}원</td>
                  <td className="px-3 py-1.5 text-center">
                    {item.is_addon && <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px]">1+1</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">취소</button>
        <button onClick={handleConfirm} disabled={saving || result.new_count === 0}
          className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50">
          {saving ? '저장 중...' : `${result.new_count}건 저장 + 구독 생성`}
        </button>
      </div>
    </div>
  )
}

function OrderList() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/list?page=${page}&limit=50`)
      const data = await res.json()
      setOrders(data.data || [])
      setTotal(data.total || 0)
    } catch { console.error('Failed to fetch orders') } finally { setLoading(false) }
  }, [page])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  if (loading) return <div className="text-sm text-gray-400 py-4 text-center">로딩 중...</div>
  if (orders.length === 0) return <div className="text-sm text-gray-400 py-4 text-center">주문 내역이 없습니다</div>

  return (
    <div>
      <div className="text-xs text-gray-500 mb-2">총 {total?.toLocaleString()}건</div>
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">주문일</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">고객명</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">상품</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">기간</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-600">금액</th>
              <th className="text-center px-4 py-2.5 font-medium text-gray-600">1+1</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((item: any) => (
              <tr key={item.id} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-500 text-xs">{item.order?.ordered_at?.slice(0, 10)}</td>
                <td className="px-4 py-2.5">{item.order?.customer?.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{item.product?.sku_code}</td>
                <td className="px-4 py-2.5 text-gray-600">{item.duration_days}일</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{item.allocated_amount?.toLocaleString()}원</td>
                <td className="px-4 py-2.5 text-center">
                  {item.is_addon && <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px]">1+1</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 50 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded disabled:opacity-30">이전</button>
          <span className="px-3 py-1 text-sm text-gray-500">{page} / {Math.ceil(total / 50)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)} className="px-3 py-1 text-sm border rounded disabled:opacity-30">다음</button>
        </div>
      )}
    </div>
  )
}

export function OrdersTab() {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">주문 관리</h2>
      {!uploadResult ? (
        <FileUploadArea onUploaded={setUploadResult} />
      ) : (
        <UploadPreview result={uploadResult}
          onConfirm={() => { setUploadResult(null); setRefreshKey(k => k + 1) }}
          onCancel={() => setUploadResult(null)} />
      )}
      <OrderList key={refreshKey} />
    </div>
  )
}
