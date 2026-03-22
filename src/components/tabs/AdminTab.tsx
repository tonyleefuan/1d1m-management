'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/ui/status-badge'
import { FormDialog } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonTable } from '@/components/ui/skeleton'
import { Toast } from '@/components/ui/Toast'
import { useToast } from '@/lib/use-toast'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { TABS } from '@/lib/constants'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Monitor, Plus, Palette, LayoutGrid, ArrowUp, ArrowDown, Sparkles, Save, Loader2 } from 'lucide-react'

// --- 사용자 관리 ---
function UsersPanel() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null | undefined>(undefined)
  const { toast, showSuccess, showError, clearToast } = useToast()

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) throw new Error('사용자 목록을 불러오지 못했습니다')
      setUsers(await res.json())
    } catch {
      showError('사용자 목록을 불러오지 못했습니다')
    } finally { setLoading(false) }
  }, [showError])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleSaved = useCallback(() => {
    fetchUsers()
    showSuccess(editing ? '사용자가 수정되었습니다' : '사용자가 추가되었습니다')
  }, [fetchUsers, showSuccess, editing])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">{users.length}명</span>
        <Button size="sm" onClick={() => setEditing(null)}>
          <Plus className="h-4 w-4 mr-1" />
          사용자 추가
        </Button>
      </div>
      {loading ? (
        <SkeletonTable cols={5} rows={5} />
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="등록된 사용자가 없습니다"
          description="새 사용자를 추가해보세요"
          action={{ label: '사용자 추가', onClick: () => setEditing(null) }}
        />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>아이디</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>권한</TableHead>
                <TableHead className="text-center">상태</TableHead>
                <TableHead>생성일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id} onClick={() => setEditing(u)} className="cursor-pointer">
                  <TableCell className="font-mono text-xs">{u.username}</TableCell>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={u.role === 'admin' ? 'info' : 'neutral'}>
                      {u.role === 'admin' ? '관리자' : '스태프'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={u.is_active ? 'success' : 'neutral'} variant="dot">
                      {u.is_active ? '활성' : '비활성'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.created_at?.slice(0, 10)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editing !== undefined && (
        <UserFormModal
          user={editing}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
          onError={showError}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}

function UserFormModal({ user, onClose, onSaved, onError }: {
  user: any | null
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [username, setUsername] = useState(user?.username || '')
  const [name, setName] = useState(user?.name || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(user?.role || 'staff')
  const [isActive, setIsActive] = useState(user?.is_active ?? true)

  const handleSubmit = async () => {
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user?.id, username, name, password: password || undefined, role, is_active: isActive })
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || '저장 실패')
    }
    onSaved()
  }

  const validate = () => {
    if (!username || !name) return '아이디와 이름은 필수입니다'
    if (!user && !password) return '비밀번호는 필수입니다'
    return null
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      title={user ? '사용자 수정' : '사용자 추가'}
      onSubmit={handleSubmit}
      validate={validate}
      size="sm"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="user-username">아이디</Label>
          <Input id="user-username" value={username} onChange={e => setUsername(e.target.value)} disabled={!!user} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-name">이름</Label>
          <Input id="user-name" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-password">{user ? '새 비밀번호 (변경 시)' : '비밀번호'}</Label>
          <Input id="user-password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>권한</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="staff">스태프</SelectItem>
              <SelectItem value="admin">관리자</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="user-active"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            <Label htmlFor="user-active">활성</Label>
          </div>
        )}
      </div>
    </FormDialog>
  )
}

