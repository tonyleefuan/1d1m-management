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
export const CS_CATEGORIES = ['message_not_received', 'pause_resume', 'product_change', 'cancel_refund', 'other'] as const
export const CS_CATEGORY_LABELS: Record<string, string> = {
  message_not_received: '메시지 미수신',
  pause_resume: '일시정지/재개',
  product_change: '상품 변경',
  cancel_refund: '취소/환불',
  other: '기타',
}

// CS 카테고리별 가이드 질문 — AI가 물어볼 정보를 폼에서 미리 수집
export const CS_CATEGORY_GUIDES: Record<string, {
  checklist?: { key: string; label: string }[]
  select?: { key: string; label: string; options: { value: string; label: string }[] }[]
  hint?: string
}> = {
  message_not_received: {
    checklist: [
      { key: 'contact_saved', label: '발송 번호를 연락처에 저장했습니다' },
      { key: 'friend_added', label: '카카오톡 친구 추가를 했습니다' },
      { key: 'name_sent', label: '성함과 전화번호 뒷 4자리를 전송했습니다' },
    ],
    hint: '위 항목을 완료하지 않으셨다면, 먼저 완료 후 문의해 주세요.',
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
    ],
    hint: '환불 정책: 결제 후 3일 이내 전액 환불, 3일 초과 시 이용일수 + 위약금(30%) 차감',
  },
  product_change: {
    hint: '변경을 원하는 상품명을 아래에 적어 주세요. 동일 가격 상품만 변경 가능합니다.',
  },
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
  approved: '승인',
  completed: '완료',
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
