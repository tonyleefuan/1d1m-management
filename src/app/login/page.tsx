'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '로그인에 실패했습니다')
        return
      }

      router.push('/')
      router.refresh()
    } catch {
      setError('서버 연결에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6f5f4]">
      <div className="w-full max-w-sm">
        <Card className="p-8">
          <CardContent className="p-0">
            <h1 className="text-section-heading text-center mb-1">1D1M Management</h1>
            <p className="text-[14px] text-[#615d59] text-center mb-6">1Day1Message 운영 대시보드</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">아이디</label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="아이디를 입력하세요"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">비밀번호</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  required
                />
              </div>

              {error && (
                <p className="text-[13px] text-[#e5484d]">{error}</p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? '로그인 중...' : '로그인'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
