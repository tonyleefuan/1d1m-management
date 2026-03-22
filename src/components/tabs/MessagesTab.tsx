'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import { FileText, Zap, Bell, Plus, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react'
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

// --- 상품 사이드바 (검색 포함) ---
function ProductSidebar({
  products,
  selectedProduct,
  onSelect,
}: {
  products: Product[]
  selectedProduct: string
  onSelect: (id: string) => void
}) {
  const [search, setSearch] = useState('')

  const filtered = search
    ? products.filter(p =>
        p.sku_code.toLowerCase().includes(search.toLowerCase()) ||
        p.title.toLowerCase().includes(search.toLowerCase())
      )
    : products

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
    <Card className="w-72 shrink-0 overflow-hidden">
      <div className="p-2 border-b">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="상품 코드 / 이름 검색"
          className="h-8 text-xs"
        />
      </div>
      <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3 text-center">검색 결과 없음</p>
        ) : filtered.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={cn(
              'w-full text-left px-4 py-3 text-sm border-b last:border-b-0 hover:bg-muted/50 transition-colors',
              selectedProduct === p.id && 'bg-accent text-accent-foreground font-medium border-l-2 border-l-primary'
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.sku_code}</span>
            </div>
            <div className="mt-1 text-xs leading-relaxed">{p.title}</div>
          </button>
        ))}
      </div>
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
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Message | null | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [msgSearch, setMsgSearch] = useState('')
  const [msgSearchInput, setMsgSearchInput] = useState('')
  const msgSearchTimer = useRef<ReturnType<typeof setTimeout>>()
  const pageSize = 50
  const { toast, showSuccess, showError, clearToast } = useToast()

  const handleMsgSearch = (value: string) => {
    setMsgSearchInput(value)
    if (msgSearchTimer.current) clearTimeout(msgSearchTimer.current)
    msgSearchTimer.current = setTimeout(() => {
      setMsgSearch(value)
      setPage(1)
    }, 300)
  }

  const fetchMessages = useCallback(async () => {
    if (!selectedProduct) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ product_id: selectedProduct, page: String(page), limit: String(pageSize) })
      if (msgSearch) params.set('search', msgSearch)
      const res = await fetch(`/api/messages/list?${params}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setMessages(data.data || data || [])
      setTotal(data.total || 0)
    } catch {
      showError('메시지를 불러오지 못했습니다')
    } finally { setLoading(false) }
  }, [selectedProduct, page, msgSearch, showError])

  useEffect(() => { fetchMessages() }, [fetchMessages])
  useEffect(() => { setPage(1) }, [selectedProduct])

  const handleSaved = () => {
    fetchMessages()
    showSuccess('메시지가 저장되었습니다')
  }

  const totalPages = Math.ceil(total / pageSize)

  // 같은 day_number가 여러 개인지 확인
  const dayCounts = new Map<number, number>()
  messages.forEach(m => {
    const d = m.day_number
    dayCounts.set(d, (dayCounts.get(d) || 0) + 1)
  })

  return (
    <div className="flex gap-4">
      <ProductSidebar
        products={fixedProducts}
        selectedProduct={selectedProduct}
        onSelect={setSelectedProduct}
      />
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
            <div className="flex items-center gap-3 mb-3">
              <Input
                value={msgSearchInput}
                onChange={e => handleMsgSearch(e.target.value)}
                placeholder="Day 번호 또는 내용 검색"
                className="h-8 text-xs w-[200px]"
              />
              <span className="text-sm text-muted-foreground flex-1">총 {total}개</span>
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
              <>
                <div className="space-y-1.5 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
                  {messages.map((m, idx) => {
                    const hasMultiple = (dayCounts.get(m.day_number) || 0) > 1
                    // 같은 day_number 내에서 몇 번째인지
                    const sameDay = messages.filter(x => x.day_number === m.day_number)
                    const partIdx = sameDay.indexOf(m) + 1

                    return (
                      <div
                        key={m.id}
                        className="flex items-start gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => setEditing(m)}
                      >
                        <div className="shrink-0 w-16 flex items-center gap-1">
                          <span className="inline-block font-mono text-xs font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded">
                            D{m.day_number}
                          </span>
                          {hasMultiple && (
                            <span className="inline-block text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                              {partIdx}
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-foreground line-clamp-2 flex-1 leading-relaxed">{m.content}</p>
                      </div>
                    )
                  })}
                </div>
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 pt-3">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>이전</Button>
                    <span className="text-xs text-muted-foreground tabular-nums">{page} / {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>다음</Button>
                  </div>
                )}
              </>
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
  const [todayStatus, setTodayStatus] = useState<{ date: string; status: Record<string, string> } | null>(null)
  const { toast, showSuccess, showError, clearToast } = useToast()

  // 오늘자 메시지 현황
  useEffect(() => {
    fetch('/api/daily-messages/today-status')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setTodayStatus(d))
      .catch(() => {})
  }, [])

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

  const refreshTodayStatus = () => {
    fetch('/api/daily-messages/today-status')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setTodayStatus(d))
      .catch(() => {})
  }

  const handleSaved = () => {
    fetchMessages()
    refreshTodayStatus()
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
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-medium">오늘의 메시지 현황</span>
              {todayStatus && (
                <span className="text-xs text-muted-foreground font-mono">{todayStatus.date}</span>
              )}
            </div>
            {todayStatus ? (
              <div className="space-y-2">
                {rtProducts.map(p => {
                  const hasMessage = !!todayStatus.status[p.id]
                  const preview = todayStatus.status[p.id]
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors',
                        hasMessage
                          ? 'bg-card hover:bg-muted/50'
                          : 'bg-destructive/5 border-destructive/20 hover:bg-destructive/10'
                      )}
                      onClick={() => setSelectedProduct(p.id)}
                    >
                      {hasMessage ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{p.sku_code}</span>
                          <span className="text-sm font-medium">{p.title}</span>
                        </div>
                        {hasMessage ? (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{preview}</p>
                        ) : (
                          <p className="text-xs text-destructive mt-0.5">미작성</p>
                        )}
                      </div>
                    </div>
                  )
                })}
                <p className="text-xs text-muted-foreground pt-2">
                  {rtProducts.filter(p => todayStatus.status[p.id]).length}/{rtProducts.length}개 작성 완료
                </p>
              </div>
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
          </div>
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
              <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                {messages.map(m => (
                  <div
                    key={m.id}
                    className="flex items-start gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setEditing(m)}
                  >
                    <span className="shrink-0 font-mono text-xs font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded">
                      {m.send_date?.slice(5)}
                    </span>
                    <p className="text-[13px] text-foreground line-clamp-2 flex-1 leading-relaxed">{m.content}</p>
                  </div>
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

      <Tabs defaultValue="realtime">
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
