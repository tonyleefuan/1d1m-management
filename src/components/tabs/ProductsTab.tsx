'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/ui/status-badge'
import { FormDialog } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonTable } from '@/components/ui/skeleton'
import { Toast } from '@/components/ui/Toast'
import { useToast } from '@/lib/use-toast'
import { Card } from '@/components/ui/card'
import { Package, Plus, X } from 'lucide-react'
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

  const addPrice = () => {
    setPrices([...prices, { duration_days: 365, channel: 'kakaotalk', price: 0 }])
  }

  const removePrice = (idx: number) => {
    setPrices(prices.filter((_, i) => i !== idx))
  }

  const updatePrice = (idx: number, field: string, value: string | number) => {
    const updated = [...prices]
    ;(updated[idx] as Record<string, string | number>)[field] = value
    setPrices(updated)
  }

  const handleSave = async () => {
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
      let errorMsg = '저장에 실패했습니다'
      try {
        const data = await res.json()
        errorMsg = data.error || errorMsg
      } catch (parseErr) {
        console.warn('에러 응답 JSON 파싱 실패:', parseErr)
      }
      throw new Error(errorMsg)
    }

    onSaved()
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      title={product ? '상품 수정' : '상품 추가'}
      size="lg"
      submitLabel="저장"
      validate={() => {
        if (!skuCode || !title) return 'SKU와 상품명은 필수입니다'
        return null
      }}
      onSubmit={handleSave}
    >
      <div className="space-y-4">
        {/* SKU + 메시지 타입 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>SKU 코드 *</Label>
            <Input
              value={skuCode}
              onChange={e => setSkuCode(e.target.value)}
              placeholder="SUB-1"
            />
          </div>
          <div className="space-y-1.5">
            <Label>메시지 타입</Label>
            <Select value={messageType} onValueChange={v => setMessageType(v as 'fixed' | 'realtime')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">고정 메시지</SelectItem>
                <SelectItem value="realtime">실시간 메시지</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <Label>상품명 *</Label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="180일간 압축해서 배우는 한국 근현대사"
          />
        </div>

        {/* Total Days (고정 메시지만) */}
        {messageType === 'fixed' && (
          <div className="space-y-1.5">
            <Label>메시지 총 일수</Label>
            <Input
              type="number"
              value={totalDays}
              onChange={e => setTotalDays(e.target.value)}
              placeholder="180"
            />
          </div>
        )}

        {/* Description */}
        <div className="space-y-1.5">
          <Label>설명</Label>
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="상품 설명 (선택)"
          />
        </div>

        {/* Active */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="is-active"
            checked={isActive}
            onCheckedChange={v => setIsActive(v === true)}
          />
          <Label htmlFor="is-active" className="font-normal">활성 상품</Label>
        </div>

        {/* Prices */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>기간별 가격</Label>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={addPrice}>
              + 가격 추가
            </Button>
          </div>
          {prices.length === 0 && (
            <p className="text-xs text-muted-foreground">가격을 추가해주세요</p>
          )}
          {prices.map((p, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <Input
                type="number"
                value={p.duration_days}
                onChange={e => updatePrice(i, 'duration_days', parseInt(e.target.value) || 0)}
                className="w-20"
                placeholder="일수"
              />
              <span className="text-xs text-muted-foreground">일</span>
              <Select value={p.channel} onValueChange={v => updatePrice(i, 'channel', v)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kakaotalk">카카오톡</SelectItem>
                  <SelectItem value="imessage">iMessage</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={p.price}
                onChange={e => updatePrice(i, 'price', parseInt(e.target.value) || 0)}
                className="w-28"
                placeholder="가격"
              />
              <span className="text-xs text-muted-foreground">원</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => removePrice(i)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </FormDialog>
  )
}

// --- 메인 탭 ---
export function ProductsTab() {
  const [products, setProducts] = useState<ProductWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [editingProduct, setEditingProduct] = useState<ProductWithMeta | null | undefined>(undefined)
  // undefined = 모달 닫힘, null = 신규, ProductWithMeta = 편집
  const { toast, showSuccess, showError, clearToast } = useToast()

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/products/list')
      if (!res.ok) throw new Error('불러오기 실패')
      const data = await res.json()
      setProducts(data)
    } catch (err) {
      console.error('상품 목록 조회 실패:', err)
      showError('상품 목록을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [showError])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  const formatPrice = (n: number) => n.toLocaleString('ko-KR') + '원'

  const handleSaved = () => {
    fetchProducts()
    showSuccess('상품이 저장되었습니다')
  }

  return (
    <div>
      {/* Header */}
      <PageHeader title="상품 관리" description="구독 상품과 기간별 가격을 관리합니다" className="mb-6">
        <Button onClick={() => setEditingProduct(null)}>
          <Plus className="h-4 w-4 mr-1.5" />
          상품 추가
        </Button>
      </PageHeader>

      {/* Table */}
      {loading ? (
        <SkeletonTable cols={7} rows={5} />
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="등록된 상품이 없습니다"
          description="새 상품을 등록해보세요"
          action={{ label: '상품 추가', onClick: () => setEditingProduct(null) }}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>상품명</TableHead>
                <TableHead>타입</TableHead>
                <TableHead>총 일수</TableHead>
                <TableHead>가격</TableHead>
                <TableHead className="text-right">활성 구독</TableHead>
                <TableHead className="text-center">상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map(p => (
                <TableRow
                  key={p.id}
                  onClick={() => setEditingProduct(p)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell className="font-mono text-xs">{p.sku_code}</TableCell>
                  <TableCell>{p.title}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.message_type === 'realtime' ? 'info' : 'neutral'}>
                      {p.message_type === 'realtime' ? '실시간' : '고정'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.total_days ? `${p.total_days}일` : '-'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {p.product_prices?.length > 0
                      ? p.product_prices
                          .sort((a, b) => a.duration_days - b.duration_days)
                          .map(pr => `${pr.duration_days}일: ${formatPrice(pr.price)}`)
                          .join(' / ')
                      : '-'
                    }
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.active_subscriptions > 0 ? p.active_subscriptions.toLocaleString() : '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge
                      status={p.is_active ? 'success' : 'neutral'}
                      variant="dot"
                    >
                      {p.is_active ? '활성' : '비활성'}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Modal */}
      {editingProduct !== undefined && (
        <ProductFormModal
          product={editingProduct}
          onClose={() => setEditingProduct(undefined)}
          onSaved={handleSaved}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}
