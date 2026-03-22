const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

export async function sendSlackNotification(message: string) {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('[Slack] SLACK_WEBHOOK_URL not configured, skipping notification')
    return
  }

  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    })
  } catch (err) {
    console.error('[Slack] Failed to send notification:', err)
  }
}

// 대기열 생성 완료 알림
export async function notifyQueueGenerated(summary: Record<string, number>, total: number, date: string) {
  const deviceLines = Object.entries(summary)
    .map(([device, count]) => `${device} (${count})`)
    .join(' | ')

  await sendSlackNotification(
    `📋 *대기열 생성 완료* — ${date}\n` +
    `PC ${Object.keys(summary).length}대 / 총 ${total.toLocaleString()}건\n` +
    `${deviceLines}`
  )
}

// 매크로 중단 알림
export async function notifyMacroStopped(deviceId: string, sent: number, total: number, reason: string) {
  await sendSlackNotification(
    `🔴 *매크로 중단* — ${deviceId}\n` +
    `${sent.toLocaleString()}/${total.toLocaleString()}건 처리 후 중단\n` +
    `사유: ${reason}`
  )
}

// 발송 완료 요약 알림
export async function notifySendingComplete(date: string, stats: { total: number; sent: number; failed: number; devices: Record<string, { sent: number; failed: number; total: number }> }) {
  const deviceLines = Object.entries(stats.devices)
    .map(([device, s]) => {
      const status = s.failed > 0 ? `⚠️ 실패 ${s.failed}건` : '✅'
      return `${device}: ${s.sent}/${s.total} ${status}`
    })
    .join('\n')

  await sendSlackNotification(
    `📊 *발송 완료 요약* — ${date}\n` +
    `총 ${stats.total.toLocaleString()}건 | 성공 ${stats.sent.toLocaleString()} | 실패 ${stats.failed.toLocaleString()}\n` +
    `\n${deviceLines}`
  )
}

// 결과 보고 실패 알림
export async function notifyReportFailed(deviceId: string) {
  await sendSlackNotification(
    `⚠️ *결과 보고 실패* — ${deviceId}\n` +
    `수동 확인 필요`
  )
}
