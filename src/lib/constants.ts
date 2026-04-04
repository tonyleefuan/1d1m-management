// 1D1M Brand Colors
export const C = {
  bg: '#ffffff',
  surface: '#f8f8f8',
  surfaceAlt: '#f0f0f0',
  border: '#e0e0e0',
  borderLight: '#eeeeee',
  text: '#000000',
  textSecondary: '#666666',
  textMuted: '#999999',
  // Brand
  primary: '#2959FD',
  primaryBg: '#eef2ff',
  // Status
  red: '#FD5046',
  redBg: '#fff0ef',
  green: '#04D1AE',
  greenBg: '#e6faf5',
  yellow: '#FFE343',
  orange: '#FF9720',
} as const

// Subscription statuses
export const SUBSCRIPTION_STATUSES = ['live', 'pending', 'pause', 'archive', 'cancel'] as const
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number]

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  live: '발송중',
  pending: '대기',
  pause: '일시정지',
  archive: '만료',
  cancel: '취소',
}

export const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  live: C.green,
  pending: C.yellow,
  pause: C.orange,
  archive: C.textMuted,
  cancel: C.red,
}

// Message types
export const MESSAGE_TYPES = ['fixed', 'realtime'] as const
export type MessageType = typeof MESSAGE_TYPES[number]

// Channels
export const CHANNELS = ['kakaotalk', 'imessage'] as const
export type Channel = typeof CHANNELS[number]

// Tab config
export interface TabConfig {
  id: string
  label: string
  sort_order: number
  visible: boolean
}

export const TABS: TabConfig[] = [
  { id: 'orders',        label: '주문 관리',     sort_order: 0, visible: true },
  { id: 'subscriptions', label: '구독 관리',     sort_order: 1, visible: true },
  { id: 'messages',      label: '메시지 관리',   sort_order: 2, visible: true },
  { id: 'products',      label: '상품 관리',     sort_order: 3, visible: true },
  { id: 'sending',       label: '발송 모니터링', sort_order: 4, visible: true },
  { id: 'admin',         label: '관리자 설정',   sort_order: 5, visible: true },
  { id: 'cs',            label: 'CS',            sort_order: 6, visible: true },
]

// PC device colors (fallback when DB color is null)
export const PC_COLORS = [
  '#EF4444', // PC 1 — 빨강
  '#22C55E', // PC 2 — 초록
  '#3B82F6', // PC 3 — 파랑
  '#EAB308', // PC 4 — 노랑
  '#EC4899', // PC 5 — 핑크
  '#8B5CF6', // PC 6 — 보라
  '#06B6D4', // PC 7 — 시안
  '#F97316', // PC 8 — 주황
  '#10B981', // PC 9 — 에메랄드
  '#A855F7', // PC 10 — 퍼플
] as const

// CS Categories
export const CS_CATEGORIES = [
  'message_never_received', 'message_stopped', 'pause_resume', 'product_change',
  'cancel_refund', 'delivery_time', 'payment_info', 'other',
] as const
export type CsCategory = typeof CS_CATEGORIES[number]

export const CS_CATEGORY_LABELS: Record<string, string> = {
  message_never_received: '메시지가 처음부터 안 와요',
  message_stopped: '메시지가 오다가 안 와요',
  // legacy alias
  message_not_received: '메시지 미수신',
  pause_resume: '일시정지/재개',
  product_change: '상품 변경',
  cancel_refund: '취소/환불',
  delivery_time: '발송 시간',
  payment_info: '결제/이용기간',
  other: '기타',
}

