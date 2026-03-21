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
  channel: 'kakaotalk' | 'imessage'
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
  email: string | null
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
  channel: 'kakaotalk' | 'imessage'
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
  auto_confirmed: boolean
  friend_confirmed: boolean
  friend_confirmed_at: string | null
  memo: string | null
  paused_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  last_send_failure: string | null
  resume_date: string | null
  created_at: string
  updated_at: string
  // joined
  customer?: Customer
  product?: Product
  device?: SendDevice
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
  created_by: string | null
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
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  error_message: string | null
  created_at: string
}

// --- Send Logs ---
export interface SendLog {
  id: string
  subscription_id: string
  device_id: string
  send_date: string
  day_number: number | null
  status: 'sent' | 'failed'
  sent_at: string | null
  message_preview: string | null
  created_at: string
}