// --- PC 장치 관리 ---
function DevicesPanel() {
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null | undefined>(undefined)
  const { toast, showSuccess, showError, clearToast } = useToast()

  const fetchDevices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/devices')
      if (!res.ok) throw new Error('장치 목록을 불러오지 못했습니다')
      const data = await res.json()
      setDevices(data)
    } catch {
      showError('장치 목록을 불러오지 못했습니다')
    } finally { setLoading(false) }
  }, [showError])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  const handleSaved = useCallback(() => {
    fetchDevices()
    showSuccess(editing ? 'PC가 수정되었습니다' : 'PC가 추가되었습니다')
  }, [fetchDevices, showSuccess, editing])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">{devices.length}대</span>
        <Button size="sm" onClick={() => setEditing(null)}>
          <Plus className="h-4 w-4 mr-1" />
          PC 추가
        </Button>
      </div>
      {loading ? (
        <SkeletonTable cols={5} rows={5} />
      ) : devices.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="등록된 PC가 없습니다"
          description="새 PC 장치를 추가해보세요"
          action={{ label: 'PC 추가', onClick: () => setEditing(null) }}
        />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>카톡 번호</TableHead>
                <TableHead>별칭</TableHead>
                <TableHead className="text-right">활성 구독</TableHead>
                <TableHead className="text-center">상태</TableHead>
                <TableHead>마지막 연결</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map(d => (
                <TableRow key={d.id} onClick={() => setEditing(d)} className="cursor-pointer">
                  <TableCell className="font-mono text-xs">{d.phone_number}</TableCell>
                  <TableCell>{d.name || '-'}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.active_subscriptions || 0}</TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={d.is_active ? 'success' : 'neutral'} variant="dot">
                      {d.is_active ? '활성' : '비활성'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {d.last_heartbeat?.slice(0, 16)?.replace('T', ' ') || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editing !== undefined && (
        <DeviceFormModal
          device={editing}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
          onError={showError}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}

function DeviceFormModal({ device, onClose, onSaved, onError }: {
  device: any | null
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [phoneNumber, setPhoneNumber] = useState(device?.phone_number || '')
  const [name, setName] = useState(device?.name || '')
  const [isActive, setIsActive] = useState(device?.is_active ?? true)

  const handleSubmit = async () => {
    const res = await fetch('/api/admin/devices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: device?.id, phone_number: phoneNumber, name: name || null, is_active: isActive })
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || '저장 실패')
    }
    onSaved()
  }

  const validate = () => {
    if (!phoneNumber) return '전화번호는 필수입니다'
    return null
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      title={device ? 'PC 수정' : 'PC 추가'}
      onSubmit={handleSubmit}
      validate={validate}
      size="sm"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="device-phone">카톡 번호</Label>
          <Input id="device-phone" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="010-0000-0000" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="device-name">별칭</Label>
          <Input id="device-name" value={name} onChange={e => setName(e.target.value)} placeholder="PC 1" />
        </div>
        {device && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="device-active"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            <Label htmlFor="device-active">활성</Label>
          </div>
        )}
      </div>
    </FormDialog>
  )
}

// --- 탭 순서 관리 ---
function TabOrderPanel() {
  const [tabList, setTabList] = useState<{ id: string; label: string; visible: boolean }[]>(
    TABS.map(t => ({ id: t.id, label: t.label, visible: t.visible }))
  )
  const [saving, setSaving] = useState(false)
  const { toast, showSuccess, showError, clearToast } = useToast()

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(settings => {
        if (settings.tab_order) {
          const order = settings.tab_order as { id: string; visible: boolean }[]
          const ordered = order
            .map(o => {
              const tab = TABS.find(t => t.id === o.id)
              return tab ? { id: tab.id, label: tab.label, visible: o.visible } : null
            })
            .filter((t): t is { id: string; label: string; visible: boolean } => t !== null)
          // Add missing tabs
          TABS.forEach(t => {
            if (!ordered.find(o => o.id === t.id)) {
              ordered.push({ id: t.id, label: t.label, visible: t.visible })
            }
          })
          setTabList(ordered)
        }
      })
      .catch(() => {})
  }, [])

  const moveTab = (index: number, direction: 'up' | 'down') => {
    const newTabs = [...tabList]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newTabs.length) return
    ;[newTabs[index], newTabs[targetIndex]] = [newTabs[targetIndex], newTabs[index]]
    setTabList(newTabs)
  }

  const toggleVisibility = (index: number) => {
    const newTabs = [...tabList]
    if (newTabs[index].id === 'admin') return // Can't hide admin
    newTabs[index] = { ...newTabs[index], visible: !newTabs[index].visible }
    setTabList(newTabs)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'tab_order',
          value: tabList.map(t => ({ id: t.id, visible: t.visible }))
        })
      })
      if (!res.ok) throw new Error()
      showSuccess('탭 순서가 저장되었습니다. 새로고침하면 적용됩니다.')
    } catch {
      showError('저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="space-y-1 mb-4">
        {tabList.map((tab, i) => (
          <div key={tab.id} className="flex items-center gap-3 px-3 py-2 bg-white border rounded-lg">
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => moveTab(i, 'up')}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === tabList.length - 1} onClick={() => moveTab(i, 'down')}>
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
            <span className="flex-1 text-sm">{tab.label}</span>
            <Switch
              size="sm"
              checked={tab.visible}
              onCheckedChange={() => toggleVisibility(i)}
              disabled={tab.id === 'admin'}
            />
          </div>
        ))}
      </div>
      <Button onClick={handleSave} disabled={saving}>
        {saving ? '저장 중...' : '순서 저장'}
      </Button>
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}

