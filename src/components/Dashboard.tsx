'use client'

import { useState, useCallback, useEffect, useRef, Component, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { TABS, TabConfig } from '@/lib/constants'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ProductsTab = dynamic(() => import('./tabs/ProductsTab').then(m => ({ default: m.ProductsTab })))
const OrdersTab = dynamic(() => import('./tabs/OrdersTab').then(m => ({ default: m.OrdersTab })))
const SubscriptionsTab = dynamic(() => import('./tabs/SubscriptionsTab').then(m => ({ default: m.SubscriptionsTab })))
const MessagesTab = dynamic(() => import('./tabs/MessagesTab').then(m => ({ default: m.MessagesTab })))
const SendingTab = dynamic(() => import('./tabs/SendingTab').then(m => ({ default: m.SendingTab })))
const AdminTab = dynamic(() => import('./tabs/AdminTab').then(m => ({ default: m.AdminTab })))
const CSTab = dynamic(() => import('./tabs/CSTab').then(m => ({ default: m.CSTab })))

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  orders: OrdersTab,
  subscriptions: SubscriptionsTab,
  messages: MessagesTab,
  products: ProductsTab,
  sending: SendingTab,
  admin: AdminTab,
  cs: CSTab,
}

// 모든 유효한 탭 ID 집합 (TABS 원본 기준)
const VALID_TAB_IDS = new Set(TABS.map(t => t.id))

/** URL pathname에서 탭 ID 추출 */
function getPathTab(): string | null {
  if (typeof window === 'undefined') return null
  const seg = window.location.pathname.split('/').filter(Boolean)[0]
  return seg && VALID_TAB_IDS.has(seg) ? seg : null
}

/** 탭 ID → URL 경로 (첫 번째 탭은 /) */
function tabToPath(id: string, firstTabId: string): string {
  return id === firstTabId ? '/' : `/${id}`
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
  initialTab: string | null
}

export function Dashboard({ userName, userRole, initialTab }: Props) {
  const router = useRouter()
  const [tabs, setTabs] = useState<TabConfig[]>(TABS)
  const [tab, setTab] = useState(() => initialTab || getPathTab() || TABS[0].id)
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
            const pathTab = getPathTab()
            const currentTab = pathTab || tab
            const isCurrentVisible = visibleTabs.some(t => t.id === currentTab)
            if (!isCurrentVisible) {
              const first = visibleTabs[0].id
              setTab(first)
              window.history.replaceState(null, '', tabToPath(first, ordered[0]?.id || TABS[0].id))
            }
          }
        }
      })
      .catch((err) => {
        // 설정 로드 실패 시 기본 TABS 사용 (이미 초기값)
        console.error('탭 설정 로드 실패:', err)
      })
      .finally(() => setReady(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync tab state with popstate (browser back/forward)
  useEffect(() => {
    const onPopState = () => {
      const pathTab = getPathTab()
      const visibleTabs = tabsRef.current.filter(t => t.visible)
      const firstTabId = visibleTabs[0]?.id || TABS[0].id

      // / (루트)이면 첫 번째 탭
      if (!pathTab) {
        if (visibleTabs.length > 0) {
          setTab(firstTabId)
        }
        return
      }

      if (visibleTabs.some(t => t.id === pathTab)) {
        setTab(pathTab)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  const handleTabChange = useCallback((id: string) => {
    if (id === tab) return
    setTab(id)
    const visibleTabs = tabsRef.current.filter(t => t.visible)
    const firstTabId = visibleTabs[0]?.id || TABS[0].id
    window.history.pushState(null, '', tabToPath(id, firstTabId))
  }, [tab])

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }, [router])

  const ActiveTab = TAB_COMPONENTS[tab]
  const visibleTabs = tabs.filter(t => t.visible)
  const firstTabId = visibleTabs[0]?.id || TABS[0].id

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white sticky top-0 z-50 border-b border-[rgba(0,0,0,0.1)]">
        <div className="max-w-[1400px] mx-auto px-6 h-12 flex items-center justify-between">
          <img src="/logo.png" alt="1Day1Message" className="h-5" />
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[#a39e98]">{userName} ({userRole})</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-[13px] text-[#a39e98] hover:text-foreground h-auto px-2 py-1"
            >
              로그아웃
            </Button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b border-[rgba(0,0,0,0.1)]">
        <div className="max-w-[1400px] mx-auto px-6 flex gap-0 overflow-x-auto">
          {!ready ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-4 py-2.5">
                <Skeleton className="h-5 w-16" />
              </div>
            ))
          ) : (
            visibleTabs.map(t => (
              <a
                key={t.id}
                href={tabToPath(t.id, firstTabId)}
                onClick={(e) => {
                  // Cmd+Click 또는 Ctrl+Click → 새 탭에서 열기 (기본 동작)
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                  e.preventDefault()
                  handleTabChange(t.id)
                }}
                className={cn(
                  'px-4 py-2.5 text-[14px] whitespace-nowrap border-b-2 transition-colors inline-flex items-center',
                  tab === t.id
                    ? 'border-foreground text-foreground font-medium'
                    : 'border-transparent text-[#a39e98] hover:text-[#615d59]'
                )}
              >
                {t.label}
              </a>
            ))
          )}
        </div>
      </nav>

      {/* Tab Content */}
      <main className="max-w-[1400px] mx-auto px-6 py-6 bg-[#f6f5f4] min-h-[calc(100vh-97px)]">
        <TabErrorBoundary
          resetKey={tab}
          fallback={
            <div className="text-center py-20">
              <p className="text-lg font-medium mb-2">탭을 불러오는 중 오류가 발생했습니다</p>
              <p className="text-muted-foreground mb-4">다른 탭을 선택하거나 새로고침해 주세요.</p>
              <Button
                size="sm"
                onClick={() => window.location.reload()}
              >
                새로고침
              </Button>
            </div>
          }
        >
          {ActiveTab && <ActiveTab />}
        </TabErrorBoundary>
      </main>
    </div>
  )
}
