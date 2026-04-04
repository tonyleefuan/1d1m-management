'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function GeneralAuthPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('올바른 이메일 주소를 입력해 주세요.')
      return
    }
    if (!pin.trim() || !/^\d{4}$/.test(pin.trim())) {
      setError('비밀번호 4자리(숫자)를 입력해 주세요.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/cs/general/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), pin: pin.trim() }),
      })

      if (res.status === 429) {
        setError('잠시 후 다시 시도해 주세요.')
        return
      }

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '로그인에 실패했습니다.')
        return
      }

      router.push('/cs/general/dashboard')
    } catch {
      setError('일시적인 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100dvh-7rem)]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">기타 문의</CardTitle>
          <CardDescription>
            이메일과 비밀번호 4자리를 입력하시면 문의를 남기고 확인하실 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
                className="h-11 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">비밀번호 (숫자 4자리)</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="••••"
                maxLength={4}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                disabled={loading}
                className="h-11 text-base"
              />
              <p className="text-xs text-muted-foreground">
                처음 문의하시는 경우 입력하신 비밀번호가 등록됩니다
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full min-h-[44px] text-base" disabled={loading}>
              {loading ? '확인 중...' : '확인'}
            </Button>
          </form>

          <div className="mt-4 pt-4 border-t text-center">
            <Link
              href="/cs"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
            >
              주문번호로 구독 문의하기
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
