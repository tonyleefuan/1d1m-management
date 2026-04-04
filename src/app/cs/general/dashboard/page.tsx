'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface Inquiry {
  id: string
  content: string
  status: string
  reply_count: number
  created_at: string
}

const STATUS_MAP: Record<string, { status: 'success' | 'warning' | 'info' | 'neutral'; label: string }> = {
  pending: { status: 'info', label: '확인 중' },
  answered: { status: 'success', label: '답변완료' },
  closed: { status: 'neutral', label: '종료' },
}

export default function GeneralDashboardPage() {
  const router = useRouter()
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 새 문의 작성
  const [writeOpen, setWriteOpen] = useState(false)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchInquiries = useCallback(async () => {
    try {
      const res = await fetch('/api/cs/general/inquiries')
      if (res.status === 401) {
        router.push('/cs/general')
        return
      }
      if (!res.ok) throw new Error('로드 실패')
      const data = await res.json()
      setInquiries(data.data || [])
    } catch {
      setError('문의 목록을 불러올 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchInquiries()
  }, [fetchInquiries])

  const handleSubmit = async () => {
    if (!content.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/cs/general/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '문의 접수에 실패했습니다.')
        return
      }
      setWriteOpen(false)
      setContent('')
      fetchInquiries()
    } catch {
      setError('문의 접수에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/cs/general/auth', { method: 'DELETE' })
    router.push('/cs/general')
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

  return (
    <div className="max-w-lg mx-auto py-6 px-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">기타 문의</h1>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setWriteOpen(true)}>
            새 문의
          </Button>
          <Button size="sm" variant="ghost" onClick={handleLogout} className="text-muted-foreground">
            로그아웃
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Inquiry List */}
      {inquiries.length === 0 ? (
        <EmptyState
          title="문의 내역이 없습니다"
          description="새 문의 버튼을 눌러 문의를 남겨주세요"
        />
      ) : (
        <div className="space-y-2">
          {inquiries.map(inq => {
            const st = STATUS_MAP[inq.status] || STATUS_MAP.pending
            return (
              <Card
                key={inq.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => router.push(`/cs/general/inquiry/${inq.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={st.status} size="xs">{st.label}</StatusBadge>
                    {inq.reply_count > 0 && (
                      <span className="text-xs text-muted-foreground">답변 {inq.reply_count}건</span>
                    )}
                  </div>
                  <p className="text-sm line-clamp-2">{inq.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(inq.created_at)}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* New Inquiry Dialog */}
      <Dialog open={writeOpen} onOpenChange={setWriteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 문의</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="문의하실 내용을 작성해 주세요"
              rows={6}
              value={content}
              onChange={e => setContent(e.target.value)}
              disabled={submitting}
              className="text-base"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !content.trim()}
              className="w-full min-h-[44px] text-base"
            >
              {submitting ? '접수 중...' : '문의하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
