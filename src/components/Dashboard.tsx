'use client'

import { useState, useCallback, useEffect, useRef, Component, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { TABS, TabConfig } from '@/lib/constants'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

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

// 모든 유효한 탭 ID 집합 (TABS 원본 기준)
const VALID_TAB_IDS = new Set(TABS.map(t => t.id))

function getHashTab(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.slice(1)
  return VALID_TAB_IDS.has(hash) ? hash : null
}

// ─── Error Boundary ─────────────────────────────────────
// 탭 컴포넌트가 크래시해도 전체 페이지가 죽지 않도록 보호

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: ReactNode
  resetKey: string
}

interface ErrorBoundaryState {
  hasError: boolean
}

class TabErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

// ─── Dashboard ──────────────────────────────────────────

interface Props {
  userName: string
  userRole: string
}

export function Dashboard({ userName, userRole }: Props) {
  const router = useRouter()
  const [tabs, setTabs] = useState<TabConfig[]>(TABS)
  const [tab, setTab] = useState(() => getHashTab() || TABS[0].id)
  const [ready, setReady] = useState(false)
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  // Fetch saved tab order from DB
  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => {
        if (!r.ok) throw new Error('설정 로드 실패')
        return r.json()
      })
      .then(settings => {
        if (settings.tab_order && Array.isArray(settings.tab_order)) {
          const order = settings.tab_order as { id: string; visible: boolean }[]
          const ordered = order
            .filter(o => VALID_TAB_IDS.has(o.id))
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

          // Validate current tab against visible tabs
          const visibleTabs = ordered.filter(t => t.visible)
          if (visibleTabs.length > 0) {
            const hashTab = getHashTab()
            const currentTab = hashTab || tab
            const isCurrentVisible = visibleTabs.some(t => t.id === currentTab)
            if (!isCurrentVisible) {
              const first = visibleTabs[0].id
              setTab(first)
              window.history.replaceState(null, '', `#${first}`)
            }
          }
        }
      })
      .catch(() => {
        // 설정 로드 실패 시 기본 TABS 사용 (이미 초기값)
      })
      .finally(() => setReady(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync tab state with hash changes (browser back/forward)
  useEffect(() => {
    const onHashChange = () => {
      const hashTab = getHashTab()
      if (!hashTab) return
      // 현재 visible 탭 목록에서만 허용
      const visibleTabs = tabsRef.current.filter(t => t.visible)
      if (visibleTabs.some(t => t.id === hashTab)) {
        setTab(hashTab)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('popstate', onHashChange)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('popstate', onHashChange)
    }
  }, [])

  const handleTabChange = useCallback((id: string) => {
    if (id === tab) return
    setTab(id)
    window.history.pushState(null, '', `#${id}`)
  }, [tab])

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }, [router])

  const ActiveTab = TAB_COMPONENTS[tab]
  const visibleTabs = tabs.filter(t => t.visible)

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="bg-background sticky top-0 z-50 border-b">
        <div className="max-w-[1400px] mx-auto px-4 h-12 flex items-center justify-between">
          <img src="/logo.png" alt="1Day1Message" className="h-5" />
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{userName} ({userRole})</span>
            <button
              onClick={handleLogout}
              className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-background border-b">
        <div className="max-w-[1400px] mx-auto px-4 flex gap-0 overflow-x-auto">
          {!ready ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-4 py-2.5">
                <Skeleton className="h-5 w-16" />
              </div>
            ))
          ) : (
            visibleTabs.map(t => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-foreground text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))
          )}
        </div>
      </nav>

      {/* Tab Content */}
      <main className="max-w-[1400px] mx-auto px-4 py-6">
        <TabErrorBoundary
          resetKey={tab}
          fallback={
            <div className="text-center py-20">
              <p className="text-lg font-medium mb-2">탭을 불러오는 중 오류가 발생했습니다</p>
              <p className="text-muted-foreground mb-4">다른 탭을 선택하거나 새로고침해 주세요.</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
              >
                새로고침
              </button>
            </div>
          }
        >
          {ActiveTab && <ActiveTab />}
        </TabErrorBoundary>
      </main>
    </div>
  )
}
