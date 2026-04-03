'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function CSAuthPage() {
  const router = useRouter()
  const [orderNo, setOrderNo] = useState('')
  const [phoneLast4, setPhoneLast4] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!orderNo.trim() || !phoneLast4.trim()) {
      setError('주문번호와 전화번호 뒷 4자리를 입력해 주세요.')
      return
    }
    if (phoneLast4.trim().length !== 4) {
      setError('전화번호 뒷 4자리를 정확히 입력해 주세요.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/cs/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNo: orderNo.trim(), phoneLast4: phoneLast4.trim() }),
      })

      if (res.status === 429) {
        setError('인증 시도 횟수를 초과했습니다. 15분 후 다시 시도해 주세요.')
        return
      }

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '인증에 실패했습니다.')
        return
      }

      router.push('/cs/dashboard')
    } catch {
      setError('서버 연결에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">고객 문의</CardTitle>
          <CardDescription>주문 정보를 입력하시면 구독 현황 조회 및 문의가 가능합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orderNo">주문번호</Label>
              <Input
                id="orderNo"
                placeholder="주문번호를 입력해 주세요"
                value={orderNo}
                onChange={e => setOrderNo(e.target.value)}
                disabled={loading}
              />
              <a
                href="https://1day1message.com/shop_mypage"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
              >
                내 주문번호 조회하기
              </a>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneLast4">전화번호 뒷 4자리</Label>
              <Input
                id="phoneLast4"
                placeholder="0000"
                maxLength={4}
                value={phoneLast4}
                onChange={e => setPhoneLast4(e.target.value.replace(/\D/g, ''))}
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '조회 중...' : '조회하기'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
