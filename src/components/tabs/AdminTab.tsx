'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

type AdminSubTab = 'users' | 'devices'

// --- 사용자 관리 ---
function UsersPanel() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null | undefined>(undefined)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch('/api/admin/users'); setUsers(await res.json()) }
    catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{users.length}명</span>
        <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs bg-black text-white rounded-md hover:bg-gray-800">+ 사용자 추가</button>
      </div>
      {loading ? <p className="text-sm text-gray-400 py-4 text-center">로딩 중...</p> : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">아이디</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">이름</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">권한</th>
              <th className="text-center px-4 py-2.5 font-medium text-gray-600">상태</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">생성일</th>
            </tr></thead>
            <tbody>{users.map(u => (
              <tr key={u.id} onClick={() => setEditing(u)} className="border-b last:border-b-0 hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-2.5 font-mono text-xs">{u.username}</td>
                <td className="px-4 py-2.5">{u.name}</td>
                <td className="px-4 py-2.5">
                  <span className={cn('px-2 py-0.5 rounded text-xs', u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                    {u.role === 'admin' ? '관리자' : '스태프'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={cn('inline-block w-2 h-2 rounded-full', u.is_active ? 'bg-green-400' : 'bg-gray-300')} />
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{u.created_at?.slice(0, 10)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {editing !== undefined && <UserFormModal user={editing} onClose={() => setEditing(undefined)} onSaved={fetchUsers} />}
    </div>
  )
}

function UserFormModal({ user, onClose, onSaved }: { user: any | null; onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState(user?.username || '')
  const [name, setName] = useState(user?.name || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(user?.role || 'staff')
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!username || !name) { setError('아이디와 이름은 필수입니다'); return }
    if (!user && !password) { setError('비밀번호는 필수입니다'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user?.id, username, name, password: password || undefined, role, is_active: isActive })
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || '저장 실패'); return }
      onSaved(); onClose()
    } catch { setError('서버 연결 실패') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-bold mb-4">{user ? '사용자 수정' : '사용자 추가'}</h3>
          <div className="space-y-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">아이디</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} disabled={!!user}
                className="w-full px-3 py-2 border rounded-md text-sm disabled:bg-gray-100" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{user ? '새 비밀번호 (변경 시)' : '비밀번호'}</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">권한</label>
              <select value={role} onChange={e => setRole(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                <option value="staff">스태프</option><option value="admin">관리자</option>
              </select></div>
            {user && <div className="flex items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} id="user-active" className="rounded" />
              <label htmlFor="user-active" className="text-sm">활성</label>
            </div>}
          </div>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">취소</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-black text-white rounded-md disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- PC 장치 관리 ---
function DevicesPanel() {
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null | undefined>(undefined)

  const fetchDevices = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch('/api/admin/devices'); setDevices(await res.json()) }
    catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{devices.length}대</span>
        <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs bg-black text-white rounded-md hover:bg-gray-800">+ PC 추가</button>
      </div>
      {loading ? <p className="text-sm text-gray-400 py-4 text-center">로딩 중...</p> : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">카톡 번호</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">별칭</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-600">활성 구독</th>
              <th className="text-center px-4 py-2.5 font-medium text-gray-600">상태</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">마지막 연결</th>
            </tr></thead>
            <tbody>{devices.map(d => (
              <tr key={d.id} onClick={() => setEditing(d)} className="border-b last:border-b-0 hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-2.5 font-mono text-xs">{d.phone_number}</td>
                <td className="px-4 py-2.5">{d.name || '-'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{d.active_subscriptions || 0}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={cn('inline-block w-2 h-2 rounded-full', d.is_active ? 'bg-green-400' : 'bg-gray-300')} />
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{d.last_heartbeat?.slice(0, 16)?.replace('T', ' ') || '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {editing !== undefined && <DeviceFormModal device={editing} onClose={() => setEditing(undefined)} onSaved={fetchDevices} />}
    </div>
  )
}

function DeviceFormModal({ device, onClose, onSaved }: { device: any | null; onClose: () => void; onSaved: () => void }) {
  const [phoneNumber, setPhoneNumber] = useState(device?.phone_number || '')
  const [name, setName] = useState(device?.name || '')
  const [isActive, setIsActive] = useState(device?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!phoneNumber) { setError('전화번호는 필수입니다'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/devices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: device?.id, phone_number: phoneNumber, name: name || null, is_active: isActive })
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || '저장 실패'); return }
      onSaved(); onClose()
    } catch { setError('서버 연결 실패') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-bold mb-4">{device ? 'PC 수정' : 'PC 추가'}</h3>
          <div className="space-y-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">카톡 번호</label>
              <input type="text" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm" placeholder="010-0000-0000" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">별칭</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm" placeholder="PC 1" /></div>
            {device && <div className="flex items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} id="device-active" className="rounded" />
              <label htmlFor="device-active" className="text-sm">활성</label>
            </div>}
          </div>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">취소</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-black text-white rounded-md disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- 메인 탭 ---
export function AdminTab() {
  const [subTab, setSubTab] = useState<AdminSubTab>('users')

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">관리자 설정</h2>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {([['users', '사용자 관리'], ['devices', 'PC 장치 관리']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)}
            className={cn('px-4 py-1.5 text-sm rounded-md transition-colors',
              subTab === id ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700')}>
            {label}
          </button>
        ))}
      </div>
      {subTab === 'users' && <UsersPanel />}
      {subTab === 'devices' && <DevicesPanel />}
    </div>
  )
}
