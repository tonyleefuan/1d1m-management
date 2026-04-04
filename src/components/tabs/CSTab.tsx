'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Spinner } from '@/components/ui/spinner'
import { StatusBadge } from '@/components/ui/status-badge'
import type { StatusType } from '@/components/ui/status-badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/lib/use-toast'
import { Toast } from '@/components/ui/Toast'
import {
  CS_CATEGORY_LABELS,
  REFUND_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

interface InquiryRow {
  id: string
  category: string
  title: string
  status: string
  reply_count: number
  created_at: string
  customer?: { name: string; kakao_friend_name: string; phone_last4: string }
}

interface Reply {
  id: string
  author_type: string
  author_name: string | null
  content: string
  created_at: string
}

interface InquiryDetail {
  id: string
  category: string
  title: string
  content: string
  status: string
  created_at: string
  customer?: { name: string; kakao_friend_name: string }
  subscription?: { product: { title: string }; last_sent_day: number; duration_days: number }
  cs_replies: Reply[]
}

interface Policy {
  id: string
  category: string
  title: string
  content: string
  ai_instruction: string | null
  updated_at: string
}

interface RefundRow {
  id: string
  status: string
  payment_method: string
  paid_amount: number
  refund_amount: number
  is_full_refund: boolean
  used_days: number
  total_days: number
  daily_rate: number
  used_amount: number
  penalty_amount: number
  needs_account_info: boolean
  bank_name: string | null
  account_number: string | null
  account_holder: string | null
  admin_note: string | null
  reject_reason: string | null
  created_at: string
  processed_at: string | null
  customer?: { id: string; name: string; kakao_friend_name: string; phone_last4: string }
  subscription?: { id: string; last_sent_day: number; duration_days: number; product: { id: string; title: string } }
  inquiry?: { id: string; title: string; status: string }
}

type Section = 'escalated' | 'ai_answered' | 'refunds' | 'policies'

const REFUND_STATUS_MAP: Record<string, StatusType> = {
  pending: 'warning',
  approved: 'info',
  completed: 'success',
  rejected: 'error',
}

export function CSTab() {
  const { toast, showSuccess, showError, clearToast } = useToast()
  const [section, setSection] = useState<Section>('escalated')
  const [inquiries, setInquiries] = useState<InquiryRow[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [refunds, setRefunds] = useState<RefundRow[]>([])
  const [loading, setLoading] = useState(true)
  const [escalatedCount, setEscalatedCount] = useState(0)
  const [aiCount, setAiCount] = useState(0)
  const [refundPendingCount, setRefundPendingCount] = useState(0)

  // Policy chat state
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; actions?: any[] }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  // Detail dialog state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<InquiryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Policy edit dialog
  const [editPolicy, setEditPolicy] = useState<Policy | null>(null)
  const [policyContent, setPolicyContent] = useState('')
  const [policyInstruction, setPolicyInstruction] = useState('')
  const [savingPolicy, setSavingPolicy] = useState(false)

  // Refund detail dialog
  const [selectedRefund, setSelectedRefund] = useState<RefundRow | null>(null)
  const [refundNote, setRefundNote] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [refundSubmitting, setRefundSubmitting] = useState(false)

  const fetchInquiries = useCallback(async (status: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/cs/inquiries?status=${status}`)
      if (!res.ok) throw new Error('로드 실패')
      const data = await res.json()
      setInquiries(data.data || [])
    } catch (err: any) {
      showError(err.message || '문의 목록 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [showError])

  const fetchRefunds = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/cs/refunds')
      if (!res.ok) throw new Error('로드 실패')
      const data = await res.json()
      setRefunds(data.data || [])
    } catch (err: any) {
      showError(err.message || '환불 목록 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [showError])

  const fetchCounts = useCallback(async () => {
    const [escRes, aiRes, refundRes] = await Promise.all([
      fetch('/api/admin/cs/inquiries?status=escalated'),
      fetch('/api/admin/cs/inquiries?status=ai_answered'),
      fetch('/api/admin/cs/refunds?status=pending'),
    ])
    const escData = await escRes.json()
    const aiData = await aiRes.json()
    const refundData = await refundRes.json()
    setEscalatedCount(escData.data?.length || 0)
    setAiCount(aiData.unreadAiCount ?? aiData.data?.length ?? 0)
    setRefundPendingCount(refundData.data?.length || 0)
  }, [])

  const fetchPolicies = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/cs/policies')
      if (!res.ok) throw new Error('로드 실패')
      const data = await res.json()
      setPolicies(data.data || [])
    } catch (err: any) {
      showError(err.message || '정책 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [showError])

  useEffect(() => {
    fetchCounts()
  }, [fetchCounts])

  useEffect(() => {
    if (section === 'policies') {
      fetchPolicies()
    } else if (section === 'refunds') {
      fetchRefunds()
    } else {
      fetchInquiries(section)
      // AI 응대 탭 진입 시 읽음 처리
      if (section === 'ai_answered') {
        fetch('/api/admin/cs/inquiries', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mark_ai_read' }),
        }).then(() => setAiCount(0))
      }
    }
  }, [section, fetchInquiries, fetchPolicies, fetchRefunds])

  const openDetail = async (id: string) => {
    setSelectedId(id)
    setDetailLoading(true)
    setReplyContent('')
    try {
      const res = await fetch(`/api/admin/cs/inquiries/${id}`)
      if (!res.ok) throw new Error('로드 실패')
      const data = await res.json()
      setDetail(data.data)
    } catch (err: any) {
      showError(err.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleAdminReply = async () => {
    if (!replyContent.trim() || !selectedId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/cs/inquiries/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reply', content: replyContent.trim() }),
      })
      if (!res.ok) throw new Error('답변 등록 실패')
      showSuccess('답변이 등록되었습니다.')
      setSelectedId(null)
      setDetail(null)
      fetchInquiries(section)
      fetchCounts()
    } catch (err: any) {
      showError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDismiss = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/cs/inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
      if (!res.ok) throw new Error('처리 실패')
      showSuccess('문의가 스킵되었습니다.')
      fetchInquiries(section)
      fetchCounts()
    } catch (err: any) {
      showError(err.message)
    }
  }

  // Policy chat: AI에게 메시지 전송
  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')

    const newMessages = [...chatMessages, { role: 'user' as const, content: userMsg }]
    setChatMessages(newMessages)
    setChatLoading(true)

    try {
      const res = await fetch('/api/admin/cs/policy-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      if (!res.ok) throw new Error('AI 응답 실패')
      const data = await res.json()
      setChatMessages([...newMessages, {
        role: 'assistant',
        content: data.reply,
        actions: data.actions,
      }])
    } catch (err: any) {
      showError(err.message || 'AI 응답 실패')
      setChatMessages(newMessages) // 실패 시 사용자 메시지만 유지
    } finally {
      setChatLoading(false)
    }
  }

  // Policy chat: AI 제안 적용
  const applyPolicyAction = async (action: any) => {
    try {
      if (action.action === 'update' && action.id) {
        const res = await fetch('/api/admin/cs/policies', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: action.id,
            content: action.content,
            ai_instruction: action.ai_instruction || null,
          }),
        })
        if (!res.ok) throw new Error('수정 실패')
        showSuccess(`"${action.title}" 정책이 수정되었습니다.`)
      } else if (action.action === 'add') {
        const res = await fetch('/api/admin/cs/policies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: action.category,
            title: action.title,
            content: action.content,
            ai_instruction: action.ai_instruction || null,
          }),
        })
        if (!res.ok) throw new Error('추가 실패')
        showSuccess(`"${action.title}" 정책이 추가되었습니다.`)
      }
      fetchPolicies()
    } catch (err: any) {
      showError(err.message)
    }
  }

  const handleSavePolicy = async () => {
    if (!editPolicy) return
    setSavingPolicy(true)
    try {
      const res = await fetch('/api/admin/cs/policies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editPolicy.id,
          content: policyContent,
          ai_instruction: policyInstruction,
        }),
      })
      if (!res.ok) throw new Error('저장 실패')
      showSuccess('정책이 저장되었습니다.')
      setEditPolicy(null)
      fetchPolicies()
    } catch (err: any) {
      showError(err.message)
    } finally {
      setSavingPolicy(false)
    }
  }

  // ─── Refund actions ─────────────────────────────────────
  const handleRefundAction = async (action: 'approve' | 'complete' | 'reject') => {
    if (!selectedRefund) return
    if (action === 'reject' && !rejectReason.trim()) {
      showError('거절 사유를 입력해 주세요.')
      return
    }

    setRefundSubmitting(true)
    try {
      const res = await fetch(`/api/admin/cs/refunds/${selectedRefund.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          admin_note: refundNote.trim() || null,
          reject_reason: action === 'reject' ? rejectReason.trim() : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || '처리 실패')
      }

      const labels = { approve: '승인', complete: '환불 완료 처리', reject: '거절' }
      showSuccess(`환불 요청이 ${labels[action]}되었습니다.`)
      setSelectedRefund(null)
      fetchRefunds()
      fetchCounts()
    } catch (err: any) {
      showError(err.message)
    } finally {
      setRefundSubmitting(false)
    }
  }

  const openRefundDetail = (r: RefundRow) => {
    setSelectedRefund(r)
    setRefundNote(r.admin_note || '')
    setRejectReason('')
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const formatAmount = (n: number) => n.toLocaleString() + '원'

  return (
    <div className="space-y-6">
      <PageHeader title="CS" description="고객 문의 관리 및 운영 정책" />

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: 'escalated' as Section, label: '확인 필요', count: escalatedCount },
          { key: 'ai_answered' as Section, label: 'AI 응대', count: aiCount },
          { key: 'refunds' as Section, label: '환불 요청', count: refundPendingCount },
          { key: 'policies' as Section, label: '운영 정책', count: 0 },
        ]).map(t => (
          <Button
            key={t.key}
            variant="ghost"
            size="sm"
            onClick={() => setSection(t.key)}
            className={cn(
              'rounded-none border-b-2 px-4 h-9',
              section === t.key
                ? 'border-foreground text-foreground font-medium'
                : 'border-transparent text-muted-foreground'
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground">
                {t.count}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : section === 'policies' ? (
        /* Policies Section */
        <div className="space-y-4">
          {/* AI 대화 영역 */}
          <Card>
            <CardContent className="p-4">
              {!chatOpen ? (
                <button
                  onClick={() => setChatOpen(true)}
                  className="w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  💬 AI와 대화를 통해 운영 정책을 수정하거나 추가해 보세요
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">운영 정책 AI 어시스턴트</p>
                    <Button variant="ghost" size="sm" onClick={() => { setChatOpen(false); setChatMessages([]) }} className="text-xs text-muted-foreground">
                      닫기
                    </Button>
                  </div>

                  {/* 메시지 목록 */}
                  {chatMessages.length > 0 && (
                    <div className="max-h-96 overflow-y-auto space-y-3 border rounded-md p-3 bg-muted/20">
                      {chatMessages.map((msg, i) => (
                        <div key={i} className={msg.role === 'user' ? 'text-right' : ''}>
                          <div className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                            msg.role === 'user'
                              ? 'bg-foreground text-background'
                              : 'bg-muted'
                          }`}>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                          {/* AI 제안 적용 버튼 */}
                          {msg.actions && msg.actions.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {msg.actions.map((action: any, j: number) => (
                                <div key={j} className="flex items-center gap-2 text-left">
                                  <span className="text-xs text-muted-foreground">
                                    {action.action === 'add' ? '➕' : '✏️'} {action.title}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-6 px-2"
                                    onClick={() => applyPolicyAction(action)}
                                  >
                                    적용
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs text-muted-foreground">생각하는 중...</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 입력 */}
                  <div className="flex gap-2">
                    <Textarea
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="예) 환불 정책에 부분 환불도 추가해 줘"
                      rows={2}
                      className="flex-1 resize-none"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          sendChatMessage()
                        }
                      }}
                      disabled={chatLoading}
                    />
                    <Button
                      onClick={sendChatMessage}
                      disabled={chatLoading || !chatInput.trim()}
                      className="self-end"
                    >
                      전송
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 정책 목록 */}
          {policies.map(p => (
            <Card
              key={p.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => {
                setEditPolicy(p)
                setPolicyContent(p.content)
                setPolicyInstruction(p.ai_instruction || '')
              }}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{p.category}</p>
                </div>
                <p className="text-xs text-muted-foreground">{formatDate(p.updated_at)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : section === 'refunds' ? (
        /* Refunds Section */
        refunds.length === 0 ? (
          <EmptyState title="환불 요청이 없습니다" />
        ) : (
          <div className="space-y-2">
            {refunds.map(r => (
              <Card
                key={r.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openRefundDetail(r)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">
                          {r.customer?.kakao_friend_name || r.customer?.name || '고객'}
                        </span>
                        <StatusBadge
                          status={REFUND_STATUS_MAP[r.status] || 'neutral'}
                          size="xs"
                        >
                          {REFUND_STATUS_LABELS[r.status] || r.status}
                        </StatusBadge>
                        {r.is_full_refund && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            전액환불
                          </span>
                        )}
                      </div>
                      <p className="text-sm">
                        {r.subscription?.product?.title || '상품 정보 없음'}
                        {' — '}
                        환불 {formatAmount(r.refund_amount)}
                        <span className="text-muted-foreground"> / 결제 {formatAmount(r.paid_amount)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method}
                        {' · '}{formatDate(r.created_at)}
                        {r.needs_account_info && r.bank_name && ` · ${r.bank_name}`}
                      </p>
                    </div>
                    {r.status === 'pending' && (
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); openRefundDetail(r) }}
                        >
                          처리
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : inquiries.length === 0 ? (
        <EmptyState
          title={section === 'escalated' ? '확인이 필요한 문의가 없습니다' : 'AI 응대 문의가 없습니다'}
        />
      ) : (
        /* Inquiries List */
        <div className="space-y-2">
          {inquiries.map(inq => (
            <Card key={inq.id} className="hover:bg-muted/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => openDetail(inq.id)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">
                        {inq.customer?.kakao_friend_name || inq.customer?.name || '고객'}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {CS_CATEGORY_LABELS[inq.category] || inq.category}
                      </span>
                    </div>
                    <p className="text-sm truncate">{inq.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(inq.created_at)}
                      {inq.reply_count > 0 && ` · 답변 ${inq.reply_count}건`}
                    </p>
                  </div>
                  {section === 'escalated' && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => openDetail(inq.id)}>답변</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDismiss(inq.id)} className="text-muted-foreground">스킵</Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Inquiry Detail Dialog */}
      <Dialog open={!!selectedId} onOpenChange={() => { setSelectedId(null); setDetail(null) }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                    {CS_CATEGORY_LABELS[detail.category] || detail.category}
                  </span>
                  {detail.title}
                </div>
              ) : '문의 상세'}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : detail ? (
            <div className="space-y-3">
              {/* Customer info */}
              <div className="text-xs text-muted-foreground">
                {detail.customer?.kakao_friend_name || detail.customer?.name || '고객'}
                {detail.subscription && ` · ${detail.subscription.product?.title} ${detail.subscription.last_sent_day}일차`}
                {' · '}{formatDate(detail.created_at)}
              </div>

              {/* Original */}
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs font-medium mb-1">고객 문의</p>
                  <p className="text-sm whitespace-pre-wrap">{detail.content}</p>
                </CardContent>
              </Card>

              {/* Replies */}
              {detail.cs_replies?.map(r => (
                <Card key={r.id} className={cn(r.author_type !== 'customer' && 'bg-muted/50')}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium">
                        {r.author_type === 'customer' ? '고객' : r.author_type === 'ai' ? 'AI' : `관리자 (${r.author_name || ''})`}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{r.content}</p>
                  </CardContent>
                </Card>
              ))}

              {/* Admin reply */}
              {detail.status === 'escalated' && (
                <div className="space-y-2 pt-2 border-t">
                  <Textarea
                    placeholder="답변 내용을 입력하세요"
                    rows={3}
                    value={replyContent}
                    onChange={e => setReplyContent(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              )}
            </div>
          ) : null}

          {detail?.status === 'escalated' && (
            <DialogFooter>
              <Button variant="ghost" onClick={() => { handleDismiss(detail.id); setSelectedId(null); setDetail(null) }}>
                스킵
              </Button>
              <Button onClick={handleAdminReply} disabled={submitting || !replyContent.trim()}>
                {submitting ? '등록 중...' : '답변 등록'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Refund Detail Dialog */}
      <Dialog open={!!selectedRefund} onOpenChange={() => setSelectedRefund(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                환불 요청 상세
                {selectedRefund && (
                  <StatusBadge
                    status={REFUND_STATUS_MAP[selectedRefund.status] || 'neutral'}
                    size="sm"
                  >
                    {REFUND_STATUS_LABELS[selectedRefund.status] || selectedRefund.status}
                  </StatusBadge>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedRefund && (
            <div className="space-y-4">
              {/* Customer & Subscription info */}
              <Card>
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs font-medium mb-2">고객 / 구독 정보</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">고객</span>
                    <span>{selectedRefund.customer?.kakao_friend_name || selectedRefund.customer?.name || '-'}</span>
                    <span className="text-muted-foreground">상품</span>
                    <span>{selectedRefund.subscription?.product?.title || '-'}</span>
                    <span className="text-muted-foreground">이용일수</span>
                    <span>{selectedRefund.used_days}일 / {selectedRefund.total_days}일</span>
                    <span className="text-muted-foreground">결제 방법</span>
                    <span>{PAYMENT_METHOD_LABELS[selectedRefund.payment_method] || selectedRefund.payment_method}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Refund Calculation */}
              <Card>
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs font-medium mb-2">환불 계산</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">결제 금액</span>
                    <span>{formatAmount(selectedRefund.paid_amount)}</span>
                    {!selectedRefund.is_full_refund && (
                      <>
                        <span className="text-muted-foreground">일일 단가</span>
                        <span>{formatAmount(selectedRefund.daily_rate)}</span>
                        <span className="text-muted-foreground">이용 금액</span>
                        <span>-{formatAmount(selectedRefund.used_amount)}</span>
                        <span className="text-muted-foreground">위약금 (30%)</span>
                        <span>-{formatAmount(selectedRefund.penalty_amount)}</span>
                      </>
                    )}
                    <span className="text-muted-foreground font-medium">환불 금액</span>
                    <span className="font-medium">{formatAmount(selectedRefund.refund_amount)}</span>
                  </div>
                  {selectedRefund.is_full_refund && (
                    <p className="text-xs text-muted-foreground mt-2">
                      결제 후 3일 이내 - 전액 환불 대상
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Bank Account Info (if applicable) */}
              {selectedRefund.needs_account_info && (
                <Card>
                  <CardContent className="p-3 space-y-1">
                    <p className="text-xs font-medium mb-2">환불 계좌 정보</p>
                    {selectedRefund.bank_name ? (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <span className="text-muted-foreground">은행</span>
                        <span>{selectedRefund.bank_name}</span>
                        <span className="text-muted-foreground">계좌번호</span>
                        <span>{selectedRefund.account_number || '-'}</span>
                        <span className="text-muted-foreground">예금주</span>
                        <span>{selectedRefund.account_holder || '-'}</span>
                      </div>
                    ) : (
                      <p className="text-sm text-destructive">계좌 정보 미수집 - 고객에게 재확인 필요</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Related Inquiry */}
              {selectedRefund.inquiry && (
                <div className="text-xs text-muted-foreground">
                  관련 문의: {selectedRefund.inquiry.title}
                </div>
              )}

              {/* Admin actions for pending refunds */}
              {(selectedRefund.status === 'pending' || selectedRefund.status === 'approved') && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">관리자 메모</label>
                    <Textarea
                      placeholder="메모 (선택)"
                      rows={2}
                      value={refundNote}
                      onChange={e => setRefundNote(e.target.value)}
                      disabled={refundSubmitting}
                    />
                  </div>

                  {selectedRefund.status === 'pending' && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">거절 시 사유</label>
                      <Input
                        placeholder="거절 사유 (거절 시 필수)"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        disabled={refundSubmitting}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Processed info for completed/rejected */}
              {(selectedRefund.status === 'completed' || selectedRefund.status === 'rejected') && (
                <Card className="bg-muted/50">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium mb-1">
                      {selectedRefund.status === 'completed' ? '처리 완료' : '거절됨'}
                    </p>
                    {selectedRefund.reject_reason && (
                      <p className="text-sm">거절 사유: {selectedRefund.reject_reason}</p>
                    )}
                    {selectedRefund.admin_note && (
                      <p className="text-sm text-muted-foreground">메모: {selectedRefund.admin_note}</p>
                    )}
                    {selectedRefund.processed_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        처리일: {formatDate(selectedRefund.processed_at)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {selectedRefund && (selectedRefund.status === 'pending' || selectedRefund.status === 'approved') && (
            <DialogFooter>
              {selectedRefund.status === 'pending' && (
                <Button
                  variant="ghost"
                  onClick={() => handleRefundAction('reject')}
                  disabled={refundSubmitting}
                  className="text-destructive"
                >
                  거절
                </Button>
              )}
              <Button
                onClick={() => handleRefundAction('complete')}
                disabled={refundSubmitting}
              >
                {refundSubmitting ? '처리 중...' : '환불 완료'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Policy Edit Dialog */}
      <Dialog open={!!editPolicy} onOpenChange={() => setEditPolicy(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>운영 정책 수정 — {editPolicy?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">정책 내용 (마크다운)</label>
              <Textarea
                rows={8}
                value={policyContent}
                onChange={e => setPolicyContent(e.target.value)}
                disabled={savingPolicy}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">AI 지시사항</label>
              <Textarea
                rows={4}
                placeholder="AI에게 이 정책에 대해 어떻게 응답해야 하는지 지시합니다"
                value={policyInstruction}
                onChange={e => setPolicyInstruction(e.target.value)}
                disabled={savingPolicy}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPolicy(null)} disabled={savingPolicy}>취소</Button>
            <Button onClick={handleSavePolicy} disabled={savingPolicy}>
              {savingPolicy ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}
