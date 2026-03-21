'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TABS } from '@/lib/constants'
import dynamic from 'next/dynamic'

const ProductsTab = dynamic(() => import('./tabs/ProductsTab').then(m => ({ default: m.ProductsTab })))
const OrdersTab = dynamic(() => import('./tabs/OrdersTab').then(m => ({ default: m.OrdersTab })))
const SubscriptionsTab = dynamic(() => import('./tabs/SubscriptionsTab').then(m => ({ default: m.SubscriptionsTab })))
const MessagesTab = dynamic(() => import('./tabs/MessagesTab').then(m => ({ default: m.MessagesTab })))
const SendingTab = dynamic(() => import('./tabs/SendingTab').then(m => ({ default: m.SendingTab })))
const AdminTab = dynamic(() => import('./tabs/AdminTab').then(m => ({ default: m.AdminTab })))

interface Props {
  userName: string
  userRole: string
}

export function Dashboard({ userName, userRole }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.slice(1)
      if (TABS.some(t => t.id === hash)) return hash
    }
    return TABS[0].id
  })

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (TABS.some(t => t.id === hash)) setTab(hash)
  }, [])

  const handleTabChange = useCallback((id: string) => {
    setTab(id)
    window.location.hash = id
  }, [])

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 h-12 flex items-center justify-between">
          <h1 className="text-sm font-bold">1D1M Management</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{userName} ({userRole})</span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-[1400px] mx-auto px-4 flex gap-0 overflow-x-auto">
          {TABS.filter(t => t.visible).map(t => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-black text-black font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Tab Content */}
      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {tab === 'orders' && <OrdersTab />}
        {tab === 'subscriptions' && <SubscriptionsTab />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'products' && <ProductsTab />}
        {tab === 'sending' && <SendingTab />}
        {tab === 'admin' && <AdminTab />}
      </main>
    </div>
  )
}
