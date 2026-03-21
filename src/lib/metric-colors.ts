/* ═══════════════════════════════════════════════════════════════════
 *  메트릭 색상 유틸 — 숫자 값에 따른 색상 매핑
 *
 *  광고 탭, 매출 대시보드 등에서 반복되는 "숫자 → 색상" 패턴을 공통화.
 *
 *  import { getMetricColor, ROAS_THRESHOLDS, FREQ_THRESHOLDS } from '@/lib/metric-colors'
 *
 *  // 직접 사용
 *  <span style={{ color: getMetricColor(roas, ROAS_THRESHOLDS) }}>{roas}</span>
 *
 *  // Tailwind 클래스로
 *  <span className={getMetricClass(roas, ROAS_THRESHOLDS)}>{roas}</span>
 * ═══════════════════════════════════════════════════════════════════ */

export interface ColorThresholds {
  /** 이 값 이상이면 긍정(초록) */
  good: number
  /** 이 값 이상이면 중립 */
  neutral: number
  /** 이 값 이상이면 경고(주황) — 생략 시 neutral과 bad 사이는 중립 */
  caution?: number
  /** 높을수록 좋은지 (true) 낮을수록 좋은지 (false) — 기본 true */
  higherIsBetter?: boolean
}

const COLORS = {
  good: '#10b981',     // emerald-500
  neutral: '#333333',
  caution: '#f97316',  // orange-500
  bad: '#FD5046',      // hh-red
  muted: '#999999',
}

const CLASSES = {
  good: 'text-emerald-600',
  neutral: 'text-foreground',
  caution: 'text-hh-orange',
  bad: 'text-hh-red',
  muted: 'text-muted-foreground',
}

/** 숫자 값 → Hex 색상 */
export function getMetricColor(
  value: number | null | undefined,
  thresholds: ColorThresholds,
): string {
  if (value == null || isNaN(value)) return COLORS.muted
  const hib = thresholds.higherIsBetter !== false

  if (hib) {
    // 높을수록 좋음 (ROAS, CM1률 등)
    if (value >= thresholds.good) return COLORS.good
    if (thresholds.caution != null && value <= thresholds.caution) return COLORS.caution
    if (value >= thresholds.neutral) return COLORS.neutral
    return COLORS.bad
  } else {
    // 낮을수록 좋음 (CPA, 빈도 등)
    if (value <= thresholds.good) return COLORS.good
    if (thresholds.caution != null && value >= thresholds.caution) return COLORS.caution
    if (value <= thresholds.neutral) return COLORS.neutral
    return COLORS.bad
  }
}

/** 숫자 값 → Tailwind 클래스 */
export function getMetricClass(
  value: number | null | undefined,
  thresholds: ColorThresholds,
): string {
  if (value == null || isNaN(value)) return CLASSES.muted
  const hib = thresholds.higherIsBetter !== false

  if (hib) {
    if (value >= thresholds.good) return CLASSES.good
    if (thresholds.caution != null && value <= thresholds.caution) return CLASSES.caution
    if (value >= thresholds.neutral) return CLASSES.neutral
    return CLASSES.bad
  } else {
    if (value <= thresholds.good) return CLASSES.good
    if (thresholds.caution != null && value >= thresholds.caution) return CLASSES.caution
    if (value <= thresholds.neutral) return CLASSES.neutral
    return CLASSES.bad
  }
}

/* ── 프리셋 임계값 ── */

/** ROAS: 2.0 이상 좋음, 1.0 이상 중립, 그 아래 나쁨 */
export const ROAS_THRESHOLDS: ColorThresholds = {
  good: 2.0,
  neutral: 1.0,
  higherIsBetter: true,
}

/** CPA: 낮을수록 좋음 (타겟 대비) */
export function cpaThresholds(target: number): ColorThresholds {
  return {
    good: target,
    neutral: target * 1.5,
    higherIsBetter: false,
  }
}

/** 빈도(Frequency): 3.0 이상 경고, 3.5 이상 위험 */
export const FREQ_THRESHOLDS: ColorThresholds = {
  good: 2.0,
  neutral: 3.0,
  caution: 3.5,
  higherIsBetter: false,
}

/** CM1률: 40% 이상 좋음, 20% 이상 중립, 그 아래 나쁨 */
export const CM1_THRESHOLDS: ColorThresholds = {
  good: 40,
  neutral: 20,
  higherIsBetter: true,
}

/** 증감률: 양수 좋음, 0 중립, 음수 나쁨 */
export const CHANGE_THRESHOLDS: ColorThresholds = {
  good: 0.01,
  neutral: -0.01,
  higherIsBetter: true,
}
