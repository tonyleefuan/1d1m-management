'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/lib/use-toast'
import { Toast } from '@/components/ui/Toast'
import { CS_CATEGORY_LABELS } from '@/lib/constants'
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

type Section = 'escalated' | 'ai_answered' | 'policies'

export function CSTab() {
  const { toast, showSuccess, showError, clearToast } = useToast()
  const [section, setSection] = useState<Section>('escalated')
  const [inquiries, setInquiries] = useState<InquiryRow[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [escalatedCount, setEscalatedCount] = useState(0)
  const [aiCount, setAiCount] = useState(0)

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

  const fetchCounts = useCallback(async () => {
    const [escRes, aiRes] = await Promise.all([
      fetch('/api/admin/cs/inquiries?status=escalated'),
      fetch('/api/admin/cs/inquiries?status=ai_answered'),
    ])
    const escData = await escRes.json()
    const aiData = await aiRes.json()
    setEscalatedCount(escData.data?.length || 0)
    setAiCount(aiData.data?.length || 0)
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
    } else {
      fetchInquiries(section)
    }
  }, [section, fetchInquiries, fetchPolicies])

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

  const formatDate = (d: string) => new Date(d).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-6">
      <PageHeader title="CS" description="고객 문의 관리 및 운영 정책" />

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: 'escalated' as Section, label: '확인 필요', count: escalatedCount },
          { key: 'ai_answered' as Section, label: 'AI 응대', count: aiCount },
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
        <div className="space-y-2">
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
