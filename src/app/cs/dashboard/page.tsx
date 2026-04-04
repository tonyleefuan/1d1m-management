'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { CS_CATEGORIES, CS_CATEGORY_LABELS, CS_CATEGORY_GUIDES } from '@/lib/constants'

interface Sub {
  id: string
  product_id: string
  product: { title: string } | null
  duration_days: number
  current_day: number
  computed_status: string
  d_day: number | null
}

interface ChangeableProduct {
  id: string
  title: string
  sku_code: string
}

interface Inquiry {
  id: string
  category: string
  title: string
  status: string
  reply_count: number
  created_at: string
}

const STATUS_MAP: Record<string, { status: 'success' | 'warning' | 'info' | 'neutral' | 'error'; label: string }> = {
  active: { status: 'success', label: '발송중' },
  pending: { status: 'info', label: '대기' },
  paused: { status: 'warning', label: '일시정지' },
  completed: { status: 'neutral', label: '만료' },
  cancelled: { status: 'error', label: '취소' },
}

const INQ_STATUS_MAP: Record<string, { status: 'success' | 'warning' | 'info' | 'neutral'; label: string }> = {
  pending: { status: 'info', label: '처리중' },
  ai_answered: { status: 'success', label: '답변완료' },
  escalated: { status: 'warning', label: '확인 중' },
  admin_answered: { status: 'success', label: '답변완료' },
  dismissed: { status: 'neutral', label: '종료' },
}

