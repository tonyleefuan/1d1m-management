'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { CS_CATEGORY_LABELS, CS_CATEGORY_GUIDES } from '@/lib/constants'

interface Sub {
  id: string
  product: { title: string } | null
  current_day: number
  computed_status: string
  d_day: number | null
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

  // 카테고리 변경 시 가이드 상태 초기화
  const handleCategoryChange = (cat: string) => {
    setFormCategory(cat)
    setGuideChecks({})
    setGuideSelects({})
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
      const lines = guide.select.map(s => {
        const selected = s.options.find(o => o.value === guideSelects[s.key])
        return `- ${s.label}: ${selected?.label || '미선택'}`
      })
      parts.push(`[선택 정보]\n${lines.join('\n')}`)
    }

    if (parts.length > 0) {
      return `${parts.join('\n')}\n\n[문의 내용]\n${formContent.trim()}`
    }
    return formContent.trim()
  }

  const handleSubmitInquiry = async () => {
    setFormError('')
    if (!formCategory) { setFormError('카테고리를 선택해 주세요.'); return }
    if (!formContent.trim()) { setFormError('내용을 입력해 주세요.'); return }

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
        setFormError('문의 등록 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }

      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || '등록에 실패했습니다.')
        return
      }

      setShowDialog(false)
      setFormCategory('')
      setFormSubId('')
      setFormContent('')
      setGuideChecks({})
      setGuideSelects({})
      router.push(`/cs/inquiry/${data.data.id}`)
    } catch {
      setFormError('서버 연결에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {customerName && <p className="text-sm text-muted-foreground mb-0.5">{customerName}님</p>}
          <h1 className="text-lg font-semibold">구독 현황</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs text-muted-foreground">
          로그아웃
        </Button>
      </div>

      {/* Subscriptions */}
      <Card>
        <CardContent className="p-0">
          {subs.length === 0 ? (
            <div className="p-6">
              <EmptyState title="구독 내역이 없습니다" />
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
        <h2 className="text-lg font-semibold">문의 내역</h2>
        <Button size="sm" onClick={() => setShowDialog(true)}>+ 새 문의</Button>
      </div>

      {inquiries.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="문의 내역이 없습니다" description="궁금한 점이 있으시면 새 문의를 등록해 주세요." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {inquiries.map(inq => {
            const ist = INQ_STATUS_MAP[inq.status] || INQ_STATUS_MAP.pending
            return (
              <Card
                key={inq.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 문의 작성</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>카테고리</Label>
              <Select value={formCategory} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CS_CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 카테고리별 가이드 질문 */}
            {formCategory && CS_CATEGORY_GUIDES[formCategory] && (() => {
              const guide = CS_CATEGORY_GUIDES[formCategory]
              return (
                <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                  {guide.select?.map(s => (
                    <div key={s.key} className="space-y-1.5">
                      <Label className="text-sm">{s.label}</Label>
                      <Select value={guideSelects[s.key] || ''} onValueChange={v => setGuideSelects(prev => ({ ...prev, [s.key]: v }))}>
                        <SelectTrigger>
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
                  {formCategory === 'message_not_received' && (
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
                        <p className="text-xs text-muted-foreground ml-5">연락처로 카카오톡 친구 추가 허용이 꺼져 있다면, 아래 문의 내용에 카카오톡 ID를 함께 적어 주세요.</p>
                        <li>해당 카카오톡 채팅으로 성함과 전화번호 뒷 4자리를 보내 주세요</li>
                        <p className="text-xs text-muted-foreground ml-5">예) 홍길동 / 1234</p>
                      </ol>
                      <div className="border-t border-border pt-3 space-y-2">
                        <p className="text-xs font-medium text-foreground">아래 항목을 완료하셨는지 확인해 주세요</p>
                        {guide.checklist?.map(c => (
                          <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={!!guideChecks[c.key]}
                              onCheckedChange={(checked) => setGuideChecks(prev => ({ ...prev, [c.key]: !!checked }))}
                            />
                            <span className="text-sm">{c.label}</span>
                          </label>
                        ))}
                      </div>
                      {guide.hint && (
                        <p className="text-xs text-muted-foreground">{guide.hint}</p>
                      )}
                    </div>
                  )}
                  {formCategory !== 'message_not_received' && (
                    <>
                      {guide.checklist?.map(c => (
                        <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={!!guideChecks[c.key]}
                            onCheckedChange={(checked) => setGuideChecks(prev => ({ ...prev, [c.key]: !!checked }))}
                          />
                          <span className="text-sm">{c.label}</span>
                        </label>
                      ))}
                      {guide.hint && (
                        <p className="text-xs text-muted-foreground">{guide.hint}</p>
                      )}
                    </>
                  )}
                </div>
              )
            })()}

            {subs.length >= 1 && (
              <div className="space-y-2">
                <Label>관련 구독 (선택)</Label>
                <Select value={formSubId} onValueChange={setFormSubId}>
                  <SelectTrigger>
                    <SelectValue placeholder="구독 선택 (선택사항)" />
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

            <div className="space-y-2">
              <Label>내용</Label>
              <Textarea
                placeholder="문의 내용을 입력해 주세요"
                rows={4}
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                disabled={submitting}
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={submitting}>
              취소
            </Button>
            <Button onClick={handleSubmitInquiry} disabled={submitting}>
              {submitting ? '등록 중...' : '문의 등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
