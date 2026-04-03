'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/ui/status-badge'
import { CS_CATEGORY_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface Reply {
  id: string
  author_type: 'ai' | 'admin' | 'customer' | 'system'
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
  cs_replies: Reply[]
}

const INQ_STATUS_MAP: Record<string, { status: 'success' | 'warning' | 'info' | 'neutral'; label: string }> = {
  pending: { status: 'info', label: '처리중' },
  ai_answered: { status: 'success', label: '답변완료' },
  escalated: { status: 'warning', label: '확인 중' },
  admin_answered: { status: 'success', label: '답변완료' },
  dismissed: { status: 'neutral', label: '종료' },
  closed: { status: 'neutral', label: '종료' },
}

export default function InquiryDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [inquiry, setInquiry] = useState<InquiryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyContent, setReplyContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const fetchInquiry = useCallback(async () => {
    try {
      const res = await fetch(`/api/cs/inquiries/${id}`)
      if (res.status === 401) { router.push('/cs'); return }
      if (res.status === 403 || res.status === 404) { router.push('/cs/dashboard'); return }
      const data = await res.json()
      setInquiry(data.data)
    } catch {
      router.push('/cs/dashboard')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { fetchInquiry() }, [fetchInquiry])

  // pending/processing 상태면 10초마다 자동 폴링 (AI 응답 대기)
  useEffect(() => {
    if (!inquiry) return
    if (inquiry.status !== 'pending' && inquiry.status !== 'processing') return
    const interval = setInterval(() => { fetchInquiry() }, 10_000)
    return () => clearInterval(interval)
  }, [inquiry?.status, fetchInquiry])

  const handleReply = async () => {
    if (!replyContent.trim()) return
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch(`/api/cs/inquiries/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContent.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '등록에 실패했습니다.')
        return
      }
      setReplyContent('')
      fetchInquiry()
    } catch {
      setError('서버 연결에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
  }

  if (!inquiry) return null

  const ist = INQ_STATUS_MAP[inquiry.status] || INQ_STATUS_MAP.pending
  const canReply = inquiry.status !== 'closed' && inquiry.status !== 'dismissed'

  const formatDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString('ko-KR') + ' ' + date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-4">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => router.push('/cs/dashboard')} className="text-muted-foreground -ml-2">
        &larr; 목록으로
      </Button>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {CS_CATEGORY_LABELS[inquiry.category] || inquiry.category}
          </span>
          <StatusBadge status={ist.status} size="xs">{ist.label}</StatusBadge>
        </div>
        <h1 className="text-lg font-semibold">{CS_CATEGORY_LABELS[inquiry.category] || inquiry.category} 문의</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(inquiry.created_at)}</p>
      </div>

      {/* Original content */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-foreground">내 문의</span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{inquiry.content}</p>
        </CardContent>
      </Card>

      {/* Replies */}
      {inquiry.cs_replies?.map(reply => {
        const isCustomer = reply.author_type === 'customer'
        return (
          <Card key={reply.id} className={cn(!isCustomer && 'bg-muted/50')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-foreground">
                  {isCustomer ? '내 문의' : '담당자'}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(reply.created_at)}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{reply.content}</p>
            </CardContent>
          </Card>
        )
      })}

      {/* AI 처리 중 안내 */}
      {(inquiry.status === 'pending' || inquiry.status === 'processing') && (
        <Card className="border-dashed">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-4 w-4 border-2 border-foreground border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="text-sm text-muted-foreground">답변을 준비하고 있습니다. 평균 1시간 이내로 답변 드립니다.</p>
          </CardContent>
        </Card>
      )}

      {/* Reply form */}
      {canReply && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Textarea
              placeholder="추가 문의 내용을 입력해 주세요"
              rows={3}
              value={replyContent}
              onChange={e => setReplyContent(e.target.value)}
              disabled={submitting}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end">
              <Button size="sm" onClick={handleReply} disabled={submitting || !replyContent.trim()}>
                {submitting ? '등록 중...' : '답변 등록'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
