'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { Product, Message, DailyMessage, NoticeTemplate } from '@/lib/types'

type SubTab = 'fixed' | 'realtime' | 'notices'

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
  const msg = message as any
  const [dayNumber, setDayNumber] = useState(msg?.day_number?.toString() || '')
  const [sendDate, setSendDate] = useState(msg?.send_date || new Date().toISOString().slice(0, 10))
  const [content, setContent] = useState(msg?.content || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!content.trim()) { setError('내용을 입력해주세요'); return }
    if (isFixed && !dayNumber) { setError('Day 번호를 입력해주세요'); return }
    setSaving(true)
    setError('')
    try {
      const endpoint = isFixed ? '/api/messages/upsert' : '/api/daily-messages/upsert'
      const body: any = { id: msg?.id, product_id: productId, content: content.trim() }
      if (isFixed) body.day_number = parseInt(dayNumber)
      else body.send_date = sendDate
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const d = await res.json(); setError(d.error || '저장 실패'); return }
      onSaved(); onClose()
    } catch { setError('서버 연결 실패') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-bold mb-4">{msg ? '메시지 수정' : '메시지 추가'}</h3>
          <div className="space-y-4">
            {isFixed ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Day 번호</label>
                <input type="number" value={dayNumber} onChange={e => setDayNumber(e.target.value)}
                  className="w-32 px-3 py-2 border rounded-md text-sm" placeholder="1" />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">발송 날짜</label>
                <input type="date" value={sendDate} onChange={e => setSendDate(e.target.value)}
                  className="w-48 px-3 py-2 border rounded-md text-sm" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">메시지 내용</label>
              <textarea value={content} onChange={e => setContent(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm font-mono" rows={12} placeholder="메시지 내용을 입력하세요" />
            </div>
          </div>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">취소</button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
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

  const fetchMessages = useCallback(async () => {
    if (!selectedProduct) return
    setLoading(true)
    try {
      const res = await fetch(`/api/messages/list?product_id=${selectedProduct}`)
      setMessages(await res.json())
    } catch {} finally { setLoading(false) }
  }, [selectedProduct])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  return (
    <div className="flex gap-4">
      {/* 좌측: 상품 목록 */}
      <div className="w-56 shrink-0">
        <div className="bg-white border rounded-lg overflow-hidden">
          {fixedProducts.length === 0 ? (
            <p className="text-xs text-gray-400 p-3">고정 메시지 상품이 없습니다</p>
          ) : fixedProducts.map(p => (
            <button key={p.id} onClick={() => setSelectedProduct(p.id)}
              className={cn('w-full text-left px-3 py-2 text-sm border-b last:border-b-0 hover:bg-gray-50',
                selectedProduct === p.id && 'bg-blue-50 text-blue-700 font-medium')}>
              <div className="font-mono text-xs text-gray-500">{p.sku_code}</div>
              <div className="truncate">{p.title}</div>
            </button>
          ))}
        </div>
      </div>
      {/* 우측: 메시지 목록 */}
      <div className="flex-1">
        {!selectedProduct ? (
          <p className="text-sm text-gray-400 py-8 text-center">좌측에서 상품을 선택하세요</p>
        ) : loading ? (
          <p className="text-sm text-gray-400 py-8 text-center">로딩 중...</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{messages.length}개 메시지</span>
              <button onClick={() => setEditing(null)}
                className="px-3 py-1.5 text-xs bg-black text-white rounded-md hover:bg-gray-800">+ Day 추가</button>
            </div>
            <div className="space-y-1">
              {messages.map(m => (
                <div key={m.id} onClick={() => setEditing(m)}
                  className="bg-white border rounded px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-start gap-3">
                  <span className="text-xs font-mono text-gray-400 w-12 shrink-0 pt-0.5">D{m.day_number}</span>
                  <p className="text-sm text-gray-700 line-clamp-2 flex-1">{m.content}</p>
                </div>
              ))}
            </div>
          </>
        )}
        {editing !== undefined && selectedProduct && (
          <MessageEditModal message={editing} productId={selectedProduct} type="fixed"
            onClose={() => setEditing(undefined)} onSaved={fetchMessages} />
        )}
      </div>
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

  const fetchMessages = useCallback(async () => {
    if (!selectedProduct) return
    setLoading(true)
    try {
      const res = await fetch(`/api/daily-messages/list?product_id=${selectedProduct}`)
      setMessages(await res.json())
    } catch {} finally { setLoading(false) }
  }, [selectedProduct])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  return (
    <div className="flex gap-4">
      <div className="w-56 shrink-0">
        <div className="bg-white border rounded-lg overflow-hidden">
          {rtProducts.length === 0 ? (
            <p className="text-xs text-gray-400 p-3">실시간 메시지 상품이 없습니다</p>
          ) : rtProducts.map(p => (
            <button key={p.id} onClick={() => setSelectedProduct(p.id)}
              className={cn('w-full text-left px-3 py-2 text-sm border-b last:border-b-0 hover:bg-gray-50',
                selectedProduct === p.id && 'bg-blue-50 text-blue-700 font-medium')}>
              <div className="font-mono text-xs text-gray-500">{p.sku_code}</div>
              <div className="truncate">{p.title}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1">
        {!selectedProduct ? (
          <p className="text-sm text-gray-400 py-8 text-center">좌측에서 상품을 선택하세요</p>
        ) : loading ? (
          <p className="text-sm text-gray-400 py-8 text-center">로딩 중...</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">최근 {messages.length}개</span>
              <button onClick={() => setEditing(null)}
                className="px-3 py-1.5 text-xs bg-black text-white rounded-md hover:bg-gray-800">+ 새 메시지</button>
            </div>
            <div className="space-y-1">
              {messages.map(m => (
                <div key={m.id} onClick={() => setEditing(m)}
                  className="bg-white border rounded px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-start gap-3">
                  <span className="text-xs text-gray-400 w-20 shrink-0 pt-0.5">{m.send_date}</span>
                  <p className="text-sm text-gray-700 line-clamp-2 flex-1">{m.content}</p>
                </div>
              ))}
            </div>
          </>
        )}
        {editing !== undefined && selectedProduct && (
          <MessageEditModal message={editing} productId={selectedProduct} type="realtime"
            onClose={() => setEditing(undefined)} onSaved={fetchMessages} />
        )}
      </div>
    </div>
  )
}

// --- 알림 템플릿 패널 ---
function NoticesPanel({ products }: { products: Product[] }) {
  const [notices, setNotices] = useState<NoticeTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingNotice, setEditingNotice] = useState<{ notice: NoticeTemplate | null; type: 'start' | 'end'; productId: string | null } | null>(null)

  const fetchNotices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notices/list')
      setNotices(await res.json())
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchNotices() }, [fetchNotices])

  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSaveNotice = async () => {
    if (!editingNotice || !content.trim()) return
    setSaving(true)
    try {
      await fetch('/api/notices/upsert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingNotice.notice?.id,
          notice_type: editingNotice.type,
          product_id: editingNotice.productId,
          content: content.trim(),
        })
      })
      setEditingNotice(null)
      fetchNotices()
    } catch {} finally { setSaving(false) }
  }

  const startNotice = notices.find(n => n.notice_type === 'start' && !n.product_id)
  const endNotice = notices.find(n => n.notice_type === 'end' && !n.product_id)
  const productNotices = notices.filter(n => n.product_id)

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">로딩 중...</p>

  return (
    <div className="space-y-4">
      {/* 공통 알림 */}
      <div className="bg-white border rounded-lg p-4">
        <h4 className="text-sm font-bold mb-3">공통 알림 템플릿</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">시작 알림</span>
              <button onClick={() => { setEditingNotice({ notice: startNotice || null, type: 'start', productId: null }); setContent(startNotice?.content || '') }}
                className="text-xs text-blue-600 hover:text-blue-800">{startNotice ? '수정' : '+ 추가'}</button>
            </div>
            <p className="text-xs text-gray-500 bg-gray-50 rounded p-2 line-clamp-3">{startNotice?.content || '미설정'}</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">종료 알림</span>
              <button onClick={() => { setEditingNotice({ notice: endNotice || null, type: 'end', productId: null }); setContent(endNotice?.content || '') }}
                className="text-xs text-blue-600 hover:text-blue-800">{endNotice ? '수정' : '+ 추가'}</button>
            </div>
            <p className="text-xs text-gray-500 bg-gray-50 rounded p-2 line-clamp-3">{endNotice?.content || '미설정'}</p>
          </div>
        </div>
      </div>

      {/* 상품별 오버라이드 */}
      {productNotices.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h4 className="text-sm font-bold mb-3">상품별 오버라이드</h4>
          {productNotices.map(n => (
            <div key={n.id} className="flex items-start gap-3 py-2 border-b last:border-b-0">
              <span className="text-xs font-mono text-gray-400 w-16">{(n as any).product?.sku_code}</span>
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{n.notice_type === 'start' ? '시작' : '종료'}</span>
              <p className="text-xs text-gray-600 flex-1 line-clamp-1">{n.content}</p>
              <button onClick={() => { setEditingNotice({ notice: n, type: n.notice_type as 'start' | 'end', productId: n.product_id }); setContent(n.content) }}
                className="text-xs text-blue-600">수정</button>
            </div>
          ))}
        </div>
      )}

      {/* 편집 모달 */}
      {editingNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingNotice(null)}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold mb-4">{editingNotice.type === 'start' ? '시작' : '종료'} 알림 {editingNotice.notice ? '수정' : '추가'}</h3>
              <textarea value={content} onChange={e => setContent(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm" rows={6} placeholder="알림 메시지 내용" />
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setEditingNotice(null)} className="px-4 py-2 text-sm text-gray-600">취소</button>
                <button onClick={handleSaveNotice} disabled={saving}
                  className="px-4 py-2 text-sm bg-black text-white rounded-md disabled:opacity-50">
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- 메인 탭 ---
export function MessagesTab() {
  const [subTab, setSubTab] = useState<SubTab>('fixed')
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    fetch('/api/products/list').then(r => r.json()).then(d => setProducts(d || []))
  }, [])

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">메시지 관리</h2>

      {/* 서브탭 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {([['fixed', '고정 메시지'], ['realtime', '실시간 메시지'], ['notices', '알림 템플릿']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)}
            className={cn('px-4 py-1.5 text-sm rounded-md transition-colors',
              subTab === id ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700')}>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'fixed' && <FixedMessagesPanel products={products} />}
      {subTab === 'realtime' && <RealtimeMessagesPanel products={products} />}
      {subTab === 'notices' && <NoticesPanel products={products} />}
    </div>
  )
}
