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
