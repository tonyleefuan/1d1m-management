import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { handleCsInquiry, handleCsReply } from '@/lib/ai/cs-engine'

const BATCH_SIZE = 10 // 한 번에 처리할 최대 문의 수 (타임아웃 방지)
const STUCK_THRESHOLD_MS = 15 * 60 * 1000 // 15분 이상 processing 상태면 stuck

export async function POST(req: Request) {
  // Vercel Cron 또는 관리자 인증
  const cronSecret = req.headers.get('authorization')
  const isVercelCron = cronSecret === `Bearer ${process.env.CRON_SECRET}`

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
    // ── 0. stuck processing 복구 (15분 이상) ──
    const stuckThreshold = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString()
    await supabase
      .from('cs_inquiries')
      .update({ status: 'pending' })
      .eq('status', 'processing')
      .lt('updated_at', stuckThreshold)

    // ── 1. 신규 pending 문의 처리 ──
    const { data: pendingInquiries } = await supabase
      .from('cs_inquiries')
      .select('id, customer_id, category, title, content, subscription_id, updated_at')
      .eq('status', 'pending')
      .is('subscription_id', null) // subscription_id 없는 건도 포함
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    // subscription_id가 있는 건도 별도로 조회 (is null OR 과 or 쿼리 대신)
    const { data: pendingWithSub } = await supabase
      .from('cs_inquiries')
      .select('id, customer_id, category, title, content, subscription_id, updated_at')
      .eq('status', 'pending')
      .not('subscription_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    const allPending = [...(pendingInquiries || []), ...(pendingWithSub || [])]
      .slice(0, BATCH_SIZE)
    pendingCount = allPending.length

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

        const aiResult = await handleCsInquiry(
          inquiry.customer_id,
          inquiry.category,
          inquiry.title,
          inquiry.content,
          inquiry.subscription_id,
        )

        // AI 답변 저장
        await supabase.from('cs_replies').insert({
          inquiry_id: inquiry.id,
          author_type: 'ai',
          author_name: null,
          content: aiResult.reply,
          action_taken: aiResult.actions.length > 0 ? aiResult.actions : null,
        })

        // 에스컬레이션 시 자동 안내 댓글 추가
        if (aiResult.status === 'escalated') {
          // AI 답변에 에스컬레이션 안내가 없으면 별도 추가
          if (!aiResult.reply.includes('영업일')) {
            await supabase.from('cs_replies').insert({
              inquiry_id: inquiry.id,
              author_type: 'ai',
              author_name: null,
              content: '관리자 확인이 필요한 사안입니다. 영업일 1일 이내에 답변 드리겠습니다.',
            })
          }
        }

        // 최종 상태 업데이트 (processing 상태인 것만)
        await supabase
          .from('cs_inquiries')
          .update({ status: aiResult.status })
          .eq('id', inquiry.id)
          .eq('status', 'processing')

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

    // ── 2. 고객 후속 댓글 처리 (needs_ai_reply 상태) ──
    // ai_answered 상태에서 고객이 댓글을 달면 reply route가 pending으로 되돌림
    // 여기서는 pending인데 이미 AI 답변이 있는 건 = 후속 댓글
    const { data: followupInquiries } = await supabase
      .from('cs_inquiries')
      .select(`
        id, customer_id, category, title, content, subscription_id, updated_at,
        cs_replies(id, author_type, content, created_at)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    const followups = (followupInquiries || []).filter(
      inq => inq.cs_replies && inq.cs_replies.some((r: any) => r.author_type === 'ai')
    )
    followupCount = followups.length

    for (const inquiry of followups) {
      try {
        const { data: locked } = await supabase
          .from('cs_inquiries')
          .update({ status: 'processing' })
          .eq('id', inquiry.id)
          .eq('status', 'pending')
          .eq('updated_at', inquiry.updated_at)
          .select('id')
          .single()

        if (!locked) continue

        // 대화 이력 정렬
        const sortedReplies = (inquiry.cs_replies || [])
          .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

        const conversationHistory = sortedReplies.map((r: any) => ({
          author_type: r.author_type as 'ai' | 'admin' | 'customer',
          content: r.content,
        }))

        // 마지막 고객 댓글
        const lastCustomerReply = [...sortedReplies]
          .reverse()
          .find((r: any) => r.author_type === 'customer')

        if (!lastCustomerReply) {
          // 고객 댓글이 없으면 스킵 (이상 케이스)
          await supabase
            .from('cs_inquiries')
            .update({ status: 'ai_answered' })
            .eq('id', inquiry.id)
            .eq('status', 'processing')
          continue
        }

        const aiResult = await handleCsReply(
          inquiry.customer_id,
          inquiry.id,
          inquiry.category,
          inquiry.content,
          conversationHistory,
          lastCustomerReply.content,
        )

        await supabase.from('cs_replies').insert({
          inquiry_id: inquiry.id,
          author_type: 'ai',
          author_name: null,
          content: aiResult.reply,
          action_taken: aiResult.actions.length > 0 ? aiResult.actions : null,
        })

        if (aiResult.status === 'escalated' && !aiResult.reply.includes('영업일')) {
          await supabase.from('cs_replies').insert({
            inquiry_id: inquiry.id,
            author_type: 'ai',
            author_name: null,
            content: '관리자 확인이 필요한 사안입니다. 영업일 1일 이내에 답변 드리겠습니다.',
          })
        }

        await supabase
          .from('cs_inquiries')
          .update({ status: aiResult.status })
          .eq('id', inquiry.id)
          .eq('status', 'processing')

        processedCount++
      } catch (err: any) {
        errors.push({ id: inquiry.id, error: err.message || String(err) })
        await supabase
          .from('cs_inquiries')
          .update({ status: 'pending' })
          .eq('id', inquiry.id)
          .eq('status', 'processing')
      }
    }

    // ── 3. Rate limit 레코드 정리 (24시간 이상) ──
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('cs_rate_limits')
      .delete()
      .lt('attempted_at', oneDayAgo)

    // ── 4. Cron 로그 저장 ──
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

    // ── 5. 에러 발생 시 Slack 알림 ──
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
