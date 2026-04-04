// ============================================================
// 1D1M Management — Type Definitions
// ============================================================

// --- Users ---
export interface User {
  id: string
  username: string
  name: string
  role: 'admin' | 'staff'
  is_active: boolean
  created_at: string
  updated_at: string
}

// --- Products ---
export interface Product {
  id: string
  sku_code: string
  title: string
  message_type: 'fixed' | 'realtime'
  total_days: number | null
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  // joined
  prices?: ProductPrice[]
}

export interface ProductPrice {
  id: string
  product_id: string
  duration_days: number
  price: number
  created_at: string
}

// --- Customers ---
export interface Customer {
  id: string
  name: string
  phone: string | null
  phone_last4: string | null
  kakao_friend_name: string | null
  memo: string | null
  phone_expires_at: string | null
  created_at: string
  updated_at: string
}

// --- Orders ---
export interface Order {
  id: string
  imweb_order_no: string
  customer_id: string
  total_amount: number
  ordered_at: string
  created_at: string
  // joined
  customer?: Customer
  items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  imweb_item_no: string
  product_id: string
  duration_days: number
  list_price: number
  allocated_amount: number
  is_addon: boolean
  raw_product_sku: string | null
  raw_option_sku: string | null
  raw_option_name: string | null
  created_at: string
  // joined
  product?: Product
}

// --- Subscriptions ---
export interface Subscription {
  id: string
  order_item_id: string | null
  customer_id: string
  product_id: string
  device_id: string | null
  status: 'live' | 'pending' | 'pause' | 'archive' | 'cancel'
  start_date: string | null
  end_date: string | null
  duration_days: number
  day: number
  memo: string | null
  paused_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  resume_date: string | null
  send_priority: 1 | 2 | 3 | 4
  // --- Day 시스템 새 필드 ---
  last_sent_day: number
  paused_days: number
  is_cancelled: boolean
  failure_type: 'failed' | null
  failure_date: string | null
  recovery_mode: 'bulk' | 'sequential' | null
  created_at: string
  updated_at: string
  // joined
  customer?: Customer
  product?: Product
  device?: SendDevice
}

// --- Day 시스템 계산 결과 ---
export type ComputedStatus = 'active' | 'pending' | 'completed' | 'paused' | 'cancelled'

export interface ComputedSubscription {
  current_day: number
  computed_status: ComputedStatus
  computed_end_date: string
  pending_days: number[]
  missed_days: number
}

// --- Messages ---
export interface Message {
  id: string
  product_id: string
  day_number: number
  sort_order: number
  content: string
  image_path: string | null
  created_at: string
  updated_at: string
}

export interface DailyMessage {
  id: string
  product_id: string
  send_date: string
  content: string
  image_path: string | null
  status: 'draft' | 'approved'
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProductPrompt {
  id: string
  product_id: string
  search_prompt: string
  generation_prompt: string
  created_at: string
  updated_at: string
}

export interface NoticeTemplate {
  id: string
  notice_type: 'start' | 'end'
  product_id: string | null
  content: string
  image_path: string | null
  created_at: string
  updated_at: string
}

// --- Send Devices ---
export interface SendDevice {
  id: string
  phone_number: string
  name: string | null
  color: string | null
  is_active: boolean
  last_heartbeat: string | null
  total_friends: number
  created_at: string
}

// --- Send Queues ---
export interface SendQueueItem {
  id: string
  subscription_id: string
  device_id: string
  send_date: string
  scheduled_at: string | null
  kakao_friend_name: string
  message_content: string
  image_path: string | null
  sort_order: number
  message_seq: string | null
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  error_message: string | null
  created_at: string
}

// --- CS Inquiries ---
export type CSCategory = 'message_never_received' | 'message_stopped' | 'pause_resume' | 'product_change' | 'cancel_refund' | 'delivery_time' | 'payment_info' | 'other'
export type CSStatus = 'pending' | 'ai_answered' | 'escalated' | 'admin_answered' | 'dismissed' | 'closed'

export interface CSInquiry {
  id: string
  customer_id: string
  category: CSCategory
  title: string
  content: string
  status: CSStatus
  subscription_id: string | null
  created_at: string
  updated_at: string
  // joined
  customer?: Customer
  subscription?: Subscription
  replies?: CSReply[]
}

export interface CSReply {
  id: string
  inquiry_id: string
  author_type: 'ai' | 'admin' | 'customer'
  author_name: string | null
  content: string
  action_taken: Record<string, any> | null
  created_at: string
}

export interface CSPolicy {
  id: string
  category: string
  title: string
  content: string
  ai_instruction: string | null
  sort_order: number
  updated_at: string
  updated_by: string | null
}

// --- CS Refund Requests ---
export type RefundStatus = 'pending' | 'approved' | 'completed' | 'rejected'
export type PaymentMethod = 'card' | 'bank_transfer'

export interface CSRefundRequest {
  id: string
  inquiry_id: string
  subscription_id: string
  customer_id: string

  // 결제 정보
  paid_amount: number
  paid_at: string | null

  // 환불 계산
  used_days: number
  total_days: number
  daily_rate: number
  used_amount: number
  penalty_amount: number
  refund_amount: number
  is_full_refund: boolean

  // 고객 입력
  payment_method: PaymentMethod
  bank_name: string | null
  account_number: string | null
  account_holder: string | null
  needs_account_info: boolean

  // 처리 상태
  status: RefundStatus
  admin_note: string | null
  reject_reason: string | null
  processed_by: string | null
  processed_at: string | null

  created_at: string
  updated_at: string

  // joined
  customer?: Customer
  subscription?: Subscription & { product?: Product }
  inquiry?: CSInquiry
}

// --- CS General Inquiries (비인증 기타 문의) ---
export interface CSGeneralInquiry {
  id: string
  email: string
  content: string
  is_read: boolean
  admin_note: string | null
  created_at: string
}
