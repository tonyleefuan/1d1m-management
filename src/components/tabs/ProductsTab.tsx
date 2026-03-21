'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { Product, ProductPrice } from '@/lib/types'

interface ProductWithMeta extends Product {
  product_prices: ProductPrice[]
  active_subscriptions: number
}

// --- 상품 편집 모달 ---
function ProductFormModal({
  product,
  onClose,
  onSaved,
}: {
  product: ProductWithMeta | null // null = 신규
  onClose: () => void
  onSaved: () => void
}) {
  const [skuCode, setSkuCode] = useState(product?.sku_code || '')
  const [title, setTitle] = useState(product?.title || '')
  const [messageType, setMessageType] = useState<'fixed' | 'realtime'>(product?.message_type || 'fixed')
  const [totalDays, setTotalDays] = useState(product?.total_days?.toString() || '')
  const [description, setDescription] = useState(product?.description || '')
  const [isActive, setIsActive] = useState(product?.is_active ?? true)
  const [prices, setPrices] = useState<{ duration_days: number; channel: string; price: number }[]>(
    product?.product_prices?.map(p => ({
      duration_days: p.duration_days,
      channel: p.channel,
      price: p.price,
    })) || []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addPrice = () => {
    setPrices([...prices, { duration_days: 365, channel: 'kakaotalk', price: 0 }])
  }

  const removePrice = (idx: number) => {
    setPrices(prices.filter((_, i) => i !== idx))
  }

  const updatePrice = (idx: number, field: string, value: any) => {
    const updated = [...prices]
    ;(updated[idx] as any)[field] = value
    setPrices(updated)
  }

  const handleSave = async () => {
    if (!skuCode || !title) {
      setError('SKU와 상품명은 필수입니다')
      return
    }
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/products/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: product?.id || undefined,
          sku_code: skuCode,
          title,
          message_type: messageType,
          total_days: totalDays ? parseInt(totalDays) : null,
          description: description || null,
          is_active: isActive,
          prices,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '저장에 실패했습니다')
        return
      }

      onSaved()
      onClose()
    } catch {
      setError('서버 연결에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-bold mb-4">{product ? '상품 수정' : '상품 추가'}</h3>

          <div className="space-y-4">
            {/* SKU */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU 코드 *</label>
                <input
                  type="text"
                  value={skuCode}
                  onChange={e => setSkuCode(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  placeholder="SUB-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메시지 타입</label>
                <select
                  value={messageType}
                  onChange={e => setMessageType(e.target.value as 'fixed' | 'realtime')}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  <option value="fixed">고정 메시지</option>
                  <option value="realtime">실시간 메시지</option>
                </select>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">상품명 *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="180일간 압축해서 배우는 한국 근현대사"
              />
            </div>

            {/* Total Days (고정 메시지만) */}
            {messageType === 'fixed' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메시지 총 일수</label>
                <input
                  type="number"
                  value={totalDays}
                  onChange={e => setTotalDays(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  placeholder="180"
                />
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                rows={2}
                placeholder="상품 설명 (선택)"
              />
            </div>

            {/* Active */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="rounded"
                id="is-active"
              />
              <label htmlFor="is-active" className="text-sm">활성 상품</label>
            </div>

            {/* Prices */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">기간별 가격</label>
                <button
                  onClick={addPrice}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  + 가격 추가
                </button>
              </div>
              {prices.length === 0 && (
                <p className="text-xs text-gray-400">가격을 추가해주세요</p>
              )}
              {prices.map((p, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input
                    type="number"
                    value={p.duration_days}
                    onChange={e => updatePrice(i, 'duration_days', parseInt(e.target.value) || 0)}
                    className="w-20 px-2 py-1.5 border rounded text-sm"
                    placeholder="일수"
                  />
                  <span className="text-xs text-gray-500">일</span>
                  <select
                    value={p.channel}
                    onChange={e => updatePrice(i, 'channel', e.target.value)}
                    className="px-2 py-1.5 border rounded text-sm"
                  >
                    <option value="kakaotalk">카카오톡</option>
                    <option value="imessage">iMessage</option>
                  </select>
                  <input
                    type="number"
                    value={p.price}
                    onChange={e => updatePrice(i, 'price', parseInt(e.target.value) || 0)}
                    className="w-28 px-2 py-1.5 border rounded text-sm"
                    placeholder="가격"
                  />
                  <span className="text-xs text-gray-500">원</span>
                  <button
                    onClick={() => removePrice(i)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- 메인 탭 ---
export function ProductsTab() {
  const [products, setProducts] = useState<ProductWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [editingProduct, setEditingProduct] = useState<ProductWithMeta | null | undefined>(undefined)
  // undefined = 모달 닫힘, null = 신규, ProductWithMeta = 편집

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/products/list')
      const data = await res.json()
      setProducts(data)
    } catch {
      console.error('Failed to fetch products')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  const formatPrice = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">상품 관리</h2>
        <button
          onClick={() => setEditingProduct(null)}
          className="px-3 py-1.5 text-sm bg-black text-white rounded-md hover:bg-gray-800"
        >
          + 상품 추가
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">로딩 중...</div>
      ) : products.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">등록된 상품이 없습니다</div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">SKU</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">상품명</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">타입</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">총 일수</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">가격</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">활성 구독</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">상태</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr
                  key={p.id}
                  onClick={() => setEditingProduct(p)}
                  className="border-b last:border-b-0 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-2.5 font-mono text-xs">{p.sku_code}</td>
                  <td className="px-4 py-2.5">{p.title}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      'inline-block px-2 py-0.5 rounded text-xs',
                      p.message_type === 'realtime'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    )}>
                      {p.message_type === 'realtime' ? '실시간' : '고정'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{p.total_days ? `${p.total_days}일` : '-'}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">
                    {p.product_prices?.length > 0
                      ? p.product_prices
                          .sort((a, b) => a.duration_days - b.duration_days)
                          .map(pr => `${pr.duration_days}일: ${formatPrice(pr.price)}`)
                          .join(' / ')
                      : '-'
                    }
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {p.active_subscriptions > 0 ? p.active_subscriptions.toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn(
                      'inline-block w-2 h-2 rounded-full',
                      p.is_active ? 'bg-green-400' : 'bg-gray-300'
                    )} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {editingProduct !== undefined && (
        <ProductFormModal
          product={editingProduct}
          onClose={() => setEditingProduct(undefined)}
          onSaved={fetchProducts}
        />
      )}
    </div>
  )
}
