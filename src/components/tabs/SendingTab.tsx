'use client'

import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Radio } from 'lucide-react'

export function SendingTab() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="발송 모니터링"
        description="PC별 발송 현황과 성공률을 모니터링합니다"
      />
      <Card>
        <CardContent className="py-12">
          <EmptyState
            icon={Radio}
            title="준비 중입니다"
            description="매크로 프로그램 연동 후 발송 현황을 확인할 수 있습니다"
          />
        </CardContent>
      </Card>
    </div>
  )
}