// --- AI 프롬프트 관리 ---
function PromptManagementPanel() {
  const [products, setProducts] = useState<any[]>([])
  const [prompts, setPrompts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [searchPrompt, setSearchPrompt] = useState('')
  const [generationPrompt, setGenerationPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast, showSuccess, showError, clearToast } = useToast()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [prodRes, promptRes] = await Promise.all([
        fetch('/api/products/list'),
        fetch('/api/ai/prompts'),
      ])
      if (!prodRes.ok) throw new Error('상품 목록 로드 실패')
      if (!promptRes.ok) throw new Error('프롬프트 로드 실패')
      const prodData = await prodRes.json()
      const promptData = await promptRes.json()
      const rtProducts = (prodData || []).filter((p: any) => p.message_type === 'realtime')
      setProducts(rtProducts)
      setPrompts(promptData.prompts || [])
      if (rtProducts.length > 0 && !selectedProduct) {
        setSelectedProduct(rtProducts[0].id)
      }
    } catch {
      showError('데이터를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [showError, selectedProduct])

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update textareas when product selection changes
  useEffect(() => {
    if (!selectedProduct) return
    const prompt = prompts.find((p: any) => p.product_id === selectedProduct)
    setSearchPrompt(prompt?.search_prompt || '')
    setGenerationPrompt(prompt?.generation_prompt || '')
  }, [selectedProduct, prompts])

  const handleSave = async () => {
    if (!selectedProduct) return
    setSaving(true)
    try {
      const res = await fetch('/api/ai/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct,
          search_prompt: searchPrompt,
          generation_prompt: generationPrompt,
        }),
      })
      if (!res.ok) throw new Error('저장 실패')
      showSuccess('프롬프트가 저장되었습니다')
      // Update local state
      setPrompts(prev => {
        const existing = prev.findIndex((p: any) => p.product_id === selectedProduct)
        const updated = { product_id: selectedProduct, search_prompt: searchPrompt, generation_prompt: generationPrompt }
        if (existing >= 0) {
          const next = [...prev]
          next[existing] = { ...next[existing], ...updated }
          return next
        }
        return [...prev, updated]
      })
    } catch {
      showError('프롬프트 저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="실시간 상품이 없습니다"
        description="프롬프트를 설정할 실시간(realtime) 상품이 없습니다"
      />
    )
  }

  return (
    <div className="flex gap-4">
      {/* Product list */}
      <Card className="w-64 shrink-0 overflow-hidden">
        <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
          {products.map((p: any) => {
            const hasPrompt = prompts.some((pr: any) => pr.product_id === p.id)
            return (
              <button
                key={p.id}
                onClick={() => setSelectedProduct(p.id)}
                className={cn(
                  'w-full text-left px-4 py-3 text-sm border-b last:border-b-0 hover:bg-muted/50 transition-colors',
                  selectedProduct === p.id && 'bg-accent text-accent-foreground font-medium border-l-2 border-l-primary'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.sku_code}</span>
                  {hasPrompt && (
                    <StatusBadge status="success" className="text-[10px]">설정됨</StatusBadge>
                  )}
                </div>
                <div className="mt-1 text-xs leading-relaxed">{p.title}</div>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Prompt editor */}
      <div className="flex-1 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">검색 프롬프트 (Search Prompt)</Label>
              <p className="text-xs text-muted-foreground">뉴스/기사 검색 시 사용되는 프롬프트입니다.</p>
              <Textarea
                value={searchPrompt}
                onChange={e => setSearchPrompt(e.target.value)}
                rows={6}
                className="font-mono text-sm"
                placeholder="검색 프롬프트를 입력하세요..."
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">생성 프롬프트 (Generation Prompt)</Label>
              <p className="text-xs text-muted-foreground">메시지 생성 시 Claude에게 전달되는 프롬프트입니다.</p>
              <Textarea
                value={generationPrompt}
                onChange={e => setGenerationPrompt(e.target.value)}
                rows={10}
                className="font-mono text-sm"
                placeholder="생성 프롬프트를 입력하세요..."
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                저장
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  )
}

// --- 메인 탭 ---
export function AdminTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="관리자 설정"
          description="사용자 계정과 PC 장치를 관리합니다"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open('/design-preview', '_blank')}
        >
          <Palette className="h-4 w-4 mr-1.5" />
          디자인 시스템
        </Button>
      </div>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-4 w-4" />
            사용자 관리
          </TabsTrigger>
          <TabsTrigger value="devices" className="gap-1.5">
            <Monitor className="h-4 w-4" />
            PC 장치 관리
          </TabsTrigger>
          <TabsTrigger value="tabs" className="gap-1.5">
            <LayoutGrid className="h-4 w-4" />
            탭 관리
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersPanel />
        </TabsContent>
        <TabsContent value="devices">
          <DevicesPanel />
        </TabsContent>
        <TabsContent value="tabs">
          <TabOrderPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
