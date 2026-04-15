'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { CollapsibleCard } from '@/components/ui/collapsible'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  CS_CATEGORY_LABELS,
  CS_STATUS_LABELS,
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
  subscription?: { id: string; product: { title: string }; last_sent_day: number; duration_days: number }
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

interface GeneralInquiryRow {
  id: string
  email: string
  content: string
  status: string
  is_read: boolean
  created_at: string
  updated_at: string
}

interface GeneralReply {
  id: string
  author_type: 'customer' | 'admin'
  author_name: string | null
  content: string
  created_at: string
}

interface GeneralDetail extends GeneralInquiryRow {
  cs_general_replies: GeneralReply[]
}

interface HistoryInquiry {
  id: string
  category: string
  title: string
  status: string
  content: string
  created_at: string
  updated_at: string
  cs_replies: Reply[]
}

type Section = 'escalated' | 'ai_answered' | 'refunds' | 'general' | 'closed' | 'policies'

const REFUND_STATUS_MAP: Record<string, StatusType> = {
  pending: 'warning',
  approved: 'info',
  completed: 'success',
  rejected: 'error',
}

// ─── Send History Table (reused in detail card + lookup dialog) ───
function SendHistoryTable({ entries, anomalies }: { entries: any[]; anomalies?: any }) {
  const dupSet = new Set(
    (anomalies?.duplicates || []).map((d: any) => `${d.send_date}|${d.day_number}`),
  )
  const failSet = new Set(
    (anomalies?.unresolved_failures || []).map((f: any) => `${f.send_date}|${f.day_number}`),
  )
  const hasAnomalies = (anomalies?.duplicates?.length || 0) + (anomalies?.gaps?.length || 0) + (anomalies?.unresolved_failures?.length || 0) > 0

  return (
    <div className="space-y-2">
      {hasAnomalies && (
        <div className="text-xs space-y-0.5 p-2 rounded bg-destructive/10 text-destructive">
          {anomalies?.duplicates?.map((d: any, i: number) => (
            <p key={`dup-${i}`}>⚠ 중복: {d.send_date} Day {d.day_number} ({d.count}건 발송)</p>
          ))}
          {anomalies?.gaps?.map((g: number, i: number) => (
            <p key={`gap-${i}`}>⚠ 누락: Day {g}</p>
          ))}
          {anomalies?.unresolved_failures?.map((f: any, i: number) => (
            <p key={`fail-${i}`}>⚠ 미해결 실패: {f.send_date} Day {f.day_number}</p>
          ))}
        </div>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b">
            <th className="text-left py-1 font-medium">날짜</th>
            <th className="text-left py-1 font-medium">Day</th>
            <th className="text-center py-1 font-medium">상태</th>
            <th className="text-right py-1 font-medium">발송시간</th>
            <th className="text-left py-1 pl-3 font-medium">미리보기</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e: any, i: number) => (
            <tr
              key={i}
              className={cn(
                'border-b border-border/50',
                dupSet.has(`${e.send_date}|${e.day_number}`) && 'bg-yellow-50 dark:bg-yellow-900/20',
                failSet.has(`${e.send_date}|${e.day_number}`) && 'bg-orange-50 dark:bg-orange-900/20',
              )}
            >
              <td className="py-1">{e.send_date?.slice(5)}</td>
              <td className="py-1">Day {e.day_number}</td>
              <td className="text-center py-1">
                {e.status === 'sent' ? '✅' : e.status === 'failed' ? '❌' : '⏳'}
              </td>
              <td className="text-right py-1 text-muted-foreground">
                {e.sent_at ? new Date(e.sent_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}
              </td>
              <td
                className="py-1 pl-3 text-muted-foreground max-w-[240px] truncate"
                title={e.message_snippet || undefined}
              >
                {e.message_snippet || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CSTab() {
  const { toast, showSuccess, showError, clearToast } = useToast()
  const [section, setSection] = useState<Section>('escalated')
  const [inquiries, setInquiries] = useState<InquiryRow[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [refunds, setRefunds] = useState<RefundRow[]>([])
  const [generalInquiries, setGeneralInquiries] = useState<GeneralInquiryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [escalatedCount, setEscalatedCount] = useState(0)
  const [aiCount, setAiCount] = useState(0)
  const [refundPendingCount, setRefundPendingCount] = useState(0)
  const [generalUnreadCount, setGeneralUnreadCount] = useState(0)

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

  // History state
  const [history, setHistory] = useState<HistoryInquiry[]>([])
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)

  // AI suggested replies state
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [polishing, setPolishing] = useState(false)

  // Policy edit dialog
  const [editPolicy, setEditPolicy] = useState<Policy | null>(null)
  const [policyContent, setPolicyContent] = useState('')
  const [policyInstruction, setPolicyInstruction] = useState('')
  const [savingPolicy, setSavingPolicy] = useState(false)

  // General inquiry detail dialog
  const [selectedGeneral, setSelectedGeneral] = useState<GeneralDetail | null>(null)
  const [generalDetailLoading, setGeneralDetailLoading] = useState(false)
  const [generalReplyContent, setGeneralReplyContent] = useState('')
  const [generalReplySubmitting, setGeneralReplySubmitting] = useState(false)

  // Send history state (inquiry detail)
  const [sendHistory, setSendHistory] = useState<any>(null)
  const [sendHistoryLoading, setSendHistoryLoading] = useState(false)

  // Send history lookup dialog
  const [historyLookupOpen, setHistoryLookupOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historySearchResults, setHistorySearchResults] = useState<any[]>([])
  const [historySearchLoading, setHistorySearchLoading] = useState(false)
  const [lookupSubId, setLookupSubId] = useState<string | null>(null)
  const [lookupHistory, setLookupHistory] = useState<any>(null)
  const [lookupHistoryLoading, setLookupHistoryLoading] = useState(false)

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
      const items = data.data || []
      setInquiries(items)
      // 뱃지 카운트도 실제 리스트와 동기화
      if (status === 'escalated') setEscalatedCount(items.length)
      else if (status === 'ai_answered') setAiCount(data.unreadAiCount ?? items.length)
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
      const items = data.data || []
      setRefunds(items)
      // pending 환불만 카운트 (전체 환불 목록에서 pending 필터)
      setRefundPendingCount(items.filter((r: any) => r.status === 'pending').length)
    } catch (err: any) {
      showError(err.message || '환불 목록 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [showError])

  const fetchGeneralInquiries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/cs/general-inquiries')
      if (!res.ok) throw new Error('로드 실패')
      const data = await res.json()
      const items = data.data || []
      setGeneralInquiries(items)
      // unread 카운트 동기화
      setGeneralUnreadCount(items.filter((g: any) => !g.admin_read_at).length)
    } catch (err: any) {
      showError(err.message || '기타 문의 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [showError])

  const openGeneralDetail = async (id: string) => {
    setGeneralDetailLoading(true)
    setGeneralReplyContent('')
    try {
      const res = await fetch(`/api/admin/cs/general-inquiries/${id}`)
      if (!res.ok) throw new Error('로드 실패')
      const data = await res.json()
      setSelectedGeneral(data.data)
      // 목록에서도 읽음 표시
      setGeneralInquiries(prev => prev.map(i => i.id === id ? { ...i, is_read: true } : i))
      setGeneralUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err: any) {
      showError(err.message)
    } finally {
      setGeneralDetailLoading(false)
    }
  }

  const handleGeneralReply = async () => {
    if (!generalReplyContent.trim() || !selectedGeneral) return
    setGeneralReplySubmitting(true)
    try {
      const res = await fetch(`/api/admin/cs/general-inquiries/${selectedGeneral.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: generalReplyContent.trim() }),
      })
      if (!res.ok) throw new Error('답변 등록 실패')
      showSuccess('답변이 등록되었습니다.')
      setSelectedGeneral(null)
      fetchGeneralInquiries()
    } catch (err: any) {
      showError(err.message)
    } finally {
      setGeneralReplySubmitting(false)
    }
  }

  const fetchCounts = useCallback(async () => {
    try {
      const [escRes, aiRes, refundRes, generalRes] = await Promise.all([
        fetch('/api/admin/cs/inquiries?status=escalated'),
        fetch('/api/admin/cs/inquiries?status=ai_answered'),
        fetch('/api/admin/cs/refunds?status=pending'),
        fetch('/api/admin/cs/general-inquiries?unread=true'),
      ])
      if (escRes.ok) { const d = await escRes.json(); setEscalatedCount(d.data?.length || 0) }
      if (aiRes.ok) { const d = await aiRes.json(); setAiCount(d.unreadAiCount ?? d.data?.length ?? 0) }
      if (refundRes.ok) { const d = await refundRes.json(); setRefundPendingCount(d.data?.length || 0) }
      if (generalRes.ok) { const d = await generalRes.json(); setGeneralUnreadCount(d.data?.length || 0) }
    } catch {
      // 카운트 로드 실패는 무시 — 다음 새로고침 시 재시도
    }
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
    } else if (section === 'general') {
      fetchGeneralInquiries()
    } else {
      fetchInquiries(section)
      // AI 응대 탭 진입 시 읽음 처리
      if (section === 'ai_answered') {
        fetch('/api/admin/cs/inquiries', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mark_ai_read' }),
        }).then(() => setAiCount(0)).catch(() => {})
      }
    }
  }, [section, fetchInquiries, fetchPolicies, fetchRefunds, fetchGeneralInquiries])

  const openDetail = async (id: string) => {
    setSelectedId(id)
    setDetailLoading(true)
    setReplyContent('')
    setSendHistory(null)
    setHistory([])
    setExpandedHistoryId(null)
    setSuggestions([])
    try {
      const res = await fetch(`/api/admin/cs/inquiries/${id}`)
      if (!res.ok) throw new Error('로드 실패')
      const data = await res.json()
      setDetail(data.data)
      // 구독 정보가 있으면 발송 이력도 가져옴
      if (data.data?.subscription?.id) {
        setSendHistoryLoading(true)
        fetch(`/api/admin/cs/send-history?subscription_id=${data.data.subscription.id}&days=14`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setSendHistory(d.data) })
          .catch(() => {})
          .finally(() => setSendHistoryLoading(false))
      }

      // 과거 문의 내역 로드 (비동기)
      fetch(`/api/admin/cs/inquiries/${id}/history`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setHistory(d?.data || []))
        .catch(() => {})

      // AI 추천 답변 로드 (escalated일 때만)
      if (data.data?.status === 'escalated') {
        setSuggestionsLoading(true)
        fetch(`/api/admin/cs/inquiries/${id}/suggestions`, { method: 'POST' })
          .then(r => r.ok ? r.json() : null)
          .then(d => setSuggestions(d?.suggestions || []))
          .catch(() => {})
          .finally(() => setSuggestionsLoading(false))
      }
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

  const handlePolish = async () => {
    if (!replyContent.trim() || !selectedId || polishing) return
    setPolishing(true)
    try {
      const res = await fetch(`/api/admin/cs/inquiries/${selectedId}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'polish', draft: replyContent.trim() }),
      })
      if (!res.ok) throw new Error('다듬기 실패')
      const data = await res.json()
      if (data.polished) setReplyContent(data.polished)
    } catch (err: any) {
      showError(err.message)
    } finally {
      setPolishing(false)
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
      <PageHeader title="CS" description="고객 문의 관리 및 운영 정책">
        <Button variant="outline" size="sm" onClick={() => { setHistoryLookupOpen(true); setHistorySearch(''); setHistorySearchResults([]); setLookupSubId(null); setLookupHistory(null) }}>
          발송 이력 조회
        </Button>
      </PageHeader>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: 'escalated' as Section, label: '확인 필요', count: escalatedCount },
          { key: 'ai_answered' as Section, label: 'AI 응대', count: aiCount },
          { key: 'refunds' as Section, label: '환불 요청', count: refundPendingCount },
          { key: 'general' as Section, label: '기타 문의', count: generalUnreadCount },
          { key: 'closed' as Section, label: '종료됨', count: 0 },
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
                <Button
                  variant="ghost"
                  onClick={() => setChatOpen(true)}
                  className="w-full justify-start text-sm text-muted-foreground font-normal h-auto py-2"
                >
                  💬 AI와 대화를 통해 운영 정책을 수정하거나 추가해 보세요
                </Button>
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
      ) : section === 'general' ? (
        /* General Inquiries Section */
        generalInquiries.length === 0 ? (
          <EmptyState title="기타 문의가 없습니다" />
        ) : (
          <div className="space-y-2">
            {generalInquiries.map(g => (
              <Card
                key={g.id}
                className={cn(
                  'cursor-pointer hover:bg-muted/50 transition-colors',
                  !g.is_read && 'border-l-2 border-l-foreground'
                )}
                onClick={() => openGeneralDetail(g.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">{g.email}</span>
                        {!g.is_read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-foreground shrink-0" />
                        )}
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {g.status === 'answered' ? '답변완료' : g.status === 'closed' ? '종료' : '대기'}
                        </span>
                      </div>
                      <p className="text-sm truncate text-muted-foreground">{g.content}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(g.created_at)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : inquiries.length === 0 ? (
        <EmptyState
          title={
            section === 'escalated' ? '확인이 필요한 문의가 없습니다'
            : section === 'closed' ? '종료된 문의가 없습니다'
            : 'AI 응대 문의가 없습니다'
          }
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
                <span
                  className="cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => {
                    const name = detail.customer?.kakao_friend_name || detail.customer?.name || ''
                    if (name) { navigator.clipboard.writeText(name); showSuccess('클립보드에 복사됨') }
                  }}
                  title="클릭하여 복사"
                >{detail.customer?.kakao_friend_name || detail.customer?.name || '고객'}</span>
                {detail.subscription && ` · ${detail.subscription.product?.title} ${detail.subscription.last_sent_day}일차`}
                {' · '}{formatDate(detail.created_at)}
              </div>

              {/* Past inquiries (collapsible) */}
              {history.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1">
                    <span className="text-[10px]">▶</span>
                    <span>과거 문의 {history.length}건</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-1.5 mt-1.5 mb-2">
                      {history.map(h => (
                        <Card key={h.id} className="bg-muted/30">
                          <CardContent
                            className="p-2.5 cursor-pointer"
                            onClick={() => setExpandedHistoryId(expandedHistoryId === h.id ? null : h.id)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
                                  {CS_CATEGORY_LABELS[h.category] || h.category}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(h.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {CS_STATUS_LABELS[h.status] || h.status}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {expandedHistoryId === h.id ? '▼' : '▶'}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 truncate">{h.content}</p>

                            {expandedHistoryId === h.id && (
                              <div className="mt-2 space-y-1.5 border-t pt-2">
                                {h.cs_replies.map(r => (
                                  <div key={r.id} className={cn('text-xs p-2 rounded', r.author_type !== 'customer' ? 'bg-background' : 'bg-muted/50')}>
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="font-medium text-[10px]">
                                        {r.author_type === 'customer' ? '고객' : r.author_type === 'ai' ? 'AI' : `관리자 (${r.author_name || ''})`}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {new Date(r.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                                      </span>
                                    </div>
                                    <p className="whitespace-pre-wrap">{r.content}</p>
                                  </div>
                                ))}
                                {h.cs_replies.length === 0 && (
                                  <p className="text-[10px] text-muted-foreground">답변 없음</p>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Original */}
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs font-medium mb-1">고객 문의</p>
                  <p className="text-sm whitespace-pre-wrap">{detail.content}</p>
                </CardContent>
              </Card>

              {/* Send History Diagnosis */}
              {detail.subscription?.id && (
                <CollapsibleCard
                  title="발송 이력"
                  badge={sendHistory ? `${sendHistory.entries?.length || 0}건` : undefined}
                  defaultOpen={!!(sendHistory?.anomalies?.duplicates?.length || sendHistory?.anomalies?.gaps?.length || sendHistory?.anomalies?.unresolved_failures?.length)}
                >
                  {sendHistoryLoading ? (
                    <div className="flex justify-center py-4"><Spinner /></div>
                  ) : sendHistory?.entries?.length > 0 ? (
                    <SendHistoryTable entries={sendHistory.entries} anomalies={sendHistory.anomalies} />
                  ) : (
                    <p className="text-xs text-muted-foreground py-2">발송 이력 없음</p>
                  )}
                </CollapsibleCard>
              )}

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
                    {r.author_type === 'ai' && (
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
                        <span className="text-xs text-muted-foreground mr-1">AI 품질:</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-xs"
                          onClick={async () => {
                            await fetch('/api/admin/cs/feedback', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ inquiry_id: detail.id, reply_id: r.id, rating: 'good' }),
                            })
                            showSuccess('피드백 등록')
                          }}
                        >👍</Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-xs"
                          onClick={async () => {
                            await fetch('/api/admin/cs/feedback', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ inquiry_id: detail.id, reply_id: r.id, rating: 'bad' }),
                            })
                            showSuccess('피드백 등록')
                          }}
                        >👎</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* Admin reply */}
              {detail.status === 'escalated' && (
                <div className="space-y-2 pt-2 border-t">
                  {/* AI suggested replies */}
                  {suggestionsLoading ? (
                    <p className="text-xs text-muted-foreground">AI 추천 답변 생성 중...</p>
                  ) : suggestions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">추천 답변 (클릭하여 사용)</p>
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          className="w-full text-left text-xs p-2 rounded border border-border hover:bg-muted/50 transition-colors line-clamp-2"
                          onClick={() => setReplyContent(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <Textarea
                    placeholder="답변 내용을 입력하세요"
                    rows={3}
                    value={replyContent}
                    onChange={e => setReplyContent(e.target.value)}
                    disabled={submitting || polishing}
                  />
                  {replyContent.trim() && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePolish}
                      disabled={polishing || submitting}
                      className="text-xs"
                    >
                      {polishing ? 'AI 다듬는 중...' : 'AI 다듬기'}
                    </Button>
                  )}
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

      {/* General Inquiry Detail Dialog */}
      <Dialog open={!!selectedGeneral} onOpenChange={() => setSelectedGeneral(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                기타 문의
                {selectedGeneral && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                    {selectedGeneral.status === 'answered' ? '답변완료' : selectedGeneral.status === 'closed' ? '종료' : '대기'}
                  </span>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {generalDetailLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : selectedGeneral ? (
            <div className="space-y-3">
              {/* 이메일 정보 */}
              <div className="text-xs text-muted-foreground">
                <a href={`mailto:${selectedGeneral.email}`} className="underline underline-offset-2">
                  {selectedGeneral.email}
                </a>
                {' · '}{formatDate(selectedGeneral.created_at)}
              </div>

              {/* 원본 문의 */}
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs font-medium mb-1">문의 내용</p>
                  <p className="text-sm whitespace-pre-wrap">{selectedGeneral.content}</p>
                </CardContent>
              </Card>

              {/* 답글 스레드 */}
              {selectedGeneral.cs_general_replies?.map(r => (
                <Card key={r.id} className={cn(r.author_type === 'admin' && 'bg-muted/50')}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium">
                        {r.author_type === 'customer' ? '고객' : `관리자 (${r.author_name || ''})`}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{r.content}</p>
                  </CardContent>
                </Card>
              ))}

              {/* 답변 입력 */}
              <div className="space-y-2 pt-2 border-t">
                <Textarea
                  placeholder="답변 내용을 입력하세요"
                  rows={3}
                  value={generalReplyContent}
                  onChange={e => setGeneralReplyContent(e.target.value)}
                  disabled={generalReplySubmitting}
                />
              </div>
            </div>
          ) : null}

          {selectedGeneral && (
            <DialogFooter>
              <Button
                onClick={handleGeneralReply}
                disabled={generalReplySubmitting || !generalReplyContent.trim()}
              >
                {generalReplySubmitting ? '등록 중...' : '답변 등록'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Send History Lookup Dialog */}
      <Dialog open={historyLookupOpen} onOpenChange={setHistoryLookupOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>발송 이력 조회</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Search */}
            <form onSubmit={async (e) => {
              e.preventDefault()
              if (!historySearch.trim()) return
              setHistorySearchLoading(true)
              setLookupSubId(null)
              setLookupHistory(null)
              try {
                const res = await fetch(`/api/admin/cs/send-history?search=${encodeURIComponent(historySearch.trim())}`)
                if (!res.ok) throw new Error('검색 실패')
                const data = await res.json()
                setHistorySearchResults(data.data || [])
              } catch { setHistorySearchResults([]) }
              finally { setHistorySearchLoading(false) }
            }} className="flex gap-2">
              <Input
                placeholder="고객명 또는 전화번호 뒷4자리"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="text-sm"
              />
              <Button type="submit" size="sm" disabled={historySearchLoading}>
                {historySearchLoading ? <Spinner /> : '검색'}
              </Button>
            </form>

            {/* Search Results */}
            {historySearchResults.length > 0 && !lookupSubId && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{historySearchResults.length}개 구독</p>
                {historySearchResults.map((s: any) => (
                  <button
                    key={s.id}
                    className="w-full text-left p-2 rounded border border-border hover:bg-muted/50 transition-colors text-sm"
                    onClick={async () => {
                      setLookupSubId(s.id)
                      setLookupHistoryLoading(true)
                      try {
                        const res = await fetch(`/api/admin/cs/send-history?subscription_id=${s.id}&days=14`)
                        if (res.ok) {
                          const data = await res.json()
                          setLookupHistory(data.data)
                        }
                      } catch {} finally { setLookupHistoryLoading(false) }
                    }}
                  >
                    <span className="font-medium">{s.customer?.kakao_friend_name || s.customer?.name || '-'}</span>
                    <span className="text-muted-foreground ml-2">{s.product?.title}</span>
                    <span className="text-muted-foreground ml-2">Day {s.last_sent_day}/{s.duration_days}</span>
                    <StatusBadge status={(s.status === 'live' ? 'success' : s.status === 'pause' ? 'warning' : 'neutral') as StatusType} className="ml-2">{s.status}</StatusBadge>
                  </button>
                ))}
              </div>
            )}

            {/* Selected Subscription History */}
            {lookupSubId && (
              <div className="space-y-2">
                <Button variant="ghost" size="sm" onClick={() => { setLookupSubId(null); setLookupHistory(null) }}>
                  ← 목록으로
                </Button>
                {lookupHistoryLoading ? (
                  <div className="flex justify-center py-4"><Spinner /></div>
                ) : lookupHistory?.entries?.length > 0 ? (
                  <SendHistoryTable entries={lookupHistory.entries} anomalies={lookupHistory.anomalies} />
                ) : (
                  <p className="text-xs text-muted-foreground py-2">발송 이력 없음</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}
