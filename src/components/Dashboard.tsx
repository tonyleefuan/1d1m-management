'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TABS, TabConfig } from '@/lib/constants'
import dynamic from 'next/dynamic'

const ProductsTab = dynamic(() => import('./tabs/ProductsTab').then(m => ({ default: m.ProductsTab })))
const OrdersTab = dynamic(() => import('./tabs/OrdersTab').then(m => ({ default: m.OrdersTab })))
const SubscriptionsTab = dynamic(() => import('./tabs/SubscriptionsTab').then(m => ({ default: m.SubscriptionsTab })))
const MessagesTab = dynamic(() => import('./tabs/MessagesTab').then(m => ({ default: m.MessagesTab })))
const SendingTab = dynamic(() => import('./tabs/SendingTab').then(m => ({ default: m.SendingTab })))
const AdminTab = dynamic(() => import('./tabs/AdminTab').then(m => ({ default: m.AdminTab })))

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  orders: OrdersTab,
  subscriptions: SubscriptionsTab,
  messages: MessagesTab,
  products: ProductsTab,
  sending: SendingTab,
  admin: AdminTab,
}

function getHashTab(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.slice(1)
  return TABS.some(t => t.id === hash) ? hash : null
}

interface Props {
  userName: string
  userRole: string
}

export function Dashboard({ userName, userRole }: Props) {
  const router = useRouter()
  const [tabs, setTabs] = useState<TabConfig[]>(TABS)
  const [tab, setTab] = useState(() => getHashTab() || TABS[0].id)

  // Sync tab state with hash changes (browser back/forward)
  useEffect(() => {
    const onHashChange = () => {
      const hashTab = getHashTab()
      if (hashTab) setTab(hashTab)
    }
    window.addEventListener('hashchange', onHashChange)
    // Also sync on popstate for browser navigation
    window.addEventListener('popstate', onHashChange)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('popstate', onHashChange)
    }
  }, [])

  // Fetch saved tab order from DB
  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(settings => {
        if (settings.tab_order) {
          const order = settings.tab_order as { id: string; visible: boolean }[]
          const ordered = order
            .map(o => {
              const t = TABS.find(tab => tab.id === o.id)
              return t ? { ...t, visible: o.visible } : null
            })
            .filter((t): t is TabConfig => t !== null)
          // Add any new tabs not in saved order
          TABS.forEach(t => {
            if (!ordered.find(o => o.id === t.id)) ordered.push(t)
          })
          setTabs(ordered)
          // If current tab is hidden, switch to first visible
          const visibleTabs = ordered.filter(t => t.visible)
          const currentHash = getHashTab()
          const currentTab = currentHash || TABS[0].id
          if (visibleTabs.length > 0 && !visibleTabs.find(t => t.id === currentTab)) {
            const first = visibleTabs[0].id
            setTab(first)
            window.history.replaceState(null, '', `#${first}`)
          }
        }
      })
      .catch(() => {})
  }, [])

  const handleTabChange = useCallback((id: string) => {
    setTab(id)
    // replaceState instead of setting hash to avoid creating extra history entries
    window.history.replaceState(null, '', `#${id}`)
  }, [])

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }, [router])

  const ActiveTab = TAB_COMPONENTS[tab]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 h-12 flex items-center justify-between">
          <img src="/logo.png" alt="1Day1Message" className="h-5" />
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
          {tabs.filter(t => t.visible).map(t => (
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
        {ActiveTab && <ActiveTab />}
      </main>
    </div>
  )
}
