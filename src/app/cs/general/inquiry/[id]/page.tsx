'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'

interface Reply {
  id: string
  author_type: 'customer' | 'admin'
  author_name: string | null
  content: string
  created_at: string
}

interface InquiryDetail {
  id: string
  content: string
  status: string
  created_at: string
  cs_general_replies: Reply[]
}

const STATUS_MAP: Record<string, { status: 'success' | 'warning' | 'info' | 'neutral'; label: string }> = {
  pending: { status: 'info', label: '확인 중' },
  answered: { status: 'success', label: '답변완료' },
  closed: { status: 'neutral', label: '종료' },
}

export default function GeneralInquiryDetailPage() {
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
      const res = await fetch(`/api/cs/general/inquiries/${id}`)
      if (res.status === 401) {
        router.push('/cs/general')
        return
      }
      if (!res.ok) throw new Error('로드 실패')
      const data = await res.json()
      setInquiry(data.data)
    } catch {
      setError('문의를 불러올 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    fetchInquiry()
  }, [fetchInquiry])

  const handleReply = async () => {
    if (!replyContent.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/cs/general/inquiries/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContent.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '답글 등록에 실패했습니다.')
        return
      }
      setReplyContent('')
      fetchInquiry()
    } catch {
      setError('답글 등록에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="h-6 w-6 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!inquiry) {
    return (
      <div className="max-w-lg mx-auto py-6 px-4">
        <p className="text-sm text-muted-foreground">문의를 찾을 수 없습니다.</p>
        <Button variant="ghost" className="mt-2" onClick={() => router.push('/cs/general/dashboard')}>
          목록으로
        </Button>
      </div>
    )
  }

  const st = STATUS_MAP[inquiry.status] || STATUS_MAP.pending

  return (
    <div className="max-w-lg mx-auto py-6 px-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push('/cs/general/dashboard')}>
          ← 목록
        </Button>
        <StatusBadge status={st.status} size="sm">{st.label}</StatusBadge>
      </div>

      {/* Original Inquiry */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-2">{formatDate(inquiry.created_at)}</p>
          <p className="text-sm whitespace-pre-wrap">{inquiry.content}</p>
        </CardContent>
      </Card>

      {/* Replies */}
      {inquiry.cs_general_replies?.map(r => (
        <Card key={r.id} className={cn(r.author_type === 'admin' && 'bg-muted/50')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium">
                {r.author_type === 'customer' ? '내 답글' : '담당자'}
              </p>
              <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
            </div>
            <p className="text-sm whitespace-pre-wrap">{r.content}</p>
          </CardContent>
        </Card>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Reply Form */}
      {inquiry.status !== 'closed' && (
        <div className="space-y-2 pt-2 border-t">
          <Textarea
            placeholder="추가 문의사항을 입력하세요"
            rows={3}
            value={replyContent}
            onChange={e => setReplyContent(e.target.value)}
            disabled={submitting}
            className="text-base"
          />
          <Button
            onClick={handleReply}
            disabled={submitting || !replyContent.trim()}
            className="w-full min-h-[44px]"
          >
            {submitting ? '등록 중...' : '답글 남기기'}
          </Button>
        </div>
      )}
    </div>
  )
}
