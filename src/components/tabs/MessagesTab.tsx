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
import { FileText, Zap, Bell, Plus, MessageSquare, CheckCircle2, AlertCircle, Save, Loader2, CalendarCheck, Sparkles, RotateCcw, Check, Wand2, X, Image as ImageIcon, Copy } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { Product, Message, DailyMessage, NoticeTemplate } from '@/lib/types'

// --- 소스 기반 메시지 생성 다이얼로그 ---
function SourceGenerateDialog({
  productId, productSku, date, existingContent, existingStatus, existingId,
  onClose, onSaved, onBgGenerate,
}: {
  productId: string
  productSku: string
  date: string
  existingContent?: string
  existingStatus?: string
  existingId?: string
  onClose: () => void
  onSaved: () => void
  onBgGenerate?: () => void
}) {
  const [sourceText, setSourceText] = useState('')
  const [images, setImages] = useState<{ data: string; media_type: string; name: string }[]>([])
  const [generating, setGenerating] = useState(false)
  const [content, setContent] = useState(existingContent || '')
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const { showSuccess, showError } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const days = ['일', '월', '화', '수', '목', '금', '토']
  const [_y, _m, _d] = date.split('-').map(Number)
  const dayName = days[new Date(Date.UTC(_y, _m - 1, _d)).getUTCDay()]

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // data:image/png;base64,xxxx → extract base64 + media_type
        const match = result.match(/^data:(image\/[^;]+);base64,(.+)$/)
        if (match) {
          setImages(prev => [...prev, { data: match[2], media_type: match[1], name: file.name }])
        }
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  // 백그라운드 생성 — 요청만 보내고 폴링으로 결과 확인
  const abortRef = useRef<AbortController | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 컴포넌트 unmount 시 폴링 정리 (생성은 서버에서 계속 진행됨)
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/daily-messages/list?product_id=${productId}`)
        if (!res.ok) return
        const msgs = await res.json()
        const msg = msgs.find((m: Record<string, unknown>) => m.send_date === date)
        if (msg?.content) {
          setContent(msg.content as string)
          setGenerating(false)
          showSuccess('AI 메시지가 생성되었습니다')
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
        }
      } catch (err) { console.error('Polling error:', err) }
    }, 3000)
  }, [productId, date, showSuccess])

  const handleGenerate = async () => {
    if (!sourceText.trim() && images.length === 0) {
      showError('기사 링크, 검색어, 이미지 등 소스를 입력해주세요')
      return
    }
    setGenerating(true)
    try {
      const sources: { type: string; content: string; media_type?: string }[] = []
      if (sourceText.trim()) {
        sources.push({ type: 'text', content: sourceText.trim() })
      }
      for (const img of images) {
        sources.push({ type: 'image', content: img.data, media_type: img.media_type })
      }

      abortRef.current = new AbortController()
      const res = await fetch('/api/ai/generate-with-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, date, sources }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || '생성 실패')
      }
      const data = await res.json()
      if (data.content) {
        setContent(data.content)
        showSuccess('메시지가 생성되었습니다')
      } else {
        showError('메시지 생성 결과가 비어있습니다. 다시 시도해주세요.')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 다이얼로그 닫으면서 abort — 서버에서는 계속 진행 중
        return
      }
      showError(err instanceof Error ? err.message : '생성에 실패했습니다')
    } finally {
      setGenerating(false)
    }
  }

  // "백그라운드 생성" — 요청 보내고 다이얼로그 닫아도 서버에서 계속 생성
  const handleGenerateBackground = async () => {
    if (!sourceText.trim() && images.length === 0) {
      showError('기사 링크, 검색어, 이미지 등 소스를 입력해주세요')
      return
    }
    setGenerating(true)

    const sources: { type: string; content: string; media_type?: string }[] = []
    if (sourceText.trim()) {
      sources.push({ type: 'text', content: sourceText.trim() })
    }
    for (const img of images) {
      sources.push({ type: 'image', content: img.data, media_type: img.media_type })
    }

    // fire-and-forget: 서버에 요청만 보내고 폴링으로 결과 확인
    fetch('/api/ai/generate-with-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, date, sources }),
    }).catch((err) => { console.error('Background generation error:', err) })  // 서버 에러는 DB에 기록됨

    showSuccess('AI 생성이 백그라운드에서 진행됩니다. 다른 작업을 하셔도 됩니다.')
    onBgGenerate?.()
    startPolling()
  }

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { product_id: productId, send_date: date, content: content.trim() }
      if (existingId) body.id = existingId
      const res = await fetch('/api/daily-messages/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('저장 실패')
      showSuccess('저장되었습니다')
      onSaved()
    } catch {
      showError('저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async () => {
    if (!content.trim()) return
    setApproving(true)
    try {
      // 먼저 저장
      const saveBody: Record<string, unknown> = { product_id: productId, send_date: date, content: content.trim() }
      if (existingId) saveBody.id = existingId
      const saveRes = await fetch('/api/daily-messages/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveBody),
      })
      if (!saveRes.ok) throw new Error('저장 실패')

      // 저장된 ID를 찾아서 승인
      const { data: msg } = await fetch(`/api/daily-messages/list?product_id=${productId}`).then(r => r.json()).then((msgs: any[]) => ({
        data: msgs.find((m: any) => m.send_date === date)
      }))
      if (msg?.id) {
        const res = await fetch('/api/daily-messages/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: msg.id, status: 'approved' }),
        })
        if (!res.ok) throw new Error('승인 실패')
      }
      showSuccess('메시지가 승인되었습니다')
      onSaved()
    } catch {
      showError('승인에 실패했습니다')
    } finally {
      setApproving(false)
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm bg-primary text-primary-foreground px-2 py-0.5 rounded">{productSku}</span>
            <span>{date.slice(5)} ({dayName})</span>
            <span className="text-muted-foreground font-normal text-sm">메시지 생성</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 기존 메시지 미리보기 */}
          {existingContent && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[11px] text-muted-foreground">현재 메시지</span>
                {existingStatus === 'approved' ? (
                  <StatusBadge status="success" size="xs">승인됨</StatusBadge>
                ) : (
                  <StatusBadge status="warning" size="xs">초안</StatusBadge>
                )}
              </div>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">{existingContent}</p>
            </div>
          )}

          {/* 소스 입력 영역 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">소스 입력</Label>
            <Textarea
              value={sourceText}
              onChange={e => setSourceText(e.target.value)}
              placeholder={`기사 링크, 검색어, 주제, 메모 등 자유롭게 입력\n\n예시:\nhttps://www.bbc.com/news/article-123\nhttps://www.reuters.com/world/...\n\n또는: 트럼프 관세, 이란 핵시설, BTS 복귀`}
              className="font-mono text-sm min-h-[120px]"
            />

            {/* 첨부된 이미지 미리보기 */}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={`data:${img.media_type};base64,${img.data}`}
                      alt={img.name}
                      className="h-16 w-16 object-cover rounded border"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 rounded-full h-auto w-auto p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <span className="text-[9px] text-muted-foreground block text-center mt-0.5 truncate max-w-[64px]">{img.name}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageAdd}
                className="hidden"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                이미지 첨부
              </Button>
              <div className="flex-1" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleGenerateBackground}
                disabled={generating || (!sourceText.trim() && images.length === 0)}
                title="생성 요청 후 다이얼로그를 닫아도 서버에서 계속 생성됩니다"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                )}
                {generating ? '생성 중...' : 'AI 생성 (백그라운드)'}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleGenerate}
                disabled={generating || (!sourceText.trim() && images.length === 0)}
                title="생성 완료까지 이 창에서 대기합니다"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                {generating ? 'AI 생성 중...' : 'AI 생성 (대기)'}
              </Button>
            </div>
          </div>

          {/* 생성 결과 / 편집 영역 */}
          {content && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">생성 결과</Label>
              <Textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                className="font-mono text-sm min-h-[300px]"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground tabular-nums">{content.length}자</span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleSave}
                    disabled={saving || !content.trim()}
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    초안 저장
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleApprove}
                    disabled={approving || !content.trim()}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {approving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                    승인
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

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
  const { showSuccess, showError } = useToast()

  // AI features state (daily messages only)
  const isDailyMessage = !isFixed && !!msg?.send_date
  const [approving, setApproving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiModifying, setAiModifying] = useState(false)

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

  const handleApprove = async () => {
    if (!msg?.id) return
    setApproving(true)
    try {
      // 수정된 내용이 있으면 먼저 저장
      if (content.trim() !== (msg.content as string)) {
        const saveRes = await fetch('/api/daily-messages/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: msg.id, product_id: productId, send_date: msg.send_date, content: content.trim() }),
        })
        if (!saveRes.ok) throw new Error('저장 실패')
      }
      // 그 다음 승인
      const res = await fetch('/api/daily-messages/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: msg.id, status: 'approved' }),
      })
      if (!res.ok) throw new Error('승인 실패')
      showSuccess('메시지가 승인되었습니다')
      onSaved()
    } catch {
      showError('승인에 실패했습니다')
    } finally {
      setApproving(false)
    }
  }

  const handleRegenerate = async () => {
    if (!msg?.send_date) return
    setRegenerating(true)
    try {
      // Find sku_code from productId - we use the product_id param
      const params = new URLSearchParams({ date: msg.send_date as string })
      // We need to get the sku_code - fetch product info
      const prodRes = await fetch(`/api/products/list`)
      const products = await prodRes.json()
      const product = products?.find((p: any) => p.id === productId)
      if (product?.sku_code) params.set('sku', product.sku_code)

      const res = await fetch(`/api/ai/generate-daily?${params}`, { method: 'POST' })
      if (!res.ok) throw new Error('재생성 실패')
      const data = await res.json()
      const result = data.results?.find((r: any) => r.status === 'success')
      if (result) {
        setContent(result.content || content)
        showSuccess('메시지가 재생성되었습니다')
      } else {
        showError('재생성 결과가 없습니다')
      }
      onSaved()
    } catch {
      showError('메시지 재생성에 실패했습니다')
    } finally {
      setRegenerating(false)
    }
  }

  const handleAiModify = async () => {
    if (!msg?.id || !aiInstruction.trim()) return
    setAiModifying(true)
    try {
      const res = await fetch('/api/ai/modify-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: msg.id, instruction: aiInstruction.trim() }),
      })
      if (!res.ok) throw new Error('수정 실패')
      const data = await res.json()
      if (data.content) {
        setContent(data.content)
        showSuccess('AI 수정이 적용되었습니다')
        setAiInstruction('')
      }
    } catch {
      showError('AI 수정에 실패했습니다')
    } finally {
      setAiModifying(false)
    }
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
            rows={24}
            placeholder="메시지 내용을 입력하세요"
          />
        </div>

        {(msg?.image_path as string | null) && (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">이미지</label>
            <img
              src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/messages/${msg?.image_path as string}`}
              alt="preview"
              className="max-w-[200px] max-h-[200px] rounded border object-contain"
            />
          </div>
        )}

        {/* AI features for daily messages */}
        {isDailyMessage && !!(msg?.id) && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleApprove}
                disabled={approving}
                className="text-primary border-primary/30 hover:bg-primary/5"
              >
                {approving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                승인
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                {regenerating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
                재생성
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Wand2 className="h-3 w-3" />
                AI 수정 지시
              </Label>
              <div className="flex gap-2">
                <Input
                  value={aiInstruction}
                  onChange={e => setAiInstruction(e.target.value)}
                  placeholder="예: 좀 더 친근하게 바꿔줘, 이모지 추가해줘"
                  className="flex-1 text-sm"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiModify() } }}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAiModify}
                  disabled={aiModifying || !aiInstruction.trim()}
                >
                  {aiModifying ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  수정
                </Button>
              </div>
            </div>
          </div>
        )}
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
          <Button
            key={p.id}
            variant="ghost"
            onClick={() => onSelect(p.id)}
            className={cn(
              'w-full text-left justify-start h-auto px-4 py-3 text-sm rounded-none border-b last:border-b-0 hover:bg-muted/50',
              selectedProduct === p.id && 'bg-accent text-accent-foreground font-medium border-l-2 border-l-primary'
            )}
          >
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.sku_code}</span>
              </div>
              <div className="mt-1 text-xs leading-relaxed">{p.title}</div>
            </div>
          </Button>
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
                  {messages.map((m) => {
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
                        {m.image_path ? (
                          <div className="flex items-center gap-2 flex-1">
                            <img
                              src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/messages/${m.image_path}`}
                              alt={m.image_path}
                              className="w-10 h-10 object-cover rounded border"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                            <span className="text-xs text-muted-foreground">{m.image_path}</span>
                          </div>
                        ) : (
                          <p className="text-[13px] text-foreground line-clamp-2 flex-1 leading-relaxed">{m.content}</p>
                        )}
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

