import { FULL_REFUND_DAYS, PENALTY_RATE, PG_CANCEL_DAYS } from '@/lib/constants'

/**
 * 환불 계산 결과
 */
export interface RefundCalculation {
  paidAmount: number        // 결제 금액
  usedDays: number          // 이용일수
  totalDays: number         // 전체 기간
  dailyRate: number         // 일일 단가 (원 단위, 내림)
  usedAmount: number        // 이용 금액
  penaltyAmount: number     // 위약금
  refundAmount: number      // 환불 금액
  isFullRefund: boolean     // 전액 환불 여부
  daysSincePaid: number     // 결제 후 경과일
  needsAccountInfo: boolean // 계좌 정보 필요 여부 (카드 + 30일 초과)
}

/**
 * 환불 금액 계산
 *
 * 정책:
 * - 결제 후 3일 이내: 전액 환불
 * - 결제 후 3일 초과: 결제 금액 - 이용일수 금액 - 위약금(결제 금액의 30%)
 * - 환불 금액은 최소 0원
 */
export function calculateRefund(params: {
  paidAmount: number    // order_items.allocated_amount
  usedDays: number      // subscriptions.last_sent_day
  totalDays: number     // subscriptions.duration_days
  paidAt: string | Date // orders.ordered_at
  paymentMethod: 'card' | 'bank_transfer'
}): RefundCalculation {
  const { paidAmount, usedDays, totalDays, paidAt, paymentMethod } = params

  // 결제 후 경과일 계산 (KST 기준)
  const paidDate = new Date(paidAt)
  const now = new Date()
  const daysSincePaid = Math.floor(
    (now.getTime() - paidDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  // 전액 환불: 결제 후 3일 이내
  const isFullRefund = daysSincePaid <= FULL_REFUND_DAYS

  // 일일 단가 (내림)
  const dailyRate = totalDays > 0 ? Math.floor(paidAmount / totalDays) : 0

  // 이용 금액
  const usedAmount = isFullRefund ? 0 : dailyRate * usedDays

  // 위약금: 전액 환불이면 0, 아니면 결제 금액의 30%
  const penaltyAmount = isFullRefund ? 0 : Math.floor(paidAmount * PENALTY_RATE)

  // 환불 금액 (최소 0)
  const refundAmount = isFullRefund
    ? paidAmount
    : Math.max(0, paidAmount - usedAmount - penaltyAmount)

  // 계좌 정보 필요 여부: 카드 결제 + 30일 초과 시 PG 취소 불가
  const needsAccountInfo =
    paymentMethod === 'bank_transfer' ||
    (paymentMethod === 'card' && daysSincePaid > PG_CANCEL_DAYS)

  return {
    paidAmount,
    usedDays,
    totalDays,
    dailyRate,
    usedAmount,
    penaltyAmount,
    refundAmount,
    isFullRefund,
    daysSincePaid,
    needsAccountInfo,
  }
}

/**
 * 환불 계산 결과를 사람이 읽기 쉬운 텍스트로 변환
 */
export function formatRefundSummary(calc: RefundCalculation): string {
  const lines: string[] = []

  lines.push(`결제 금액: ${calc.paidAmount.toLocaleString()}원`)
  lines.push(`결제 후 경과일: ${calc.daysSincePaid}일`)

  if (calc.isFullRefund) {
    lines.push(``)
    lines.push(`결제 후 ${FULL_REFUND_DAYS}일 이내이므로 전액 환불 대상입니다.`)
    lines.push(`환불 금액: ${calc.refundAmount.toLocaleString()}원`)
  } else {
    lines.push(`이용일수: ${calc.usedDays}일 / ${calc.totalDays}일`)
    lines.push(`일일 단가: ${calc.dailyRate.toLocaleString()}원`)
    lines.push(`이용 금액: ${calc.usedAmount.toLocaleString()}원`)
    lines.push(`위약금 (${Math.round(PENALTY_RATE * 100)}%): ${calc.penaltyAmount.toLocaleString()}원`)
    lines.push(``)
    lines.push(`환불 금액: ${calc.refundAmount.toLocaleString()}원`)
    lines.push(`(${calc.paidAmount.toLocaleString()} - ${calc.usedAmount.toLocaleString()} - ${calc.penaltyAmount.toLocaleString()})`)
  }

  return lines.join('\n')
}
