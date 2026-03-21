'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, SectionHeader } from '@/components/ui/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormDialog } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Toast } from '@/components/ui/Toast'
import { useToast } from '@/lib/use-toast'
import { cn } from '@/lib/utils'
import { FileText, Zap, Bell, Plus, MessageSquare } from 'lucide-react'
import type { Product, Message, DailyMessage, NoticeTemplate } from '@/lib/types'

// --- 메시지 편집 모달 ---
function MessageEditModal({
  message, productId, onClose, onSaved, type
}: {
  message: (Message | DailyMessage) | null
  productId: string
  onClose: () => void
  onSaved: () => void
  type: 'fixed' | 'realtime'
}) {
  const isFixed = type === 'fixed'
  const msg = message as Record<string, unknown> | null
  const [dayNumber, setDayNumber] = useState(msg?.day_number?.toString() || '')
  const [sendDate, setSendDate] = useState((msg?.send_date as string) || new Date().toISOString().slice(0, 10))
  const [content, setContent] = useState((msg?.content as string) || '')

  const handleSave = async () => {
    const endpoint = isFixed ? '/api/messages/upsert' : '/api/daily-messages/upsert'
    const body: Record<string, unknown> = { id: msg?.id, product_id: productId, content: content.trim() }
    if (isFixed) body.day_number = parseInt(dayNumber)
    else body.send_date = sendDate
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || '저장 실패')
    }
    onSaved()
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      title={msg ? '메시지 수정' : '메시지 추가'}
      size="lg"
      submitLabel="저장"
      validate={() => {
        if (!content.trim()) return '내용을 입력해주세요'
        if (isFixed && !dayNumber) return 'Day 번호를 입력해주세요'
        return null
      }}
      onSubmit={handleSave}
    >
      <div className="space-y-4">
        {isFixed ? (
          <div className="space-y-1.5">
            <Label>Day 번호</Label>
            <Input
              type="number"
              value={dayNumber}
              onChange={e => setDayNumber(e.target.value)}
              className="w-32"
              placeholder="1"
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>발송 날짜</Label>
            <Input
              type="date"
              value={sendDate}
              onChange={e => setSendDate(e.target.value)}
              className="w-48"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>메시지 내용</Label>
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="font-mono"
            rows={12}
            placeholder="메시지 내용을 입력하세요"
          />
        </div>
      </div>
    </FormDialog>
  )
}

// --- 상품 사이드바 ---
function ProductSidebar({
  products,
  selectedProduct,
  onSelect,
}: {
  products: Product[]
  selectedProduct: string
  onSelect: (id: string) => void
}) {
  if (products.length === 0) {
    return (
      <Card className="w-56 shrink-0">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">해당 타입의 상품이 없습니다</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-56 shrink-0 overflow-hidden">
      {products.map(p => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={cn(
            'w-full text-left px-3 py-2 text-sm border-b last:border-b-0 hover:bg-muted/50 transition-colors',
            selectedProduct === p.id && 'bg-accent text-accent-foreground font-medium'
          )}
        >
          <div className="font-mono text-xs text-muted-foreground">{p.sku_code}</div>
          <div className="truncate">{p.title}</div>
        </button>
      ))}
    </Card>
  )
}

// --- 메시지 목록 스켈레톤 ---
function MessageListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-2">
          <Skeleton className="h-4 w-12 shrink-0" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  )
}

