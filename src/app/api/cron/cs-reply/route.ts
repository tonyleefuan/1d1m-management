export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { handleCsInquiry, handleCsReply } from '@/lib/ai/cs-engine'
import { getSystemSettings } from '@/lib/settings'

// Vercel Cron은 GET으로 호출 — GET을 메인 핸들러로, POST는 관리자 수동 트리거용
export async function GET(req: Request) {
  return handleCron(req)
}

export async function POST(req: Request) {
  return handleCron(req)
}

async function handleCron(req: Request) {
  // Vercel Cron 또는 관리자 인증
  const cronSecret = req.headers.get('authorization')
  const envSecret = process.env.CRON_SECRET
  const isVercelCron = !!envSecret && cronSecret === `Bearer ${envSecret}`

  if (!isVercelCron) {
    const { getSession } = await import('@/lib/auth')
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const startTime = Date.now()
  const cronLogId = crypto.randomUUID()
  let pendingCount = 0
  let followupCount = 0
  let processedCount = 0
  const errors: Array<{ id: string; error: string }> = []

  try {
    // ── 설정 로드 ──
    const settings = await getSystemSettings([
      'cs_cron_batch_size', 'cs_stuck_threshold_min',
      'cs_data_retention_days', 'cron_log_retention_days',
    ])
    const BATCH_SIZE = Number(settings.cs_cron_batch_size) || 10
    const STUCK_THRESHOLD_MS = (Number(settings.cs_stuck_threshold_min) || 15) * 60 * 1000

    // ── 0. stuck processing 복구 ──
    const stuckThreshold = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString()
    await supabase
      .from('cs_inquiries')
      .update({ status: 'pending' })
      .eq('status', 'processing')
      .lt('updated_at', stuckThreshold)

    // ── 1. 모든 pending 문의 통합 처리 (신규 + 후속 댓글) ──
    const { data: allPendingInquiries } = await supabase
      .from('cs_inquiries')
      .select(`
        id, customer_id, category, title, content, subscription_id, updated_at,
        cs_replies(id, author_type, content, created_at)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    const allPending = allPendingInquiries || []
    pendingCount = allPending.filter(inq => !inq.cs_replies?.some((r: any) => r.author_type === 'ai')).length
    followupCount = allPending.filter(inq => inq.cs_replies?.some((r: any) => r.author_type === 'ai')).length

    for (const inquiry of allPending) {
      try {
        // 낙관적 잠금: status=pending + updated_at 일치 시에만 processing으로 변경
        const { data: locked } = await supabase
          .from('cs_inquiries')
          .update({ status: 'processing' })
          .eq('id', inquiry.id)
          .eq('status', 'pending')
          .eq('updated_at', inquiry.updated_at)
          .select('id')
          .single()

        if (!locked) continue // 다른 Cron이 이미 처리 중

        const hasAiReply = inquiry.cs_replies?.some((r: any) => r.author_type === 'ai')
        let aiResult

        if (hasAiReply) {
          // ── 후속 댓글 처리 ──
          const sortedReplies = (inquiry.cs_replies || [])
            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

          const conversationHistory = sortedReplies.map((r: any) => ({
            author_type: r.author_type as 'ai' | 'admin' | 'customer' | 'system',
            content: r.content,
          }))

          const lastCustomerReply = [...sortedReplies]
            .reverse()
            .find((r: any) => r.author_type === 'customer')

          if (!lastCustomerReply) {
            await supabase
              .from('cs_inquiries')
              .update({ status: 'ai_answered' })
              .eq('id', inquiry.id)
              .eq('status', 'processing')
            continue
          }

          aiResult = await handleCsReply(
            inquiry.customer_id,
            inquiry.id,
            inquiry.category,
            inquiry.content,
            conversationHistory,
            lastCustomerReply.content,
            inquiry.subscription_id,
          )
        } else {
          // ── 신규 문의 처리 ──
          aiResult = await handleCsInquiry(
            inquiry.customer_id,
            inquiry.category,
            inquiry.title,
            inquiry.content,
            inquiry.subscription_id,
            inquiry.id,
          )
        }

        // AI 답변 저장
        await supabase.from('cs_replies').insert({
          inquiry_id: inquiry.id,
          author_type: 'ai',
          author_name: null,
          content: aiResult.reply,
          action_taken: aiResult.actions.length > 0 ? aiResult.actions : null,
        })

        // 에스컬레이션 시 자동 안내 댓글 추가 (system 타입으로 — AI 답변 횟수에 미포함)
        if (aiResult.status === 'escalated') {
          if (!aiResult.reply.includes('영업일')) {
            await supabase.from('cs_replies').insert({
              inquiry_id: inquiry.id,
              author_type: 'system',
              author_name: null,
              content: '담당자가 직접 확인 후 답변 드리겠습니다. 조금만 기다려 주세요!',
            })
          }
        }

        // 최종 상태 업데이트 (processing 상태인 것만)
        await supabase
          .from('cs_inquiries')
          .update({ status: aiResult.status })
          .eq('id', inquiry.id)
          .eq('status', 'processing')

        // 처리 중에 고객이 답글을 달았으면 pending으로 되돌림
        // AI 답변의 created_at 이후에 고객 댓글이 있는지 확인 (더 정확한 기준)
        if (aiResult.status === 'ai_answered') {
          const { data: latestAiReply } = await supabase
            .from('cs_replies')
            .select('created_at')
            .eq('inquiry_id', inquiry.id)
            .eq('author_type', 'ai')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          if (latestAiReply) {
            const { count: newCustomerReplies } = await supabase
              .from('cs_replies')
              .select('id', { count: 'exact', head: true })
              .eq('inquiry_id', inquiry.id)
              .eq('author_type', 'customer')
              .gt('created_at', latestAiReply.created_at)
            if (newCustomerReplies && newCustomerReplies > 0) {
              await supabase
                .from('cs_inquiries')
                .update({ status: 'pending' })
                .eq('id', inquiry.id)
                .eq('status', 'ai_answered')
            }
          }
        }

        processedCount++
      } catch (err: any) {
        errors.push({ id: inquiry.id, error: err.message || String(err) })
        // 실패 시 pending 복구 (다음 Cron에서 재시도)
        await supabase
          .from('cs_inquiries')
          .update({ status: 'pending' })
          .eq('id', inquiry.id)
          .eq('status', 'processing')
      }
    }

    // ── 2. Rate limit 레코드 정리 (24시간 이상) ──
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('cs_rate_limits')
      .delete()
      .lt('attempted_at', oneDayAgo)

    // ── 2.5. 종료 문의 자동 삭제 (CS_POLICY 데이터 보존 정책) ──
    const retentionDays = Number(settings.cs_data_retention_days) || 7
    const sevenDaysAgo = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
    // 먼저 해당 문의의 답글 삭제
    const { data: oldInquiries } = await supabase
      .from('cs_inquiries')
      .select('id')
      .in('status', ['closed', 'dismissed', 'ai_answered', 'admin_answered'])
      .lt('updated_at', sevenDaysAgo)

    if (oldInquiries && oldInquiries.length > 0) {
      const oldIds = oldInquiries.map(i => i.id)
      await supabase
        .from('cs_refund_requests')
        .delete()
        .in('inquiry_id', oldIds)
      await supabase
        .from('cs_replies')
        .delete()
        .in('inquiry_id', oldIds)
      await supabase
        .from('cs_inquiries')
        .delete()
        .in('id', oldIds)
    }

    // ── 2.6. Cron 로그 정리 ──
    const logRetention = Number(settings.cron_log_retention_days) || 30
    const thirtyDaysAgo = new Date(Date.now() - logRetention * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('cs_cron_logs')
      .delete()
      .lt('finished_at', thirtyDaysAgo)

    // ── 3. Cron 로그 저장 ──
    const durationMs = Date.now() - startTime
    await supabase.from('cs_cron_logs').insert({
      id: cronLogId,
      pending_count: pendingCount,
      followup_count: followupCount,
      processed_count: processedCount,
      error_count: errors.length,
      errors: errors.length > 0 ? errors : null,
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
    })

    // ── 4. 에러 발생 시 Slack 알림 ──
    if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
      try {
        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `[CS Cron] ${errors.length}건 처리 실패 (${processedCount}건 성공)`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*CS 자동응답 Cron 에러*\n- 처리 성공: ${processedCount}건\n- 처리 실패: ${errors.length}건\n- 소요 시간: ${durationMs}ms\n- 상세: ${JSON.stringify(errors.slice(0, 3))}`,
                },
              },
            ],
          }),
        })
      } catch {
        // Slack 알림 실패는 무시
      }
    }

    return NextResponse.json({
      ok: true,
      pending_count: pendingCount,
      followup_count: followupCount,
      processed: processedCount,
      errors: errors.length,
      duration_ms: durationMs,
    })
  } catch (err: any) {
    // 전체 Cron 실패 시
    console.error('[CS Cron] 전체 실패:', err)

    await supabase.from('cs_cron_logs').insert({
      id: cronLogId,
      pending_count: pendingCount,
      followup_count: followupCount,
      processed_count: processedCount,
      error_count: 1,
      errors: [{ id: 'cron', error: err.message || String(err) }],
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    })

    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