export const CS_CATEGORY_GUIDES: Record<string, {
  checklist?: { key: string; label: string }[]
  select?: { key: string; label: string; options: { value: string; label: string }[] }[]
  date?: { key: string; label: string }[]
  hint?: string
}> = {
  message_never_received: {
    checklist: [
      { key: 'contact_saved', label: '위 번호를 연락처에 새로 등록했습니다' },
      { key: 'friend_added', label: '카카오톡에서 친구 추가를 했습니다' },
      { key: 'name_sent', label: '해당 카톡으로 성함과 전화번호 뒷 4자리를 보냈습니다' },
    ],
    hint: '연락처 등록을 완료해 주시면 다음 날부터 메시지가 발송됩니다. 스팸 방지 및 다른 분에게 잘못된 메시지가 전달되지 않도록 하기 위한 확인 절차이오니 양해 부탁드립니다. 위 항목을 모두 완료하셨는데도 메시지가 오지 않는 경우, 아래에 문의해 주시면 빠르게 확인해 드리겠습니다.',
  },
  message_stopped: {
    date: [
      { key: 'last_received_date', label: '마지막으로 메시지를 받으신 날짜' },
    ],
    hint: '마지막 수신 날짜와 함께 상황을 알려 주시면 빠르게 확인하여 답변드리겠습니다.',
  },
  pause_resume: {
    select: [
      { key: 'action_type', label: '요청 유형', options: [
        { value: 'pause', label: '일시정지' },
        { value: 'resume', label: '재개' },
      ]},
    ],
  },
  cancel_refund: {
    select: [
      { key: 'payment_method', label: '결제 방법', options: [
        { value: 'card', label: '카드 결제' },
        { value: 'bank_transfer', label: '계좌이체 / 무통장입금' },
      ]},
      { key: 'card_over_30_days', label: '결제한 지 30일이 초과되었나요?', options: [
        { value: 'no', label: '아니오 (30일 이내)' },
        { value: 'yes', label: '네 (30일 초과)' },
      ]},
    ],
    hint: '환불 정책 안내:\n\u2022 결제 후 3일 이내: 전액 환불\n\u2022 결제 후 3일 초과: 결제 금액에서 이용일수 금액과 위약금(결제 금액의 30%)을 차감한 금액이 환불됩니다.\n\u2022 위약금은 메시지 발송 등록 비용, 유지 관리 비용, 수수료 등에 해당합니다.\n\n환불 요청을 접수해 주시면 영업일 기준 3일 이내에 처리해 드리겠습니다.',
  },
  product_change: {
    hint: '변경을 원하시는 상품을 아래에서 선택해 주세요. 동일 가격의 상품 간 변경이 가능합니다.',
  },
}

/** 카테고리별 AI 응답 한도 (DB cs_policies.ai_max_replies 기본값) */
export const CS_AI_REPLY_LIMITS: Record<string, number> = {
  message_never_received: 3,
  message_stopped: 2,
  pause_resume: 2,
  product_change: 2,
  cancel_refund: 4,
  delivery_time: 1,
  payment_info: 2,
  general_notice: 1,
  other: 1,
}

export const CS_STATUS_LABELS: Record<string, string> = {
  pending: '처리중',
  ai_answered: 'AI 답변완료',
  escalated: '확인 필요',
  admin_answered: '답변완료',
  dismissed: '스킵',
  closed: '종료',
}

// Refund
export const REFUND_STATUS_LABELS: Record<string, string> = {
  pending: '접수',
  approved: '환불 완료',
  completed: '환불 완료',
  rejected: '거절',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: '카드 결제',
  bank_transfer: '계좌이체/무통장',
}

/** 전액 환불 기한 (일) */
export const FULL_REFUND_DAYS = 3
/** 위약금 비율 */
export const PENALTY_RATE = 0.3
/** PG 카드 취소 가능 기한 (일) */
export const PG_CANCEL_DAYS = 30

// ─── 운영 설정 레지스트리 (app_settings DB 기본값) ───
// 관리자 설정 > 운영 설정 패널에서 변경 가능
// 기본값은 DB에 값이 없을 때 사용됨

export interface SettingDef {
  key: string
  label: string
  description: string
  type: 'number' | 'string' | 'boolean'
  defaultValue: number | string | boolean
  group: 'cs' | 'ai' | 'refund' | 'system'
  min?: number
  max?: number
}

