'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
      setError('주문번호와 전화번호 뒷 4자리를 모두 입력해 주세요.')
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
        setError('잠시 후 다시 시도해 주세요. 인증 시도 횟수가 초과되었습니다.')
        return
      }

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '주문 정보가 일치하지 않습니다. 다시 확인해 주세요.')
        return
      }

      router.push('/cs/dashboard')
    } catch {
      setError('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100dvh-7rem)]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">고객센터</CardTitle>
          <CardDescription>주문 정보를 입력해 주시면 구독 현황을 확인하시고 문의하실 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orderNo">주문번호</Label>
              <Input
                id="orderNo"
                placeholder="예) 202601310884797"
                value={orderNo}
                onChange={e => setOrderNo(e.target.value)}
                disabled={loading}
                className="h-11 text-base"
              />
              <a
                href="https://1day1message.com/shop_mypage"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors py-1"
              >
                내 주문번호 조회하기
              </a>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneLast4">전화번호 뒷 4자리</Label>
              <Input
                id="phoneLast4"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0000"
                maxLength={4}
                value={phoneLast4}
                onChange={e => setPhoneLast4(e.target.value.replace(/\D/g, ''))}
                disabled={loading}
                className="h-11 text-base"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full min-h-[44px] text-base" disabled={loading}>
              {loading ? '조회 중...' : '조회하기'}
            </Button>
          </form>

          <div className="mt-4 pt-4 border-t text-center">
            <Link
              href="/cs/general"
              className="inline-block w-full"
            >
              <Button variant="outline" className="w-full min-h-[44px] text-base">
                기타 문의
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-2">
              주문번호가 없거나 협업 문의 등은 여기로 보내주세요
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