export default function CSDashboard() {
  const router = useRouter()
  const [subs, setSubs] = useState<Sub[]>([])
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [customerName, setCustomerName] = useState('')
  const [defaultPhone, setDefaultPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [formCategory, setFormCategory] = useState('')
  const [formSubId, setFormSubId] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [guideChecks, setGuideChecks] = useState<Record<string, boolean>>({})
  const [guideSelects, setGuideSelects] = useState<Record<string, string>>({})
  const [guideDates, setGuideDates] = useState<Record<string, string>>({})
  const [changeableProducts, setChangeableProducts] = useState<ChangeableProduct[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(false)

  // 카테고리 변경 시 가이드 상태 초기화
  const handleCategoryChange = (cat: string) => {
    setFormCategory(cat)
    setGuideChecks({})
    setGuideSelects({})
    setGuideDates({})
    setChangeableProducts([])
    setSelectedProductId('')
  }

  const fetchData = useCallback(async () => {
    try {
      const [subsRes, inqRes] = await Promise.all([
        fetch('/api/cs/subscriptions'),
        fetch('/api/cs/inquiries'),
      ])

      if (subsRes.status === 401 || inqRes.status === 401) {
        router.push('/cs')
        return
      }

      const subsData = await subsRes.json()
      const inqData = await inqRes.json()
      setCustomerName(subsData.customerName || '')
      setDefaultPhone(subsData.defaultPhone || '')
      setSubs(subsData.data || [])
      setInquiries(inqData.data || [])
    } catch {
      router.push('/cs')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    // Get customer name from cookie-decoded session (or just show from subs)
    fetchData()
  }, [fetchData])

  const handleLogout = async () => {
    await fetch('/api/cs/auth', { method: 'DELETE' })
    router.push('/cs')
  }

  // 상품 변경: 선택한 구독의 동일 가격 상품 목록 조회
  const fetchChangeableProducts = async (subId: string) => {
    setChangeableProducts([])
    setSelectedProductId('')
    if (!subId) return
    setLoadingProducts(true)
    try {
      const res = await fetch(`/api/cs/products?subscription_id=${subId}`)
      if (res.ok) {
        const json = await res.json()
        setChangeableProducts(json.data || [])
      }
    } catch { /* ignore */ }
    setLoadingProducts(false)
  }

  // 가이드 응답을 content 앞에 구조화하여 합치기
  const buildContent = () => {
    const guide = CS_CATEGORY_GUIDES[formCategory]
    if (!guide) return formContent.trim()

    const parts: string[] = []

    if (guide.checklist?.length) {
      const lines = guide.checklist.map(c =>
        `- ${c.label}: ${guideChecks[c.key] ? '완료' : '미완료'}`
      )
      parts.push(`[사전 확인]\n${lines.join('\n')}`)
    }

    if (guide.select?.length) {
      // cancel_refund에서 card_over_30_days는 카드 결제 시에만 포함
      const visibleSelects = guide.select.filter(s => {
        if (s.key === 'card_over_30_days') return guideSelects['payment_method'] === 'card'
        return true
      })
      const lines = visibleSelects.map(s => {
        const selected = s.options.find(o => o.value === guideSelects[s.key])
        return `- ${s.label}: ${selected?.label || '미선택'}`
      })
      parts.push(`[선택 정보]\n${lines.join('\n')}`)
    }

    // 날짜 정보
    if (guide.date?.length) {
      const lines = guide.date.map(d =>
        `- ${d.label}: ${guideDates[d.key] || '미입력'}`
      )
      parts.push(`[날짜 정보]\n${lines.join('\n')}`)
    }

    // 계좌 정보 (계좌이체 또는 카드 30일 초과)
    const needBank = formCategory === 'cancel_refund' && (
      guideSelects['payment_method'] === 'bank_transfer' ||
      (guideSelects['payment_method'] === 'card' && guideSelects['card_over_30_days'] === 'yes')
    )
    if (needBank) {
      const bankLines = [
        `- 은행명: ${guideSelects['bank_name'] || '미입력'}`,
        `- 계좌번호: ${guideSelects['account_number'] || '미입력'}`,
        `- 예금주: ${guideSelects['account_holder'] || '미입력'}`,
      ]
      parts.push(`[환불 계좌]\n${bankLines.join('\n')}`)
    }

    // 상품 변경 선택
    if (formCategory === 'product_change' && selectedProductId) {
      const prod = changeableProducts.find(p => p.id === selectedProductId)
      if (prod) {
        parts.push(`[상품 변경]\n- 변경 희망 상품: ${prod.title}`)
      }
    }

    if (parts.length > 0) {
      return `${parts.join('\n')}\n\n[문의 내용]\n${formContent.trim()}`
    }
    return formContent.trim()
  }

  const handleSubmitInquiry = async () => {
    setFormError('')
    if (!formCategory) { setFormError('문의 유형을 선택해 주세요.'); return }
    if (!formContent.trim()) { setFormError('문의 내용을 입력해 주세요.'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/cs/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: formCategory,
          content: buildContent(),
          subscriptionId: formSubId || null,
        }),
      })

      if (res.status === 429) {
        setFormError('짧은 시간 내 너무 많은 문의를 등록하셨습니다. 잠시 후 다시 시도해 주세요.')
        return
      }

      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || '문의 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }

      setShowDialog(false)
      setFormCategory('')
      setFormSubId('')
      setFormContent('')
      setGuideChecks({})
      setGuideSelects({})
      setGuideDates({})
      setChangeableProducts([])
      setSelectedProductId('')
      router.push(`/cs/inquiry/${data.data.id}`)
    } catch {
      setFormError('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">잠시만 기다려 주세요...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {customerName && <p className="text-sm text-muted-foreground mb-0.5">{customerName}님, 안녕하세요</p>}
          <h1 className="text-lg font-semibold">내 구독 현황</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs text-muted-foreground min-h-[44px]">
          로그아웃
        </Button>
      </div>

      {/* Subscriptions */}
      <Card>
        <CardContent className="p-0">
          {subs.length === 0 ? (
            <div className="p-6">
              <EmptyState title="현재 이용 중인 구독이 없습니다" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {subs.map(sub => {
                const st = STATUS_MAP[sub.computed_status] || STATUS_MAP.pending
                return (
                  <div key={sub.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{sub.product?.title || '상품'}</p>
                      <p className="text-xs text-muted-foreground">
                        {sub.current_day}일차
                        {sub.d_day != null && ` · D-${sub.d_day}`}
                      </p>
                    </div>
                    <StatusBadge status={st.status} size="xs">{st.label}</StatusBadge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inquiries */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">내 문의 내역</h2>
        <Button size="sm" onClick={() => setShowDialog(true)} className="min-h-[44px]">+ 새 문의</Button>
      </div>

      {inquiries.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="아직 등록된 문의가 없습니다" description="궁금하신 점이 있으시면 언제든지 새 문의를 남겨 주세요." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {inquiries.map(inq => {
            const ist = INQ_STATUS_MAP[inq.status] || INQ_STATUS_MAP.pending
            return (
              <Card
                key={inq.id}
                className="cursor-pointer hover:bg-muted/50 active:bg-muted/70 transition-colors"
                onClick={() => router.push(`/cs/inquiry/${inq.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {CS_CATEGORY_LABELS[inq.category] || inq.category}
                        </span>
                        <StatusBadge status={ist.status} size="xs">{ist.label}</StatusBadge>
                      </div>
                      <p className="text-sm font-medium truncate">{CS_CATEGORY_LABELS[inq.category] || inq.category} 문의</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(inq.created_at).toLocaleDateString('ko-KR')}
                        {inq.reply_count > 0 && ` · 답변 ${inq.reply_count}건`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* New Inquiry Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md max-h-[85dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle>새 문의 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-y-auto -mx-6 px-6">
            <div className="space-y-2">
              <Label>어떤 도움이 필요하신가요?</Label>
              <Select value={formCategory} onValueChange={handleCategoryChange}>
                <SelectTrigger className="h-11 text-base">
                  <SelectValue placeholder="문의 유형을 선택해 주세요" />
                </SelectTrigger>
                <SelectContent>
                  {CS_CATEGORIES.map(k => (
                    <SelectItem key={k} value={k}>{CS_CATEGORY_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 카테고리별 가이드 질문 */}
            {formCategory && CS_CATEGORY_GUIDES[formCategory] && (() => {
              const guide = CS_CATEGORY_GUIDES[formCategory]
              // cancel_refund: 카드 결제 시에만 30일 초과 질문 표시
              const visibleSelects = (guide.select || []).filter(s => {
                if (s.key === 'card_over_30_days') return guideSelects['payment_method'] === 'card'
                return true
              })
              // 계좌 입력 필요 조건: 계좌이체 또는 카드 30일 초과
              const needBank = formCategory === 'cancel_refund' && (
                guideSelects['payment_method'] === 'bank_transfer' ||
                (guideSelects['payment_method'] === 'card' && guideSelects['card_over_30_days'] === 'yes')
              )
              return (
                <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                  {/* Select 필드 */}
                  {visibleSelects.map(s => (
                    <div key={s.key} className="space-y-1.5">
                      <Label className="text-sm">{s.label}</Label>
                      <Select value={guideSelects[s.key] || ''} onValueChange={v => setGuideSelects(prev => ({ ...prev, [s.key]: v }))}>
                        <SelectTrigger className="h-11 text-base">
                          <SelectValue placeholder="선택해 주세요" />
                        </SelectTrigger>
                        <SelectContent>
                          {s.options.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}

                  {/* 날짜 필드 (message_stopped 등) */}
                  {guide.date?.map(d => (
                    <div key={d.key} className="space-y-1.5">
                      <Label className="text-sm">{d.label}</Label>
                      <Input
                        type="date"
                        value={guideDates[d.key] || ''}
                        onChange={e => setGuideDates(prev => ({ ...prev, [d.key]: e.target.value }))}
                        className="w-full h-11 text-base"
                      />
                    </div>
                  ))}

                  {/* message_never_received 전용 안내 */}
                  {formCategory === 'message_never_received' && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">연락처 등록 방법</p>
                      <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                        <li>아래 번호를 휴대폰 연락처에 새로 저장해 주세요</li>
                        {defaultPhone && (
                          <p className="font-mono font-semibold text-foreground ml-5">
                            {defaultPhone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')}
                          </p>
                        )}
                        <li>카카오톡에서 위 번호를 친구 추가해 주세요</li>
                        <li>해당 카카오톡 채팅으로 성함과 전화번호 뒷 4자리를 보내 주세요</li>
                        <p className="text-xs text-muted-foreground ml-5">예) 홍길동/1234</p>
                      </ol>
                      <div className="rounded-md bg-muted/50 p-2.5 space-y-1.5">
                        <p className="text-xs text-muted-foreground">
                          1~3을 완료하셨는데도 메시지가 수신되지 않는다면, 전화번호로 친구 추가 허용이 꺼져 있어 저희가 먼저 친구 추가가 어려운 상태일 수 있습니다.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          이 경우 카카오톡 ID를 알려주시면 감사하겠습니다. 카카오톡 앱 프로필 탭 상단 우측의 친구 추가 버튼을 누르신 뒤 카카오톡 ID를 누르면 &apos;내 아이디&apos;가 조회됩니다.
                        </p>
                      </div>
                      <div className="border-t border-border pt-3 space-y-2">
                        <p className="text-xs font-medium text-foreground">아래 항목을 완료하셨는지 확인해 주세요</p>
                        {guide.checklist?.map(c => (
                          <label key={c.key} className="flex items-center gap-2 cursor-pointer min-h-[44px] py-1">
                            <Checkbox
                              checked={!!guideChecks[c.key]}
                              onCheckedChange={(checked) => setGuideChecks(prev => ({ ...prev, [c.key]: !!checked }))}
                              className="h-5 w-5"
                            />
                            <span className="text-sm">{c.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 일반 체크리스트 (message_never_received 외) */}
                  {formCategory !== 'message_never_received' && guide.checklist?.map(c => (
                    <label key={c.key} className="flex items-center gap-2 cursor-pointer min-h-[44px] py-1">
                      <Checkbox
                        checked={!!guideChecks[c.key]}
                        onCheckedChange={(checked) => setGuideChecks(prev => ({ ...prev, [c.key]: !!checked }))}
                        className="h-5 w-5"
                      />
                      <span className="text-sm">{c.label}</span>
                    </label>
                  ))}

                  {/* 카드 30일 초과 안내 + 계좌 입력 */}
                  {formCategory === 'cancel_refund' && guideSelects['payment_method'] === 'card' && guideSelects['card_over_30_days'] === 'yes' && (
                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="text-xs text-muted-foreground">
                        결제일로부터 30일이 경과하여 PG사를 통한 카드 취소가 어려운 점 양해 부탁드립니다. 환불 받으실 계좌 정보를 아래에 입력해 주세요.
                      </p>
                      <Input
                        placeholder="은행명 (예: 국민은행)"
                        value={guideSelects['bank_name'] || ''}
                        onChange={e => setGuideSelects(prev => ({ ...prev, bank_name: e.target.value }))}
                        className="h-11 text-base"
                      />
                      <Input
                        placeholder="계좌번호"
                        value={guideSelects['account_number'] || ''}
                        onChange={e => setGuideSelects(prev => ({ ...prev, account_number: e.target.value }))}
                        className="h-11 text-base"
                      />
                      <Input
                        placeholder="예금주"
                        value={guideSelects['account_holder'] || ''}
                        onChange={e => setGuideSelects(prev => ({ ...prev, account_holder: e.target.value }))}
                        className="h-11 text-base"
                      />
                    </div>
                  )}

                  {/* 계좌이체 선택 시 환불 계좌 입력 */}
                  {formCategory === 'cancel_refund' && guideSelects['payment_method'] === 'bank_transfer' && (
                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="text-xs font-medium text-foreground">환불 받으실 계좌 정보를 입력해 주세요</p>
                      <Input
                        placeholder="은행명 (예: 국민은행)"
                        value={guideSelects['bank_name'] || ''}
                        onChange={e => setGuideSelects(prev => ({ ...prev, bank_name: e.target.value }))}
                        className="h-11 text-base"
                      />
                      <Input
                        placeholder="계좌번호"
                        value={guideSelects['account_number'] || ''}
                        onChange={e => setGuideSelects(prev => ({ ...prev, account_number: e.target.value }))}
                        className="h-11 text-base"
                      />
                      <Input
                        placeholder="예금주"
                        value={guideSelects['account_holder'] || ''}
                        onChange={e => setGuideSelects(prev => ({ ...prev, account_holder: e.target.value }))}
                        className="h-11 text-base"
                      />
                    </div>
                  )}

                  {/* 힌트 */}
                  {guide.hint && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{guide.hint}</p>
                  )}
                </div>
              )
            })()}

            {/* 관련 구독 선택 */}
            {subs.length >= 1 && (
              <div className="space-y-2">
                <Label>{formCategory === 'product_change' ? '변경할 구독' : '관련 구독 (선택)'}</Label>
                <Select
                  value={formSubId}
                  onValueChange={v => {
                    setFormSubId(v)
                    if (formCategory === 'product_change') fetchChangeableProducts(v)
                  }}
                >
                  <SelectTrigger className="h-11 text-base">
                    <SelectValue placeholder="관련 구독을 선택해 주세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {subs.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.product?.title || '상품'} ({s.current_day}일차)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 상품 변경: 동일 가격 상품 선택 */}
            {formCategory === 'product_change' && formSubId && (
              <div className="space-y-2">
                <Label>변경 희망 상품</Label>
                {loadingProducts ? (
                  <p className="text-xs text-muted-foreground">변경 가능한 상품을 확인하고 있습니다...</p>
                ) : changeableProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">현재 동일 가격대의 변경 가능한 상품이 없습니다. 추가 문의가 필요하시면 내용을 남겨 주세요.</p>
                ) : (
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue placeholder="변경을 원하시는 상품을 선택해 주세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {changeableProducts.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>문의 내용</Label>
              <Textarea
                placeholder={CS_CATEGORY_GUIDES[formCategory]?.hint ? '추가로 알려주실 내용이 있으시면 적어 주세요' : '궁금하신 점이나 도움이 필요하신 내용을 자유롭게 적어 주세요'}
                rows={4}
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                disabled={submitting}
                className="text-base"
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={submitting} className="min-h-[44px]">
              취소
            </Button>
            <Button onClick={handleSubmitInquiry} disabled={submitting} className="min-h-[44px]">
              {submitting ? '등록 중...' : '문의 등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
