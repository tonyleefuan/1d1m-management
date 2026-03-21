'use client'

import { useState } from 'react'
import { PageHeader, SectionHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonTable } from '@/components/ui/skeleton'
import { MetricCard } from '@/components/ui/metric-card'
import { StatGroup } from '@/components/ui/stat-group'
import { FilterBar } from '@/components/ui/filter-bar'
import { FormDialog } from '@/components/ui/form-dialog'
import { Timeline } from '@/components/ui/timeline'
import { DetailSection, InfoRow } from '@/components/ui/detail-section'
import { KeyValue, KeyValueGrid } from '@/components/ui/key-value'
import { SmartSelect, type SelectOption } from '@/components/ui/smart-select'
import { DatePicker } from '@/components/ui/date-picker'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Toast } from '@/components/ui/Toast'
import { Spinner } from '@/components/ui/spinner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { InlineBanner } from '@/components/ui/inline-banner'
import { Separator } from '@/components/ui/separator'
import {
  CellCode, CellCurrency, CellCurrencyKr, CellNumber, CellPercent,
  CellDate, CellStatus, CellTags, CellLink, CellToggle, CellImage,
} from '@/components/ui/column-types'
import {
  ArrowLeft, Users, Package, MessageSquare, Monitor,
  ShoppingCart, Plus, TrendingUp, Calendar, Send,
  AlertCircle, Check,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════
 *  1D1M 디자인 시스템 프리뷰
 *  관리자 설정 > 디자인 시스템 버튼으로 접근
 * ═══════════════════════════════════════════════════ */

/** 컴포넌트 ID 뱃지 — 클릭하면 import 경로 복사 */
function ComponentId({ name, path }: { name: string; path?: string }) {
  const [copied, setCopied] = useState(false)
  const importPath = path ?? `@/components/ui/${name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '').replace(/-+/g, '-')}`
  const copyText = `import { ${name} } from '${importPath}'`
  const handleCopy = () => {
    navigator.clipboard.writeText(copyText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
      title={`클릭하여 복사: ${copyText}`}
    >
      {copied ? '복사됨' : `<${name} />`}
    </button>
  )
}

const NAV_ITEMS = [
  { id: 'global', label: '글로벌 설정' },
  { id: 'colors', label: '컬러' },
  { id: 'layout', label: '레이아웃' },
  { id: 'data', label: '데이터 표시' },
  { id: 'input', label: '입력 & 필터' },
  { id: 'feedback', label: '피드백 & 상태' },
  { id: 'column-types', label: '칼럼 타입' },
  { id: 'tables', label: '테이블' },
]

const COLOR_PALETTE = {
  brand: [
    { name: '1d1m-yellow', label: '1D1M Yellow', var: '--1d1m-yellow', hex: '#FFD700', hsl: 'hsl(51 100% 50%)', usage: '1D1M 브랜드, 강조, 헤더' },
    { name: '1d1m-black', label: '1D1M Black', var: '--1d1m-black', hex: '#111111', hsl: 'hsl(0 0% 6.7%)', usage: '텍스트, 버튼, 로고 배경' },
  ],
  semantic: [
    { name: 'primary', label: 'Primary', var: '--primary', hex: '#0f0f11', usage: '버튼, 주요 액션' },
    { name: 'foreground', label: 'Foreground', var: '--foreground', hex: '#0f0f11', usage: '기본 텍스트' },
    { name: 'muted-fg', label: 'Muted Foreground', var: '--muted-foreground', hex: '#6b6b76', usage: '보조 텍스트, 라벨' },
    { name: 'destructive', label: 'Destructive', var: '--destructive', hex: '#ef4444', usage: '삭제, 에러' },
    { name: 'emerald', label: 'Success Green', var: null, hex: '#059669', usage: '성공, 활성, 양수' },
  ],
  background: [
    { name: 'background', label: 'Background', var: '--background', hex: '#ffffff', usage: '기본 배경' },
    { name: 'surface', label: 'Surface', var: '--surface', hex: '#f8f8f8', usage: '페이지 배경' },
    { name: 'surface-alt', label: 'Surface Alt', var: '--surface-alt', hex: '#f0f0f0', usage: '구분 배경' },
    { name: 'muted', label: 'Muted', var: '--muted', hex: '#f4f4f5', usage: '비활성, 테이블 헤더' },
    { name: 'border', label: 'Border', var: '--border', hex: '#e4e4e7', usage: '테두리' },
  ],
}

export default function DesignPreviewPage() {
  const [activeSection, setActiveSection] = useState('global')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterTab, setFilterTab] = useState('all')
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dateVal, setDateVal] = useState('2026-03-22')
  const [selectVal, setSelectVal] = useState('pc1')
  const [smartOptions] = useState<SelectOption[]>([
    { value: 'pc1', label: 'PC 1호기', description: '010-1234-5678' },
    { value: 'pc2', label: 'PC 2호기', description: '010-2345-6789' },
    { value: 'pc3', label: 'PC 3호기', description: '010-3456-7890' },
  ])
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [switchOn, setSwitchOn] = useState(true)
  const [checkboxOn, setCheckboxOn] = useState(true)

  const scrollTo = (id: string) => {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── 상단 네비게이션 ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="px-8 py-3 flex items-center gap-6">
          <button
            onClick={() => { window.close(); window.location.href = '/' }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            돌아가기
          </button>
          <div className="h-5 w-px bg-border shrink-0" />
          <div className="shrink-0">
            <h1 className="text-lg font-bold">디자인 시스템</h1>
            <p className="text-xs text-muted-foreground -mt-0.5">1D1M Management 공통 컴포넌트 프리뷰</p>
          </div>
          <div className="flex gap-1 ml-auto">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeSection === item.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 콘텐츠 ── */}
      <div className="px-8 py-10 space-y-16 max-w-[1400px] mx-auto">

        {/* ═══════════════ 1. 글로벌 설정 ═══════════════ */}
        <section id="global">
          <SectionHeader title="글로벌 설정" />
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">브랜드 컬러</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#FFD700] border" />
                  <div>
                    <p className="text-sm font-medium">1D1M Yellow — #FFD700</p>
                    <p className="text-xs text-muted-foreground">hsl(51 100% 50%)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#111111] border" />
                  <div>
                    <p className="text-sm font-medium">1D1M Black — #111111</p>
                    <p className="text-xs text-muted-foreground">hsl(0 0% 6.7%)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">타이포그래피 & 레이아웃</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">폰트:</span> Pretendard Variable</p>
                <p><span className="text-muted-foreground">최소 폭:</span> 1400px</p>
                <p><span className="text-muted-foreground">카드:</span> rounded-xl, shadow-sm, border</p>
                <p><span className="text-muted-foreground">간격:</span> space-y-6 (섹션), gap-4 (그리드)</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ═══════════════ 2. 컬러 ═══════════════ */}
        <section id="colors">
          <SectionHeader title="컬러 팔레트" />

          {/* Brand */}
          <h3 className="text-sm font-semibold mt-6 mb-3">Brand</h3>
          <div className="grid grid-cols-2 gap-3">
            {COLOR_PALETTE.brand.map((c) => (
              <div key={c.name} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <div className="w-10 h-10 rounded-lg border flex-shrink-0" style={{ backgroundColor: c.hex }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.var} / {c.hex}</p>
                  <p className="text-xs text-muted-foreground">{c.usage}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Semantic */}
          <h3 className="text-sm font-semibold mt-6 mb-3">Semantic</h3>
          <div className="grid grid-cols-3 gap-3">
            {COLOR_PALETTE.semantic.map((c) => (
              <div key={c.name} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <div className="w-8 h-8 rounded-md border flex-shrink-0" style={{ backgroundColor: c.hex }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.var ?? 'tailwind'} / {c.hex}</p>
                  <p className="text-xs text-muted-foreground">{c.usage}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Background */}
          <h3 className="text-sm font-semibold mt-6 mb-3">Background</h3>
          <div className="grid grid-cols-3 gap-3">
            {COLOR_PALETTE.background.map((c) => (
              <div key={c.name} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <div className="w-8 h-8 rounded-md border flex-shrink-0" style={{ backgroundColor: c.hex }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.var} / {c.hex}</p>
                  <p className="text-xs text-muted-foreground">{c.usage}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════ 3. 레이아웃 ═══════════════ */}
        <section id="layout">
          <SectionHeader title="레이아웃" />

          {/* PageHeader */}
          <div className="mt-6 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">PageHeader</h3>
                <ComponentId name="PageHeader" path="@/components/ui/page-header" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <PageHeader title="구독 관리" description="활성 구독 현황을 관리합니다">
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" />구독 추가</Button>
                  </PageHeader>
                </CardContent>
              </Card>
            </div>

            {/* SectionHeader */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">SectionHeader</h3>
                <ComponentId name="SectionHeader" path="@/components/ui/page-header" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <SectionHeader title="오늘의 발송 현황">
                    <Button variant="outline" size="sm">상세 보기</Button>
                  </SectionHeader>
                </CardContent>
              </Card>
            </div>

            {/* Card */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Card</h3>
                <ComponentId name="Card" path="@/components/ui/card" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm">기본 카드</CardTitle></CardHeader>
                  <CardContent><p className="text-sm text-muted-foreground">CardHeader + CardContent 조합</p></CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium">헤더 없는 카드</p>
                    <p className="text-xs text-muted-foreground mt-1">CardContent만 사용</p>
                  </CardContent>
                </Card>
                <Card className="border-[hsl(var(--1d1m-yellow))] bg-[hsl(var(--1d1m-yellow))]/5">
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium">브랜드 강조 카드</p>
                    <p className="text-xs text-muted-foreground mt-1">1D1M Yellow 테두리</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Tabs */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Tabs</h3>
                <ComponentId name="Tabs" path="@/components/ui/tabs" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <Tabs defaultValue="messages">
                    <TabsList>
                      <TabsTrigger value="messages" className="gap-1.5"><MessageSquare className="h-4 w-4" />메시지</TabsTrigger>
                      <TabsTrigger value="subscribers" className="gap-1.5"><Users className="h-4 w-4" />구독자</TabsTrigger>
                      <TabsTrigger value="devices" className="gap-1.5"><Monitor className="h-4 w-4" />PC 장치</TabsTrigger>
                    </TabsList>
                    <TabsContent value="messages"><p className="text-sm text-muted-foreground py-4">메시지 관리 영역</p></TabsContent>
                    <TabsContent value="subscribers"><p className="text-sm text-muted-foreground py-4">구독자 목록 영역</p></TabsContent>
                    <TabsContent value="devices"><p className="text-sm text-muted-foreground py-4">PC 장치 관리 영역</p></TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ═══════════════ 4. 데이터 표시 ═══════════════ */}
        <section id="data">
          <SectionHeader title="데이터 표시" />

          {/* MetricCard */}
          <div className="mt-6 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">MetricCard</h3>
                <ComponentId name="MetricCard" path="@/components/ui/metric-card" />
              </div>
              <div className="grid grid-cols-4 gap-4">
                <MetricCard title="활성 구독" value="1,284" change="+12.5%" trend="up" icon={Users} />
                <MetricCard title="오늘 발송" value="1,152" change="-3.2%" trend="down" icon={Send} />
                <MetricCard title="등록 상품" value="8" icon={Package} />
                <MetricCard title="PC 가동률" value="87.5%" change="+2.1%" trend="up" icon={Monitor} />
              </div>
            </div>

            {/* StatGroup */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">StatGroup</h3>
                <ComponentId name="StatGroup" path="@/components/ui/stat-group" />
              </div>
              <StatGroup
                variant="compact"
                cols={5}
                stats={[
                  { title: '전체', value: '1,284' },
                  { title: '활성', value: '1,102', change: '+8%', trend: 'up' },
                  { title: '일시정지', value: '85' },
                  { title: '만료', value: '72', change: '-15%', trend: 'down' },
                  { title: '취소', value: '25' },
                ]}
              />
            </div>

            {/* StatusBadge */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">StatusBadge</h3>
                <ComponentId name="StatusBadge" path="@/components/ui/status-badge" />
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Filled (기본)</p>
                    <div className="flex gap-2 flex-wrap">
                      <StatusBadge status="success">Live / 활성</StatusBadge>
                      <StatusBadge status="warning">Pending / 대기</StatusBadge>
                      <StatusBadge status="info">Pause / 일시정지</StatusBadge>
                      <StatusBadge status="neutral">Archive / 만료</StatusBadge>
                      <StatusBadge status="error">Cancel / 취소</StatusBadge>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Dot variant</p>
                    <div className="flex gap-2 flex-wrap">
                      <StatusBadge status="success" variant="dot">활성</StatusBadge>
                      <StatusBadge status="warning" variant="dot">대기</StatusBadge>
                      <StatusBadge status="info" variant="dot">일시정지</StatusBadge>
                      <StatusBadge status="neutral" variant="dot">만료</StatusBadge>
                      <StatusBadge status="error" variant="dot">취소</StatusBadge>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Outline + Icon</p>
                    <div className="flex gap-2 flex-wrap">
                      <StatusBadge status="success" variant="outline" showIcon>발송 완료</StatusBadge>
                      <StatusBadge status="error" variant="outline" showIcon>발송 실패</StatusBadge>
                      <StatusBadge status="warning" variant="outline" showIcon>발송 대기</StatusBadge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Table (raw) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Table</h3>
                <ComponentId name="Table" path="@/components/ui/table" />
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>구독자</TableHead>
                      <TableHead>상품</TableHead>
                      <TableHead>PC</TableHead>
                      <TableHead className="text-center">상태</TableHead>
                      <TableHead>시작일</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">김민수</TableCell>
                      <TableCell>매일 영어 한마디</TableCell>
                      <TableCell className="font-mono text-xs">PC 1호기</TableCell>
                      <TableCell className="text-center"><StatusBadge status="success" variant="dot">활성</StatusBadge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">2026-01-15</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">이지은</TableCell>
                      <TableCell>오늘의 명언</TableCell>
                      <TableCell className="font-mono text-xs">PC 2호기</TableCell>
                      <TableCell className="text-center"><StatusBadge status="warning" variant="dot">대기</StatusBadge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">2026-02-01</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">박준혁</TableCell>
                      <TableCell>매일 영어 한마디</TableCell>
                      <TableCell className="font-mono text-xs">PC 1호기</TableCell>
                      <TableCell className="text-center"><StatusBadge status="error" variant="dot">취소</StatusBadge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">2025-11-20</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* EmptyState */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">EmptyState</h3>
                <ComponentId name="EmptyState" path="@/components/ui/empty-state" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <EmptyState
                    icon={MessageSquare}
                    title="등록된 메시지가 없습니다"
                    description="새 메시지를 추가하여 발송을 시작하세요"
                    action={{ label: '메시지 추가', onClick: () => {} }}
                  />
                </CardContent>
              </Card>
            </div>

            {/* SkeletonTable */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">SkeletonTable</h3>
                <ComponentId name="SkeletonTable" path="@/components/ui/skeleton" />
              </div>
              <div className="border rounded-lg overflow-hidden">
                <SkeletonTable cols={5} rows={3} />
              </div>
            </div>

            {/* Timeline */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Timeline</h3>
                <ComponentId name="Timeline" path="@/components/ui/timeline" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <Timeline
                    items={[
                      { date: '2026-03-22 09:00', title: '메시지 발송 완료', description: 'PC 1호기 — 352건 발송', status: 'success' },
                      { date: '2026-03-22 08:55', title: '발송 시작', description: '오전 발송 배치 시작', status: 'info' },
                      { date: '2026-03-21 09:00', title: '발송 실패 3건', description: '친구 미확인 구독자', status: 'error' },
                      { date: '2026-03-20 09:00', title: '메시지 발송 완료', description: 'PC 1호기 — 348건 발송', status: 'success' },
                    ]}
                    variant="compact"
                  />
                </CardContent>
              </Card>
            </div>

            {/* DetailSection / InfoRow */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">DetailSection / InfoRow</h3>
                <ComponentId name="DetailSection" path="@/components/ui/detail-section" />
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <DetailSection title="구독 정보" cols={2}>
                    <InfoRow label="구독자명" value="김민수" />
                    <InfoRow label="상품" value="매일 영어 한마디" />
                    <InfoRow label="시작일" value="2026-01-15" />
                    <InfoRow label="종료일" value="2026-07-15" />
                    <InfoRow label="PC" value="PC 1호기 (010-1234-5678)" />
                    <InfoRow label="상태" value={<StatusBadge status="success">활성</StatusBadge>} />
                  </DetailSection>
                </CardContent>
              </Card>
            </div>

            {/* KeyValue */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">KeyValue / KeyValueGrid</h3>
                <ComponentId name="KeyValue" path="@/components/ui/key-value" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <KeyValueGrid cols={3}>
                    <KeyValue label="주문번호" value="ORD-2026-001" valueClassName="font-mono text-xs" />
                    <KeyValue label="결제 금액" value="49,900" valueClassName="font-bold" />
                    <KeyValue label="상태" value={<StatusBadge status="success" size="xs">완료</StatusBadge>} />
                    <KeyValue label="구독 기간" value="6개월" />
                    <KeyValue label="등록일" value="2026-03-01" />
                    <KeyValue label="메시지 수" value="180건" />
                  </KeyValueGrid>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ═══════════════ 5. 입력 & 필터 ═══════════════ */}
        <section id="input">
          <SectionHeader title="입력 & 필터" />

          <div className="mt-6 space-y-6">
            {/* Button */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Button</h3>
                <ComponentId name="Button" path="@/components/ui/button" />
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Variants</p>
                    <div className="flex gap-2 flex-wrap">
                      <Button>Default</Button>
                      <Button variant="outline">Outline</Button>
                      <Button variant="ghost">Ghost</Button>
                      <Button variant="destructive">Destructive</Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Sizes</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm">Small</Button>
                      <Button>Default</Button>
                      <Button size="lg">Large</Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">With Icon</p>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm"><Plus className="h-4 w-4 mr-1" />구독 추가</Button>
                      <Button variant="outline" size="sm"><Send className="h-4 w-4 mr-1.5" />발송 시작</Button>
                      <Button variant="ghost" size="sm"><Calendar className="h-4 w-4 mr-1.5" />기간 선택</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Input, Label, Textarea */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Input / Label / Textarea</h3>
                <ComponentId name="Input" path="@/components/ui/input" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="demo-name">구독자명</Label>
                      <Input id="demo-name" placeholder="이름을 입력하세요" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="demo-phone">전화번호</Label>
                      <Input id="demo-phone" placeholder="010-0000-0000" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="demo-search">검색</Label>
                      <Input id="demo-search" placeholder="구독자 검색..." />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="demo-textarea">메시지 내용</Label>
                    <Textarea id="demo-textarea" placeholder="오늘의 메시지를 입력하세요..." rows={3} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Select */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Select</h3>
                <ComponentId name="Select" path="@/components/ui/select" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>상품 선택</Label>
                      <Select defaultValue="english">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="english">매일 영어 한마디</SelectItem>
                          <SelectItem value="quote">오늘의 명언</SelectItem>
                          <SelectItem value="news">뉴스 브리핑</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>PC 선택</Label>
                      <Select defaultValue="pc1">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pc1">PC 1호기</SelectItem>
                          <SelectItem value="pc2">PC 2호기</SelectItem>
                          <SelectItem value="pc3">PC 3호기</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>구독 상태</Label>
                      <Select defaultValue="active">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">전체</SelectItem>
                          <SelectItem value="active">활성</SelectItem>
                          <SelectItem value="paused">일시정지</SelectItem>
                          <SelectItem value="expired">만료</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Checkbox, Switch */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Checkbox / Switch</h3>
                <ComponentId name="Checkbox" path="@/components/ui/checkbox" />
                <ComponentId name="Switch" path="@/components/ui/switch" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground mb-2">Checkbox</p>
                      <div className="flex items-center gap-2">
                        <Checkbox id="ck1" checked={checkboxOn} onCheckedChange={(v) => setCheckboxOn(v === true)} />
                        <Label htmlFor="ck1">친구 확인됨</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="ck2" checked />
                        <Label htmlFor="ck2">발송 활성화</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="ck3" disabled />
                        <Label htmlFor="ck3" className="text-muted-foreground">비활성 상태</Label>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground mb-2">Switch</p>
                      <div className="flex items-center gap-2">
                        <Switch id="sw1" checked={switchOn} onCheckedChange={setSwitchOn} />
                        <Label htmlFor="sw1">자동 발송 {switchOn ? '켜짐' : '꺼짐'}</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch id="sw2" />
                        <Label htmlFor="sw2">알림 수신</Label>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* FilterBar */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">FilterBar</h3>
                <ComponentId name="FilterBar" path="@/components/ui/filter-bar" />
              </div>
              <div className="space-y-4">
                {/* Variant 1: quickFilters + search + actions */}
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground mb-3">quickFilters + search + actions</p>
                    <FilterBar
                      search={{ value: filterSearch, onChange: setFilterSearch, placeholder: '구독자 검색...' }}
                      quickFilters={[
                        { label: '전체', active: filterTab === 'all', onClick: () => setFilterTab('all') },
                        { label: '활성', count: 1102, active: filterTab === 'live', onClick: () => setFilterTab('live') },
                        { label: '대기', count: 45, active: filterTab === 'pending', onClick: () => setFilterTab('pending') },
                        { label: '일시정지', count: 85, active: filterTab === 'pause', onClick: () => setFilterTab('pause') },
                        { label: '만료', count: 72, active: filterTab === 'archive', onClick: () => setFilterTab('archive') },
                        { label: '취소', count: 18, active: filterTab === 'cancel', onClick: () => setFilterTab('cancel') },
                      ]}
                      actions={<Button size="sm"><Plus className="h-4 w-4 mr-1" />구독 추가</Button>}
                    />
                  </CardContent>
                </Card>

                {/* Variant 2: search + dropdown filters */}
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground mb-3">search + filters (드롭다운)</p>
                    <FilterBar
                      search={{ value: filterSearch, onChange: setFilterSearch, placeholder: '상품명, SKU 검색...' }}
                      filters={
                        <div className="flex gap-2">
                          <Select defaultValue="all">
                            <SelectTrigger className="w-[130px] h-9 text-xs">
                              <SelectValue placeholder="메시지 타입" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">전체 타입</SelectItem>
                              <SelectItem value="fixed">고정</SelectItem>
                              <SelectItem value="realtime">실시간</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select defaultValue="all">
                            <SelectTrigger className="w-[130px] h-9 text-xs">
                              <SelectValue placeholder="상태" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">전체 상태</SelectItem>
                              <SelectItem value="active">활성</SelectItem>
                              <SelectItem value="inactive">비활성</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      }
                      actions={<Button size="sm" variant="outline">내보내기</Button>}
                    />
                  </CardContent>
                </Card>

                {/* Variant 3: stacked layout */}
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground mb-3">layout=&quot;stacked&quot; (2줄 배치)</p>
                    <FilterBar
                      layout="stacked"
                      search={{ value: filterSearch, onChange: setFilterSearch, placeholder: '주문번호, 고객명 검색...' }}
                      quickFilters={[
                        { label: '전체', active: true, onClick: () => {} },
                        { label: '오늘', count: 12, onClick: () => {} },
                        { label: '이번 주', count: 48, onClick: () => {} },
                      ]}
                      filters={
                        <Select defaultValue="all">
                          <SelectTrigger className="w-[130px] h-9 text-xs">
                            <SelectValue placeholder="PC 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">전체 PC</SelectItem>
                            <SelectItem value="pc1">PC 1호기</SelectItem>
                            <SelectItem value="pc2">PC 2호기</SelectItem>
                          </SelectContent>
                        </Select>
                      }
                    />
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* SmartSelect */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">SmartSelect</h3>
                <ComponentId name="SmartSelect" path="@/components/ui/smart-select" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>PC 선택 (검색 가능)</Label>
                      <SmartSelect
                        options={smartOptions}
                        value={selectVal}
                        onChange={(v) => setSelectVal(typeof v === 'string' ? v : v[0])}
                        searchable
                        placeholder="PC를 선택하세요"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>기본 선택</Label>
                      <SmartSelect
                        options={smartOptions}
                        value={selectVal}
                        onChange={(v) => setSelectVal(typeof v === 'string' ? v : v[0])}
                        placeholder="PC를 선택하세요"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* DatePicker */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">DatePicker</h3>
                <ComponentId name="DatePicker" path="@/components/ui/date-picker" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>날짜 선택</Label>
                      <DatePicker value={dateVal} onChange={setDateVal} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* FormDialog */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">FormDialog</h3>
                <ComponentId name="FormDialog" path="@/components/ui/form-dialog" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <Button variant="outline" onClick={() => setFormDialogOpen(true)}>FormDialog 열기</Button>
                  <p className="text-xs text-muted-foreground mt-2">폼 전용 다이얼로그 - 제출/검증/로딩/에러 상태 내장</p>
                  <FormDialog
                    open={formDialogOpen}
                    onClose={() => setFormDialogOpen(false)}
                    title="구독 추가"
                    description="새 구독 정보를 입력하세요"
                    onSubmit={async () => { setFormDialogOpen(false) }}
                    size="sm"
                  >
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>구독자명</Label>
                        <Input placeholder="이름" />
                      </div>
                      <div className="space-y-2">
                        <Label>상품</Label>
                        <Select defaultValue="english">
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="english">매일 영어 한마디</SelectItem>
                            <SelectItem value="quote">오늘의 명언</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </FormDialog>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ═══════════════ 6. 피드백 & 상태 ═══════════════ */}
        <section id="feedback">
          <SectionHeader title="피드백 & 상태" />

          <div className="mt-6 space-y-6">
            {/* Toast */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Toast</h3>
                <ComponentId name="Toast" path="@/components/ui/Toast" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => setToast({ message: '구독이 추가되었습니다', type: 'success' })}>
                      <Check className="h-4 w-4 mr-1" />Success Toast
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setToast({ message: '발송에 실패했습니다', type: 'error' })}>
                      <AlertCircle className="h-4 w-4 mr-1" />Error Toast
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setToast({ message: '발송이 시작됩니다', type: 'info' })}>
                      <Send className="h-4 w-4 mr-1" />Info Toast
                    </Button>
                  </div>
                  {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
                </CardContent>
              </Card>
            </div>

            {/* Spinner */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Spinner</h3>
                <ComponentId name="Spinner" path="@/components/ui/spinner" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Spinner size="xs" />
                      <span className="text-xs text-muted-foreground">xs</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                      <span className="text-xs text-muted-foreground">sm</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Spinner size="md" />
                      <span className="text-xs text-muted-foreground">md</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Spinner size="lg" />
                      <span className="text-xs text-muted-foreground">lg</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Spinner size="xl" />
                      <span className="text-xs text-muted-foreground">xl</span>
                    </div>
                    <Separator orientation="vertical" className="h-8" />
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                      <span className="text-sm">발송 중...</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ConfirmDialog */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">ConfirmDialog</h3>
                <ComponentId name="ConfirmDialog" path="@/components/ui/confirm-dialog" />
              </div>
              <Card>
                <CardContent className="pt-6">
                  <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
                    구독 삭제 (ConfirmDialog)
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">variant: default, destructive, warning</p>
                  <ConfirmDialog
                    open={confirmOpen}
                    onOpenChange={setConfirmOpen}
                    title="구독 삭제"
                    description="이 구독을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
                    variant="destructive"
                    onConfirm={() => setConfirmOpen(false)}
                  />
                </CardContent>
              </Card>
            </div>

            {/* InlineBanner */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">InlineBanner</h3>
                <ComponentId name="InlineBanner" path="@/components/ui/inline-banner" />
              </div>
              <div className="space-y-3">
                <InlineBanner variant="info" title="안내">
                  오전 9시에 자동 발송이 실행됩니다. PC가 켜져 있는지 확인하세요.
                </InlineBanner>
                <InlineBanner variant="success" title="완료">
                  오늘 발송이 완료되었습니다. 총 1,152건이 성공적으로 발송되었습니다.
                </InlineBanner>
                <InlineBanner variant="warning" title="주의">
                  PC 2호기 연결이 불안정합니다. 확인이 필요합니다.
                </InlineBanner>
                <InlineBanner variant="error" title="오류">
                  3건의 발송이 실패했습니다. 친구 미확인 구독자를 점검하세요.
                </InlineBanner>
                <InlineBanner variant="info" size="sm" compact>
                  compact 모드 — 간단한 도움말 텍스트에 사용합니다.
                </InlineBanner>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ 7. 칼럼 타입 갤러리 ═══════════════ */}
        <section id="column-types">
          <SectionHeader title="칼럼 타입 갤러리">
            <ComponentId name="CellCode" path="@/components/ui/column-types" />
          </SectionHeader>
          <p className="text-sm text-muted-foreground mt-2 mb-6">
            테이블 안에서 사용 가능한 모든 칼럼 렌더링 타입. DataTable의 <code className="text-xs bg-muted px-1 rounded">render</code> 함수에서 사용합니다.
          </p>

          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">타입명</TableHead>
                    <TableHead className="w-[200px]">예시 A</TableHead>
                    <TableHead className="w-[200px]">예시 B</TableHead>
                    <TableHead>용도</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-xs font-mono">CellCode</TableCell>
                    <TableCell><CellCode value="SUB-31" /></TableCell>
                    <TableCell><CellCode value={null} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">SKU 코드, 주문번호</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-mono">CellCurrency</TableCell>
                    <TableCell><CellCurrency value={38500} /></TableCell>
                    <TableCell><CellCurrency value={-9800} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">통화 — 음수 빨간색</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-mono">CellCurrencyKr</TableCell>
                    <TableCell><CellCurrencyKr value={1950000} /></TableCell>
                    <TableCell><CellCurrencyKr value={42000000} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">한국식 축약 (만/억)</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-mono">CellNumber</TableCell>
                    <TableCell><CellNumber value={365} /></TableCell>
                    <TableCell><CellNumber value={180} unit="일" /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">숫자 + 선택적 단위</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-mono">CellPercent</TableCell>
                    <TableCell><CellPercent value={12.5} showSign /></TableCell>
                    <TableCell><CellPercent value={-3.2} showSign /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">퍼센트 — 양수 초록, 음수 빨강</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-mono">CellDate</TableCell>
                    <TableCell><CellDate value="2026-03-22" /></TableCell>
                    <TableCell><CellDate value="2026-03-22" showIcon /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">날짜 (아이콘 선택)</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-mono">CellStatus</TableCell>
                    <TableCell><CellStatus value="활성" statusMap={{ '활성': { status: 'success' }, '대기': { status: 'warning' } }} /></TableCell>
                    <TableCell><CellStatus value="대기" statusMap={{ '활성': { status: 'success' }, '대기': { status: 'warning' } }} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">StatusBadge 자동 연동</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-mono">CellTags</TableCell>
                    <TableCell><CellTags value={['365일', '카카오톡']} /></TableCell>
                    <TableCell><CellTags value={['90일', 'iMessage']} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">다중 태그</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-mono">CellLink</TableCell>
                    <TableCell><CellLink value="https://example.com" label="아임웹 주문" /></TableCell>
                    <TableCell><CellLink value={null} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">외부 링크</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-mono">CellToggle</TableCell>
                    <TableCell><CellToggle value={true} /></TableCell>
                    <TableCell><CellToggle value={false} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">토글 스위치</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-mono">CellImage</TableCell>
                    <TableCell><CellImage value={null} /></TableCell>
                    <TableCell><CellImage value={null} size={48} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">썸네일 (32/48px)</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        {/* ═══════════════ 8. 테이블 ═══════════════ */}
        <section id="tables">
          <SectionHeader title="테이블" />

          <div className="mt-6 space-y-10">
            {/* Raw Table */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Table (기본)</h3>
                <ComponentId name="Table" path="@/components/ui/table" />
              </div>
              <p className="text-xs text-muted-foreground mb-3">기본 테이블 — 정적 데이터, 간단한 목록에 사용</p>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>상품명</TableHead>
                        <TableHead>타입</TableHead>
                        <TableHead className="text-right">총 일수</TableHead>
                        <TableHead className="text-right">가격</TableHead>
                        <TableHead className="text-center">상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-mono text-xs">SUB-31</TableCell>
                        <TableCell>미드 프렌즈 속 영어 표현</TableCell>
                        <TableCell><StatusBadge status="info" size="xs">고정</StatusBadge></TableCell>
                        <TableCell className="text-right tabular-nums">365일</TableCell>
                        <TableCell className="text-right tabular-nums">38,500원</TableCell>
                        <TableCell className="text-center"><StatusBadge status="success" variant="dot">활성</StatusBadge></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-xs">SUB-46</TableCell>
                        <TableCell>경제 뉴스 따라잡기</TableCell>
                        <TableCell><StatusBadge status="warning" size="xs">실시간</StatusBadge></TableCell>
                        <TableCell className="text-right tabular-nums">365일</TableCell>
                        <TableCell className="text-right tabular-nums">38,500원</TableCell>
                        <TableCell className="text-center"><StatusBadge status="success" variant="dot">활성</StatusBadge></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-xs">SUB-48</TableCell>
                        <TableCell>90일 완성 여행 영어 회화</TableCell>
                        <TableCell><StatusBadge status="info" size="xs">고정</StatusBadge></TableCell>
                        <TableCell className="text-right tabular-nums">90일</TableCell>
                        <TableCell className="text-right tabular-nums">9,800원</TableCell>
                        <TableCell className="text-center"><StatusBadge status="neutral" variant="dot">비활성</StatusBadge></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* DataTable */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">DataTable (검색/정렬/액션)</h3>
                <ComponentId name="DataTable" path="@/components/ui/data-table" />
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                검색, 컬럼 정렬, 행 액션, 페이지네이션 내장. 읽기 전용 목록에 사용.
              </p>
              <DataTable
                title="구독 목록"
                columns={[
                  { key: 'name', label: '구독자', sortable: true },
                  { key: 'product', label: '상품', sortable: true },
                  { key: 'pc', label: 'PC' },
                  { key: 'days', label: '진행', align: 'right' as const,
                    render: (_: unknown, row: { day: number; totalDays: number }) => (
                      <span className="tabular-nums text-xs">{row.day}/{row.totalDays}일</span>
                    ),
                  },
                  {
                    key: 'status', label: '상태', align: 'center' as const,
                    render: (_: string, row: { status: string; statusLabel: string }) => (
                      <StatusBadge status={row.status as 'success' | 'warning' | 'error' | 'info' | 'neutral'} variant="dot">
                        {row.statusLabel}
                      </StatusBadge>
                    ),
                  },
                  { key: 'startDate', label: '시작일', sortable: true },
                  { key: 'endDate', label: '종료일' },
                ] as DataTableColumn<typeof SAMPLE_SUBSCRIPTIONS[number]>[]}
                data={SAMPLE_SUBSCRIPTIONS}
                searchKeys={['name', 'product']}
                rowActions={() => [
                  { label: '상세 보기', onClick: () => {} },
                  { label: 'PC 변경', onClick: () => {} },
                  { label: '일시정지', onClick: () => {} },
                  { label: '구독 취소', onClick: () => {}, destructive: true },
                ]}
              />
            </div>

            {/* FilterBar + DataTable 조합 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">FilterBar + DataTable 조합</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                실제 탭에서 사용하는 패턴 — FilterBar 위에 놓고, DataTable과 조합
              </p>
              <div className="space-y-3">
                <FilterBar
                  search={{ value: filterSearch, onChange: setFilterSearch, placeholder: '상품명, SKU 검색...' }}
                  quickFilters={[
                    { label: '전체', active: filterTab === 'all', onClick: () => setFilterTab('all') },
                    { label: '고정 메시지', active: filterTab === 'fixed', onClick: () => setFilterTab('fixed') },
                    { label: '실시간', active: filterTab === 'realtime', onClick: () => setFilterTab('realtime') },
                  ]}
                  filters={
                    <Select defaultValue="all">
                      <SelectTrigger className="w-[130px] h-9 text-xs">
                        <SelectValue placeholder="상태" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        <SelectItem value="active">활성</SelectItem>
                        <SelectItem value="inactive">비활성</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                  actions={
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">내보내기</Button>
                      <Button size="sm"><Plus className="h-4 w-4 mr-1" />상품 추가</Button>
                    </div>
                  }
                />
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>상품명</TableHead>
                          <TableHead>타입</TableHead>
                          <TableHead className="text-right">총 일수</TableHead>
                          <TableHead className="text-right">메시지 수</TableHead>
                          <TableHead className="text-right">활성 구독</TableHead>
                          <TableHead className="text-center">상태</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {SAMPLE_PRODUCTS.map(p => (
                          <TableRow key={p.sku} className="cursor-pointer hover:bg-muted/50">
                            <TableCell><CellCode value={p.sku} /></TableCell>
                            <TableCell className="max-w-[250px] truncate">{p.title}</TableCell>
                            <TableCell><StatusBadge status={p.type === '고정' ? 'info' : 'warning'} size="xs">{p.type}</StatusBadge></TableCell>
                            <TableCell className="text-right"><CellNumber value={p.days} unit="일" /></TableCell>
                            <TableCell className="text-right"><CellNumber value={p.messages} /></TableCell>
                            <TableCell className="text-right"><CellNumber value={p.subs} /></TableCell>
                            <TableCell className="text-center"><StatusBadge status={p.active ? 'success' : 'neutral'} variant="dot">{p.active ? '활성' : '비활성'}</StatusBadge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

const SAMPLE_SUBSCRIPTIONS = [
  { id: 1, name: '김민수', product: '미드 프렌즈 영어', pc: 'PC 1', day: 142, totalDays: 365, status: 'success', statusLabel: '활성', startDate: '2025-11-01', endDate: '2026-11-01' },
  { id: 2, name: '이지은', product: '오늘의 명언', pc: 'PC 2', day: 0, totalDays: 365, status: 'warning', statusLabel: '대기', startDate: '2026-03-25', endDate: '2027-03-25' },
  { id: 3, name: '박준혁', product: 'BBC 영어 표현', pc: 'PC 1', day: 0, totalDays: 365, status: 'error', statusLabel: '취소', startDate: '2025-11-20', endDate: '2026-05-20' },
  { id: 4, name: '최서연', product: '경제 뉴스', pc: 'PC 3', day: 88, totalDays: 180, status: 'success', statusLabel: '활성', startDate: '2025-12-24', endDate: '2026-06-22' },
  { id: 5, name: '정태영', product: '토익 기출 단어', pc: 'PC 1', day: 55, totalDays: 365, status: 'info', statusLabel: '일시정지', startDate: '2026-01-01', endDate: '2027-01-01' },
  { id: 6, name: '한소희', product: '시티팝 일본어', pc: 'PC 2', day: 230, totalDays: 365, status: 'success', statusLabel: '활성', startDate: '2025-08-05', endDate: '2026-08-05' },
  { id: 7, name: '윤도현', product: '경제 뉴스', pc: 'PC 3', day: 180, totalDays: 180, status: 'neutral', statusLabel: '만료', startDate: '2025-09-01', endDate: '2026-03-01' },
  { id: 8, name: '강지원', product: '여행 영어 회화', pc: 'PC 1', day: 45, totalDays: 90, status: 'success', statusLabel: '활성', startDate: '2026-02-05', endDate: '2026-05-06' },
  { id: 9, name: '임수정', product: 'JLPT 단어', pc: 'PC 4', day: 300, totalDays: 365, status: 'success', statusLabel: '활성', startDate: '2025-05-27', endDate: '2026-05-27' },
  { id: 10, name: '조현우', product: '굿플레이스 영어', pc: 'PC 2', day: 365, totalDays: 365, status: 'neutral', statusLabel: '만료', startDate: '2025-03-22', endDate: '2026-03-22' },
]

const SAMPLE_PRODUCTS = [
  { sku: 'SUB-31', title: '하루에 한 문장, 미드 프렌즈 속 영어 표현', type: '고정', days: 365, messages: 509, subs: 186, active: true },
  { sku: 'SUB-46', title: '사회 초년생을 위한 경제 뉴스 따라잡기', type: '실시간', days: 365, messages: 0, subs: 142, active: true },
  { sku: 'SUB-38', title: '하루에 한 번, 토익 기출 단어 5개', type: '고정', days: 365, messages: 730, subs: 98, active: true },
  { sku: 'SUB-48', title: '하루에 한 패턴, 90일 완성 여행 영어 회화', type: '고정', days: 90, messages: 277, subs: 54, active: true },
  { sku: 'SUB-25', title: '7080 시티팝 속 매력적인 일본어 표현', type: '고정', days: 365, messages: 436, subs: 33, active: true },
  { sku: 'SUB-79', title: '미드 프렌즈 속 영어 표현 (레거시)', type: '고정', days: 180, messages: 10, subs: 0, active: false },
]