// --- 고정 메시지 패널 ---
function FixedMessagesPanel({ products }: { products: Product[] }) {
  const fixedProducts = products.filter(p => p.message_type === 'fixed')
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Message | null | undefined>(undefined)
  const { toast, showSuccess, showError, clearToast } = useToast()

  const fetchMessages = useCallback(async () => {
    if (!selectedProduct) return
    setLoading(true)
    try {
      const res = await fetch(`/api/messages/list?product_id=${selectedProduct}`)
      if (!res.ok) throw new Error('Failed')
      setMessages(await res.json())
    } catch {
      showError('메시지를 불러오지 못했습니다')
    } finally { setLoading(false) }
  }, [selectedProduct, showError])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  const handleSaved = () => {
    fetchMessages()
    showSuccess('메시지가 저장되었습니다')
  }

  return (
    <div className="flex gap-4">
      {/* 좌측: 상품 목록 */}
      <ProductSidebar
        products={fixedProducts}
        selectedProduct={selectedProduct}
        onSelect={setSelectedProduct}
      />
      {/* 우측: 메시지 목록 */}
      <div className="flex-1">
        {!selectedProduct ? (
          <EmptyState
            icon={FileText}
            title="상품을 선택하세요"
            description="좌측에서 상품을 선택하면 메시지 목록이 표시됩니다"
          />
        ) : loading ? (
          <MessageListSkeleton />
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{messages.length}개 메시지</span>
              <Button size="sm" onClick={() => setEditing(null)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Day 추가
              </Button>
            </div>
            {messages.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="메시지가 없습니다"
                description="새 Day 메시지를 추가해보세요"
                action={{ label: 'Day 추가', onClick: () => setEditing(null) }}
              />
            ) : (
              <div className="space-y-1">
                {messages.map(m => (
                  <Card
                    key={m.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setEditing(m)}
                  >
                    <CardContent className="p-3 flex items-start gap-3">
                      <span className="text-xs font-mono text-muted-foreground w-12 shrink-0 pt-0.5">D{m.day_number}</span>
                      <p className="text-sm text-foreground line-clamp-2 flex-1">{m.content}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
        {editing !== undefined && selectedProduct && (
          <MessageEditModal
            message={editing}
            productId={selectedProduct}
            type="fixed"
            onClose={() => setEditing(undefined)}
            onSaved={handleSaved}
          />
        )}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}

// --- 실시간 메시지 패널 ---
function RealtimeMessagesPanel({ products }: { products: Product[] }) {
  const rtProducts = products.filter(p => p.message_type === 'realtime')
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [messages, setMessages] = useState<DailyMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<DailyMessage | null | undefined>(undefined)
  const { toast, showSuccess, showError, clearToast } = useToast()

  const fetchMessages = useCallback(async () => {
    if (!selectedProduct) return
    setLoading(true)
    try {
      const res = await fetch(`/api/daily-messages/list?product_id=${selectedProduct}`)
      if (!res.ok) throw new Error('Failed')
      setMessages(await res.json())
    } catch {
      showError('메시지를 불러오지 못했습니다')
    } finally { setLoading(false) }
  }, [selectedProduct, showError])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  const handleSaved = () => {
    fetchMessages()
    showSuccess('메시지가 저장되었습니다')
  }

  return (
    <div className="flex gap-4">
      <ProductSidebar
        products={rtProducts}
        selectedProduct={selectedProduct}
        onSelect={setSelectedProduct}
      />
      <div className="flex-1">
        {!selectedProduct ? (
          <EmptyState
            icon={Zap}
            title="상품을 선택하세요"
            description="좌측에서 상품을 선택하면 메시지 목록이 표시됩니다"
          />
        ) : loading ? (
          <MessageListSkeleton />
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">최근 {messages.length}개</span>
              <Button size="sm" onClick={() => setEditing(null)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                새 메시지
              </Button>
            </div>
            {messages.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="메시지가 없습니다"
                description="새 실시간 메시지를 추가해보세요"
                action={{ label: '새 메시지', onClick: () => setEditing(null) }}
              />
            ) : (
              <div className="space-y-1">
                {messages.map(m => (
                  <Card
                    key={m.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setEditing(m)}
                  >
                    <CardContent className="p-3 flex items-start gap-3">
                      <span className="text-xs text-muted-foreground w-20 shrink-0 pt-0.5">{m.send_date}</span>
                      <p className="text-sm text-foreground line-clamp-2 flex-1">{m.content}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
        {editing !== undefined && selectedProduct && (
          <MessageEditModal
            message={editing}
            productId={selectedProduct}
            type="realtime"
            onClose={() => setEditing(undefined)}
            onSaved={handleSaved}
          />
        )}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}

// --- 알림 템플릿 패널 ---
function NoticesPanel({ products }: { products: Product[] }) {
  const [notices, setNotices] = useState<NoticeTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingNotice, setEditingNotice] = useState<{ notice: NoticeTemplate | null; type: 'start' | 'end'; productId: string | null } | null>(null)
  const [content, setContent] = useState('')
  const { toast, showSuccess, showError, clearToast } = useToast()

  const fetchNotices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notices/list')
      setNotices(await res.json())
    } catch {
      showError('알림 템플릿을 불러오지 못했습니다')
    } finally { setLoading(false) }
  }, [showError])

  useEffect(() => { fetchNotices() }, [fetchNotices])

  const handleSaveNotice = async () => {
    if (!editingNotice || !content.trim()) return
    const res = await fetch('/api/notices/upsert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingNotice.notice?.id,
        notice_type: editingNotice.type,
        product_id: editingNotice.productId,
        content: content.trim(),
      })
    })
    if (!res.ok) {
      showError('알림 템플릿 저장에 실패했습니다')
      return
    }
    setEditingNotice(null)
    fetchNotices()
    showSuccess('알림 템플릿이 저장되었습니다')
  }

  const startNotice = notices.find(n => n.notice_type === 'start' && !n.product_id)
  const endNotice = notices.find(n => n.notice_type === 'end' && !n.product_id)
  const productNotices = notices.filter(n => n.product_id)

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 공통 알림 */}
      <Card>
        <CardContent className="p-4">
          <SectionHeader title="공통 알림 템플릿" className="mb-3" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">시작 알림</span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => { setEditingNotice({ notice: startNotice || null, type: 'start', productId: null }); setContent(startNotice?.content || '') }}
                >
                  {startNotice ? '수정' : '+ 추가'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground bg-muted rounded p-2 line-clamp-3">{startNotice?.content || '미설정'}</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">종료 알림</span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => { setEditingNotice({ notice: endNotice || null, type: 'end', productId: null }); setContent(endNotice?.content || '') }}
                >
                  {endNotice ? '수정' : '+ 추가'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground bg-muted rounded p-2 line-clamp-3">{endNotice?.content || '미설정'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 상품별 오버라이드 */}
      {productNotices.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <SectionHeader title="상품별 오버라이드" className="mb-3" />
            {productNotices.map(n => (
              <div key={n.id} className="flex items-start gap-3 py-2 border-b last:border-b-0">
                <span className="text-xs font-mono text-muted-foreground w-16">{(n as unknown as { product?: { sku_code: string } }).product?.sku_code}</span>
                <span className="text-xs px-1.5 py-0.5 bg-muted rounded">{n.notice_type === 'start' ? '시작' : '종료'}</span>
                <p className="text-xs text-muted-foreground flex-1 line-clamp-1">{n.content}</p>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => { setEditingNotice({ notice: n, type: n.notice_type as 'start' | 'end', productId: n.product_id }); setContent(n.content) }}
                >
                  수정
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 편집 모달 */}
      {editingNotice && (
        <FormDialog
          open
          onClose={() => setEditingNotice(null)}
          title={`${editingNotice.type === 'start' ? '시작' : '종료'} 알림 ${editingNotice.notice ? '수정' : '추가'}`}
          submitLabel="저장"
          validate={() => {
            if (!content.trim()) return '내용을 입력해주세요'
            return null
          }}
          onSubmit={handleSaveNotice}
        >
          <div className="space-y-1.5">
            <Label>알림 메시지 내용</Label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={6}
              placeholder="알림 메시지 내용"
            />
          </div>
        </FormDialog>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}

// --- 메인 탭 ---
export function MessagesTab() {
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    fetch('/api/products/list').then(r => r.json()).then(d => setProducts(d || [])).catch(() => {})
  }, [])

  return (
    <div>
      <PageHeader title="메시지 관리" description="고정/실시간 메시지와 알림 템플릿을 관리합니다" className="mb-6" />

      <Tabs defaultValue="fixed">
        <TabsList>
          <TabsTrigger value="fixed">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            고정 메시지
          </TabsTrigger>
          <TabsTrigger value="realtime">
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            실시간 메시지
          </TabsTrigger>
          <TabsTrigger value="notices">
            <Bell className="h-3.5 w-3.5 mr-1.5" />
            알림 템플릿
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fixed">
          <FixedMessagesPanel products={products} />
        </TabsContent>
        <TabsContent value="realtime">
          <RealtimeMessagesPanel products={products} />
        </TabsContent>
        <TabsContent value="notices">
          <NoticesPanel products={products} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