export const SYSTEM_SETTINGS: SettingDef[] = [
  // ── CS 설정 ──
  { key: 'cs_session_hours',       label: 'CS 세션 유효시간',       description: '고객 CS 포털 세션 유효시간 (시간)',        type: 'number', defaultValue: 1,    group: 'cs', min: 1, max: 24 },
  { key: 'cs_rate_limit_auth',     label: '인증 시도 제한',         description: '15분당 최대 인증 시도 횟수',               type: 'number', defaultValue: 5,    group: 'cs', min: 3, max: 20 },
  { key: 'cs_rate_limit_inquiry',  label: '문의 등록 제한',         description: '시간당 최대 문의 등록 횟수',               type: 'number', defaultValue: 20,   group: 'cs', min: 5, max: 100 },
  { key: 'cs_rate_limit_reply',    label: '댓글 등록 제한',         description: '문의당 시간당 최대 댓글 횟수',             type: 'number', defaultValue: 10,   group: 'cs', min: 3, max: 50 },
  { key: 'cs_content_max_length',  label: '문의 최대 글자수',       description: '문의/댓글 최대 글자수',                    type: 'number', defaultValue: 2000, group: 'cs', min: 100, max: 10000 },
  { key: 'cs_data_retention_days', label: '문의 보관 기간',         description: '종료된 문의 자동 삭제 기간 (일)',           type: 'number', defaultValue: 7,    group: 'cs', min: 1, max: 365 },
  { key: 'cs_cron_batch_size',     label: 'Cron 배치 크기',         description: '한 번에 처리할 최대 문의 수',              type: 'number', defaultValue: 10,   group: 'cs', min: 1, max: 50 },
  { key: 'cs_stuck_threshold_min', label: 'Stuck 판단 시간',        description: 'processing 상태 stuck 판단 시간 (분)',     type: 'number', defaultValue: 15,   group: 'cs', min: 5, max: 60 },

  // ── AI 설정 ──
  { key: 'ai_cs_model',                   label: 'CS AI 모델',             description: 'CS 응답에 사용되는 AI 모델',                type: 'string', defaultValue: 'claude-sonnet-4-6',  group: 'ai' },
  { key: 'ai_cs_max_tokens',              label: 'CS 최대 토큰',           description: 'CS AI 응답 최대 토큰 수',                   type: 'number', defaultValue: 2048,               group: 'ai', min: 512, max: 8192 },
  { key: 'ai_cs_max_iterations',          label: 'CS 도구 반복 제한',      description: '신규 문의 처리 시 최대 도구 호출 반복',      type: 'number', defaultValue: 6,                  group: 'ai', min: 1, max: 15 },
  { key: 'ai_cs_max_followup_iterations', label: 'CS 후속 반복 제한',      description: '후속 댓글 처리 시 최대 도구 호출 반복',      type: 'number', defaultValue: 4,                  group: 'ai', min: 1, max: 10 },
  { key: 'ai_cs_escalation_threshold',    label: 'AI 에스컬레이션 임계값', description: 'AI 응답 N회 초과 시 자동 에스컬레이션',      type: 'number', defaultValue: 2,                  group: 'ai', min: 1, max: 10 },
  { key: 'ai_cs_history_days',            label: 'CS 이력 조회 기간',      description: '고객 최근 문의 이력 조회 기간 (일)',         type: 'number', defaultValue: 7,                  group: 'ai', min: 1, max: 30 },

  // ── 환불/결제 정책 ──
  { key: 'refund_full_days',    label: '전액 환불 기한',     description: '결제 후 N일 이내 전액 환불',          type: 'number', defaultValue: 3,   group: 'refund', min: 1, max: 30 },
  { key: 'refund_penalty_rate', label: '위약금 비율',        description: '위약금 비율 (0.3 = 30%)',             type: 'number', defaultValue: 0.3, group: 'refund', min: 0, max: 1 },
  { key: 'refund_pg_cancel_days', label: 'PG 카드 취소 기한', description: '카드 취소 가능 기한 (일)',            type: 'number', defaultValue: 30,  group: 'refund', min: 1, max: 180 },

  // ── 시스템 설정 ──
  { key: 'admin_session_days',   label: '관리자 세션 기간',   description: '관리자 세션 유효기간 (일)',            type: 'number', defaultValue: 7,   group: 'system', min: 1, max: 30 },
  { key: 'cron_log_retention_days', label: 'Cron 로그 보관',  description: 'Cron 실행 로그 보관 기간 (일)',        type: 'number', defaultValue: 30,  group: 'system', min: 7, max: 365 },
]

/** 설정 키 목록 (API 검증용) */
export const SYSTEM_SETTING_KEYS = SYSTEM_SETTINGS.map(s => s.key)

/** 설정 기본값 맵 */
export const SYSTEM_DEFAULTS: Record<string, number | string | boolean> = Object.fromEntries(
  SYSTEM_SETTINGS.map(s => [s.key, s.defaultValue])
)

/** 그룹 라벨 */
export const SETTING_GROUP_LABELS: Record<string, string> = {
  cs: 'CS 설정',
  ai: 'AI 설정',
  refund: '환불/결제 정책',
  system: '시스템',
}