// --- 오늘의 메시지 패널 (7일 그리드) ---
type GridCell = { content: string; status: string; id: string }
type GridData = { dates: string[]; today: string; grid: Record<string, Record<string, GridCell>> }

function TodayMessagesPanel({ products }: { products: Product[] }) {
  const rtProducts = products.filter(p => p.message_type === 'realtime')
  const { toast, showSuccess, showError, clearToast } = useToast()
  const [gridData, setGridData] = useState<GridData | null>(null)
  // drafts keyed by `${productId}:${date}`
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState<{ current: number; total: number; sku: string; title: string; done: string[] } | null>(null)
  const [editingCell, setEditingCell] = useState<{ productId: string; sku: string; title: string; date: string; cell?: GridCell } | null>(null)
  // 상단 퀵 입력 섹션 — 상품별 소스 텍스트
  const [quickSources, setQuickSources] = useState<Record<string, string>>({})
  // 백그라운드 생성 중인 셀 추적 (key: `${productId}:${date}`)
  const [bgGenerating, setBgGenerating] = useState<Set<string>>(new Set())
  const [copiedSku, setCopiedSku] = useState<string | null>(null)
  const bgPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 백그라운드 생성 셀 폴링
  useEffect(() => {
    if (bgGenerating.size === 0) {
      if (bgPollRef.current) { clearInterval(bgPollRef.current); bgPollRef.current = null }
      return
    }
    if (bgPollRef.current) return // 이미 폴링 중
    bgPollRef.current = setInterval(() => {
      refresh()
    }, 4000)
    return () => { if (bgPollRef.current) { clearInterval(bgPollRef.current); bgPollRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgGenerating.size])

  const refresh = useCallback(() => {
    fetch('/api/daily-messages/today-status')
      .then(r => r.ok ? r.json() : null)
      .then((d: GridData | null) => {
        if (!d) return
        setGridData(d)
        // 생성 완료된 셀을 bgGenerating에서 제거
        setBgGenerating(prev => {
          const next = new Set(prev)
          let changed = false
          for (const key of prev) {
            const [pid, dt] = key.split(':')
            if (d.grid[pid]?.[dt]?.content) {
              next.delete(key)
              changed = true
            }
          }
          if (changed && next.size > 0) {
            showSuccess('AI 메시지가 생성되었습니다')
          }
          return changed ? next : prev
        })
      })
      .catch((err) => { console.error('Refresh today-status error:', err) })
  }, [showSuccess])

  useEffect(() => { refresh() }, [refresh])

  if (!gridData) return <Skeleton className="h-60 w-full" />

  const { dates, today, grid } = gridData
  const doneCount = rtProducts.filter(p => grid[p.id]?.[today]?.content).length

  // 내일 날짜 계산 (UTC 기반으로 타임존 영향 제거)
  const tomorrowDate = (() => {
    const [y, m, d] = today.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d + 1))
    return dt.toISOString().slice(0, 10)
  })()

  const handleSave = async (productId: string, date: string) => {
    const key = `${productId}:${date}`
    const content = drafts[key]?.trim()
    if (!content) return
    setSaving(s => ({ ...s, [key]: true }))
    try {
      const res = await fetch('/api/daily-messages/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, send_date: date, content }),
      })
      if (!res.ok) throw new Error('실패')
      showSuccess('저장되었습니다')
      setDrafts(d => { const n = { ...d }; delete n[key]; return n })
      refresh()
    } catch {
      showError('저장에 실패했습니다')
    } finally {
      setSaving(s => ({ ...s, [key]: false }))
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenProgress(null)
    try {
      const res = await fetch('/api/ai/generate-daily?stream=1', { method: 'POST' })
      if (!res.ok) throw new Error('생성 실패')

      const reader = res.body?.getReader()
      if (!reader) throw new Error('스트림 없음')

      const decoder = new TextDecoder()
      let buffer = ''
      const doneSkus: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'progress') {
              setGenProgress({ current: event.current, total: event.total, sku: event.sku, title: event.title, done: [...doneSkus] })
            } else if (event.type === 'done') {
              doneSkus.push(event.sku)
              setGenProgress(prev => prev ? { ...prev, done: [...doneSkus] } : null)
              refresh()
            } else if (event.type === 'complete') {
              const successCount = event.results.filter((r: any) => r.status === 'success').length
              showSuccess(`${successCount}개 메시지 생성 완료`)
            }
          } catch (err) { console.error('SSE parse error:', err) }
        }
      }
      refresh()
    } catch {
      showError('메시지 자동 생성 실패')
    } finally {
      setGenerating(false)
      setGenProgress(null)
    }
  }

  const formatDate = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number)
    const day = ['일','월','화','수','목','금','토'][new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]
    return { short: d.slice(5), day }
  }

  const getDateLabel = (d: string) => {
    if (d === today) return '오늘'
    const diff = (new Date(d).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
    if (diff === 1) return '내일'
    return null
  }

  // 편집 가능: 오늘 + 미래
  const isEditable = (d: string) => d >= today

  const handleCellSaved = () => {
    setEditingCell(null)
    refresh()
    showSuccess('메시지가 저장되었습니다')
  }

  // 다이얼로그에서 백그라운드 생성 시작 시 호출
  const handleBgGenerateStarted = (pid: string, dt: string) => {
    setBgGenerating(prev => new Set(prev).add(`${pid}:${dt}`))
  }

  // 퀵 입력에서 개별 상품 백그라운드 생성
  const handleQuickGenerate = (productId: string, targetDate: string) => {
    const src = quickSources[productId]?.trim()
    if (!src) { showError('소스를 입력해주세요'); return }
    const key = `${productId}:${targetDate}`
    setBgGenerating(prev => new Set(prev).add(key))

    fetch('/api/ai/generate-with-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        date: targetDate,
        sources: [{ type: 'text', content: src }],
      }),
    }).then(async res => {
      if (!res.ok) {
        const d = await res.json().catch((err) => { console.error('Failed to parse error response:', err); return {} })
        showError(d.error || '생성 실패')
        setBgGenerating(prev => { const n = new Set(prev); n.delete(key); return n })
      }
    }).catch(() => {
      showError('네트워크 오류')
      setBgGenerating(prev => { const n = new Set(prev); n.delete(key); return n })
    })

    showSuccess(`${rtProducts.find(p => p.id === productId)?.sku_code} AI 생성 시작`)
  }

  // 전체 퀵 생성 — 소스가 입력된 상품 모두 백그라운드 생성
  const handleQuickGenerateAll = (targetDate: string) => {
    const entries = rtProducts.filter(p => quickSources[p.id]?.trim())
    if (entries.length === 0) { showError('소스를 입력한 상품이 없습니다'); return }
    for (const p of entries) {
      handleQuickGenerate(p.id, targetDate)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium">오늘의 메시지</span>
        <span className="text-xs text-muted-foreground font-mono">{today}</span>
        <StatusBadge
          status={doneCount === rtProducts.length ? 'success' : 'error'}
          size="xs"
        >
          {doneCount}/{rtProducts.length}
        </StatusBadge>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          )}
          내일 메시지 자동 생성
        </Button>
      </div>

      {genProgress && (
        <div className="bg-muted/50 border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              생성 중... ({genProgress.current}/{genProgress.total})
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {genProgress.sku}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${(genProgress.done.length / genProgress.total) * 100}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {genProgress.done.map(sku => (
              <StatusBadge key={sku} status="success" size="xs">
                {sku} ✓
              </StatusBadge>
            ))}
            {genProgress.sku && !genProgress.done.includes(genProgress.sku) && (
              <StatusBadge status="warning" size="xs" className="animate-pulse">
                {genProgress.sku} 생성 중...
              </StatusBadge>
            )}
          </div>
        </div>
      )}

      {/* --- 퀵 입력: 상품별 소스 + 백그라운드 AI 생성 --- */}
      <div className="border rounded-lg bg-card mb-4">
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">내일 ({tomorrowDate.slice(5)}) 메시지 소스 입력</span>
          </div>
          <Button
            size="sm"
            onClick={() => handleQuickGenerateAll(tomorrowDate)}
            disabled={bgGenerating.size > 0 && [...bgGenerating].some(k => k.endsWith(`:${tomorrowDate}`))}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            전체 AI 생성
          </Button>
        </div>
        <div className="grid gap-3 p-4" style={{ gridTemplateColumns: `repeat(${Math.min(rtProducts.length, 4)}, 1fr)` }}>
          {rtProducts.map(p => {
            const key = `${p.id}:${tomorrowDate}`
            const isBusy = bgGenerating.has(key)
            const hasTomorrowMsg = !!grid[p.id]?.[tomorrowDate]?.content
            return (
              <div key={p.id} className={cn(
                'border rounded-lg p-3 space-y-2 transition-colors',
                hasTomorrowMsg ? 'bg-muted/50 border-primary/30' : isBusy ? 'bg-primary/5 border-primary/20' : 'bg-background'
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {hasTomorrowMsg ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    ) : isBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="font-mono text-xs font-semibold">{p.sku_code}</span>
                  </div>
                  {hasTomorrowMsg && (
                    <StatusBadge status="success" size="xs">완료</StatusBadge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-1">{p.title}</p>
                {hasTomorrowMsg ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground line-clamp-3 whitespace-pre-wrap">{grid[p.id][tomorrowDate].content.slice(0, 150)}...</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-6 text-[11px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigator.clipboard.writeText(grid[p.id][tomorrowDate].content).then(() => {
                          setCopiedSku(p.id)
                          setTimeout(() => setCopiedSku(null), 1500)
                        })
                      }}
                    >
                      {copiedSku === p.id ? <><Check className="h-3 w-3 mr-1 text-primary" />복사됨</> : <><Copy className="h-3 w-3 mr-1" />메시지 복사</>}
                    </Button>
                  </div>
                ) : isBusy ? (
                  <div className="flex items-center gap-2 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs text-primary font-medium">AI 생성 중...</span>
                  </div>
                ) : (
                  <>
                    <Textarea
                      placeholder="기사 링크 또는 키워드..."
                      className="text-xs min-h-[60px] resize-none"
                      value={quickSources[p.id] || ''}
                      onChange={e => setQuickSources(s => ({ ...s, [p.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-7"
                      onClick={() => handleQuickGenerate(p.id, tomorrowDate)}
                      disabled={!quickSources[p.id]?.trim()}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI 생성
                    </Button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="max-h-[calc(100vh-300px)]">
        <Table className="border-collapse">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="text-left text-xs font-medium p-2 min-w-[180px] sticky left-0 bg-background z-20">상품</TableHead>
              {dates.map(d => {
                const label = getDateLabel(d)
                const isToday = d === today
                return (
                  <TableHead key={d} className={cn(
                    'text-center text-xs font-medium p-2',
                    isToday ? 'min-w-[500px] bg-primary/5' : isEditable(d) ? 'min-w-[500px] bg-muted/30' : 'min-w-[500px]',
                  )}>
                    <span className={cn(isToday && 'text-primary font-semibold')}>
                      {formatDate(d).short}
                    </span>
                    <span className="text-muted-foreground ml-1">
                      ({formatDate(d).day}){label && ` ${label}`}
                    </span>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rtProducts.map(p => {
              const hasTodayMsg = !!grid[p.id]?.[today]?.content
              return (
                <TableRow key={p.id} className={cn(!hasTodayMsg && 'bg-destructive/5')}>
                  {/* 상품명 */}
                  <TableCell className="p-2 align-top sticky left-0 bg-background z-10">
                    <div className="flex items-center gap-1">
                      {hasTodayMsg ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      )}
                      <span className="text-xs font-mono">{p.sku_code}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{p.title}</p>
                  </TableCell>
                  {/* 날짜별 셀 */}
                  {dates.map(d => {
                    const cell = grid[p.id]?.[d]
                    const content = cell?.content
                    const status = cell?.status
                    const editable = isEditable(d)
                    const isToday = d === today
                    const key = `${p.id}:${d}`
                    return (
                      <TableCell key={d} className={cn(
                        'p-2 align-top',
                        isToday ? 'bg-primary/5' : editable ? 'bg-muted/30' : '',
                      )}>
                        {content ? (
                          <div
                            className={cn('cursor-pointer hover:bg-muted/50 rounded p-1 -m-1 transition-colors', editable && 'hover:ring-1 hover:ring-border')}
                            onClick={() => editable && setEditingCell({ productId: p.id, sku: p.sku_code, title: p.title, date: d, cell })}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              {status === 'approved' ? (
                                <StatusBadge status="success" size="xs">승인됨</StatusBadge>
                              ) : status === 'draft' ? (
                                <StatusBadge status="warning" size="xs">초안</StatusBadge>
                              ) : null}
                            </div>
                            <p className={cn(
                              'whitespace-pre-wrap leading-relaxed',
                              isToday ? 'text-[12px]' : 'text-[11px] text-muted-foreground'
                            )}>{content}</p>
                          </div>
                        ) : editable ? (
                          <div className="space-y-1.5">
                            {bgGenerating.has(key) ? (
                              <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/20 bg-primary/5 animate-pulse">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                <span className="text-xs text-primary font-medium">AI 생성 중...</span>
                              </div>
                            ) : (
                              <Textarea
                                placeholder={`${formatDate(d).short} 메시지 직접 입력...`}
                                className={cn('text-[12px] leading-relaxed', isToday ? 'min-h-[100px]' : 'min-h-[60px]')}
                                value={drafts[key] || ''}
                                onChange={(e) => setDrafts(dr => ({ ...dr, [key]: e.target.value }))}
                              />
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {(drafts[key] || '').length}자
                              </span>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7"
                                  onClick={() => setEditingCell({ productId: p.id, sku: p.sku_code, title: p.title, date: d })}
                                  disabled={bgGenerating.has(key)}
                                >
                                  {bgGenerating.has(key) ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-3 w-3 mr-1" />
                                  )}
                                  AI
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7"
                                  onClick={() => handleSave(p.id, d)}
                                  disabled={!drafts[key]?.trim() || saving[key]}
                                >
                                  {saving[key] ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <Save className="h-3 w-3 mr-1" />
                                  )}
                                  저장
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* 소스 기반 생성 다이얼로그 */}
      {editingCell && (
        <SourceGenerateDialog
          productId={editingCell.productId}
          productSku={editingCell.sku}
          date={editingCell.date}
          existingContent={editingCell.cell?.content}
          existingStatus={editingCell.cell?.status}
          existingId={editingCell.cell?.id}
          onClose={() => setEditingCell(null)}
          onSaved={handleCellSaved}
          onBgGenerate={() => handleBgGenerateStarted(editingCell.productId, editingCell.date)}
        />
      )}

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
                    {m.image_path ? (
                      <div className="flex items-center gap-2 flex-1">
                        <img
                          src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/messages/${m.image_path}`}
                          alt={m.image_path}
                          className="w-10 h-10 object-cover rounded border"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <span className="text-xs text-muted-foreground">{m.image_path}</span>
                      </div>
                    ) : (
                      <p className="text-[13px] text-foreground line-clamp-2 flex-1 leading-relaxed">{m.content}</p>
                    )}
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// --- AI 프롬프트 관리 ---
function PromptManagementPanel() {
  const [products, setProducts] = useState<Product[]>([])
  const [prompts, setPrompts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [searchPrompt, setSearchPrompt] = useState('')
  const [generationPrompt, setGenerationPrompt] = useState('')
  const [additionalPrompt, setAdditionalPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast, showSuccess, showError, clearToast } = useToast()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [prodRes, promptRes] = await Promise.all([
        fetch('/api/products/list'),
        fetch('/api/ai/prompts'),
      ])
      if (!prodRes.ok) throw new Error('상품 목록 로드 실패')
      if (!promptRes.ok) throw new Error('프롬프트 로드 실패')
      const prodData = await prodRes.json()
      const promptData = await promptRes.json()
      const rtProducts = (prodData || []).filter((p: any) => p.message_type === 'realtime')
      setProducts(rtProducts)
      setPrompts(promptData.prompts || [])
      if (rtProducts.length > 0 && !selectedProduct) {
        setSelectedProduct(rtProducts[0].id)
      }
    } catch {
      showError('데이터를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [showError, selectedProduct])

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedProduct) return
    const prompt = prompts.find((p: any) => p.product_id === selectedProduct)
    setSearchPrompt(prompt?.search_prompt || '')
    setGenerationPrompt(prompt?.generation_prompt || '')
    setAdditionalPrompt(prompt?.additional_prompt || '')
  }, [selectedProduct, prompts])

  const handleSave = async () => {
    if (!selectedProduct) return
    setSaving(true)
    try {
      const res = await fetch('/api/ai/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct,
          search_prompt: searchPrompt,
          generation_prompt: generationPrompt,
          additional_prompt: additionalPrompt,
        }),
      })
      if (!res.ok) throw new Error('저장 실패')
      showSuccess('프롬프트가 저장되었습니다')
      setPrompts(prev => {
        const existing = prev.findIndex((p: any) => p.product_id === selectedProduct)
        const updated = { product_id: selectedProduct, search_prompt: searchPrompt, generation_prompt: generationPrompt, additional_prompt: additionalPrompt }
        if (existing >= 0) {
          const next = [...prev]
          next[existing] = { ...next[existing], ...updated }
          return next
        }
        return [...prev, updated]
      })
    } catch {
      showError('프롬프트 저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="실시간 상품이 없습니다"
        description="프롬프트를 설정할 실시간(realtime) 상품이 없습니다"
      />
    )
  }

  return (
    <div className="flex gap-4 pt-4">
      <Card className="w-64 shrink-0 overflow-hidden">
        <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
          {products.map((p) => {
            const hasPrompt = prompts.some((pr: any) => pr.product_id === p.id)
            return (
              <Button
                key={p.id}
                variant="ghost"
                onClick={() => setSelectedProduct(p.id)}
                className={cn(
                  'w-full text-left justify-start h-auto px-4 py-3 text-sm rounded-none border-b last:border-b-0 hover:bg-muted/50',
                  selectedProduct === p.id && 'bg-accent text-accent-foreground font-medium border-l-2 border-l-primary'
                )}
              >
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.sku_code}</span>
                    {hasPrompt && (
                      <StatusBadge status="success" className="text-[10px]">설정됨</StatusBadge>
                    )}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed">{p.title}</div>
                </div>
              </Button>
            )
          })}
        </div>
      </Card>

      <div className="flex-1 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">기사 검색 프롬프트</Label>
              <p className="text-xs text-muted-foreground">어디서, 어떻게, 어떤 뉴스를 찾을지 지시합니다. 잘 변하지 않는 고정 지침입니다.</p>
              <Textarea
                value={searchPrompt}
                onChange={e => setSearchPrompt(e.target.value)}
                rows={16}
                className="font-mono text-sm"
                placeholder="검색 프롬프트를 입력하세요..."
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">메시지 작성 프롬프트</Label>
              <p className="text-xs text-muted-foreground">메시지 포맷, 톤, 규칙 등을 지시합니다. 잘 변하지 않는 고정 지침입니다.</p>
              <Textarea
                value={generationPrompt}
                onChange={e => setGenerationPrompt(e.target.value)}
                rows={20}
                className="font-mono text-sm"
                placeholder="생성 프롬프트를 입력하세요..."
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">추가 지시 (선택)</Label>
              <p className="text-xs text-muted-foreground">매번 메시지 생성 시 추가로 전달할 내용입니다. 예: &quot;오늘은 BTS 관련 뉴스 제외&quot;, &quot;환율 주제로 써줘&quot;</p>
              <Textarea
                value={additionalPrompt}
                onChange={e => setAdditionalPrompt(e.target.value)}
                rows={3}
                className="font-mono text-sm"
                placeholder="추가로 전달할 내용이 있으면 입력하세요..."
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                저장
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}

// --- 메인 탭 ---
export function MessagesTab() {
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    fetch('/api/products/list').then(r => r.json()).then(d => setProducts(d || [])).catch((err) => { console.error('Failed to load products:', err) })
  }, [])

  return (
    <div>
      <PageHeader title="메시지 관리" description="고정/실시간 메시지와 알림 템플릿을 관리합니다" className="mb-6" />

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">
            <CalendarCheck className="h-3.5 w-3.5 mr-1.5" />
            오늘 메시지
          </TabsTrigger>
          <TabsTrigger value="realtime">
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            실시간 메시지
          </TabsTrigger>
          <TabsTrigger value="fixed">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            고정 메시지
          </TabsTrigger>
          <TabsTrigger value="notices">
            <Bell className="h-3.5 w-3.5 mr-1.5" />
            알림 템플릿
          </TabsTrigger>
          <TabsTrigger value="prompts">
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />
            AI 프롬프트
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today">
          <TodayMessagesPanel products={products} />
        </TabsContent>
        <TabsContent value="realtime">
          <RealtimeMessagesPanel products={products} />
        </TabsContent>
        <TabsContent value="fixed">
          <FixedMessagesPanel products={products} />
        </TabsContent>
        <TabsContent value="notices">
          <NoticesPanel products={products} />
        </TabsContent>
        <TabsContent value="prompts">
          <PromptManagementPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
