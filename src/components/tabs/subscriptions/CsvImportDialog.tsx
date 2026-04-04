'use client'

import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/ui/metric-card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/ui/status-badge'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { Upload, FileText, CheckCircle2, AlertTriangle, XCircle, Download } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────

interface ParsedImportRow {
  rowIndex: number
  pcNumber: string
  kakaoName: string
  startDate: string
  endDate: string
  status: string
  csvDay: number
  dDay: number
  sku: string
  durationDays: number
  customerId: string | null
  productId: string | null
  deviceId: string | null
  lastSentDay: number
  skipReason: string | null
}

interface ImportPreviewResponse {
  rows: ParsedImportRow[]
  summary: {
    total: number
    valid: number
    skippedSku: number
    skippedPc: number
    skippedCustomer: number
    duplicateInCsv: number
    skippedEmpty: number
  }
  missingSkus: string[]
  missingPcs: string[]
  missingCustomers: string[]
}

interface ConfirmResult {
  ok: boolean
  created: number
  updated: number
  errors: number
  total: number
}

type Step = 'upload' | 'preview' | 'result'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
}

const SAMPLE_CSV = `PC 번호,카톡이름,시작일,종료일,상태,Day,D-Day,SKU,기간
010-1234-5678,홍길동/1234,2025-01-01,2027-09-28,Live,459,541,SUB-46,1000
010-1234-5678,김철수/5678,2025-03-15,2026-03-14,Pending,0,365,SUB-31,365`

function downloadSampleCsv() {
  const bom = '\uFEFF' // UTF-8 BOM for Excel compatibility
  const blob = new Blob([bom + SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '구독_임포트_예시.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Component ───────────────────────────────────────────

export function CsvImportDialog({ open, onOpenChange, onComplete }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Upload step state
  const [file, setFile] = useState<File | null>(null)
  const [dayInterpretation, setDayInterpretation] = useState<'already_sent' | 'today_send'>('already_sent')
  const [referenceDate, setReferenceDate] = useState('2026-04-04')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Preview step state
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null)

  // Result step state
  const [result, setResult] = useState<ConfirmResult | null>(null)

  const reset = () => {
    setStep('upload')
    setLoading(false)
    setError(null)
    setFile(null)
    setDayInterpretation('already_sent')
    setReferenceDate('2026-04-04')
    setPreview(null)
    setResult(null)
  }

  const handleClose = (open: boolean) => {
    if (!open) reset()
    onOpenChange(open)
  }

  // ─── Step 1: Upload ────────────────────────────────

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('dayInterpretation', dayInterpretation)
      formData.append('referenceDate', referenceDate)

      const res = await fetch('/api/subscriptions/import', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '파싱 실패')
      }

      const data: ImportPreviewResponse = await res.json()
      setPreview(data)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  // ─── Step 2: Confirm ───────────────────────────────

  const handleConfirm = async () => {
    if (!preview) return
    setLoading(true)
    setError(null)

    try {
      const validRows = preview.rows
        .filter(r => !r.skipReason)
        .map(r => ({
          customerId: r.customerId!,
          productId: r.productId!,
          deviceId: r.deviceId,
          status: r.status,
          startDate: r.startDate,
          endDate: r.endDate,
          durationDays: r.durationDays,
          lastSentDay: r.lastSentDay,
        }))

      const res = await fetch('/api/subscriptions/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '임포트 실패')
      }

      const data: ConfirmResult = await res.json()
      setResult(data)
      setStep('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : '임포트 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  // ─── Render ────────────────────────────────────────

  const skippedTotal = preview
    ? preview.summary.skippedSku + preview.summary.skippedPc + preview.summary.skippedCustomer + preview.summary.duplicateInCsv + preview.summary.skippedEmpty
    : 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(
        'max-h-[85vh] overflow-y-auto',
        step === 'preview' ? 'sm:max-w-4xl' : 'sm:max-w-lg'
      )}>
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'CSV 임포트'}
            {step === 'preview' && '임포트 미리보기'}
            {step === 'result' && '임포트 결과'}
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && '구글 시트에서 내보낸 CSV 파일을 업로드하세요'}
            {step === 'preview' && '데이터를 확인하고 임포트를 진행하세요'}
            {step === 'result' && '임포트가 완료되었습니다'}
          </DialogDescription>
        </DialogHeader>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <XCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            {/* File input */}
            <div
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer',
                file ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setFile(f)
                }}
              />
              {file ? (
                <>
                  <FileText className="h-8 w-8 text-primary mb-2" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(file.size / 1024 / 1024).toFixed(1)}MB — 클릭하여 변경
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">CSV 또는 Excel 파일 선택</p>
                </>
              )}
            </div>

            {/* Column guide + sample download */}
            <div className="rounded-md border bg-muted/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">필수 컬럼</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={downloadSampleCsv}
                >
                  <Download className="h-3 w-3" />
                  예시 CSV 다운로드
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['PC 번호', '카톡이름', 'SKU', '상태'].map(col => (
                  <Badge key={col} variant="secondary" className="text-xs">{col}</Badge>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">선택:</span>
                {['시작일', '종료일', 'Day', 'D-Day', '기간'].map(col => (
                  <Badge key={col} variant="outline" className="text-xs">{col}</Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                헤더명이 정확하지 않아도 비슷한 이름이면 자동 매칭됩니다
              </p>
            </div>

            {/* Day interpretation */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Day 해석</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={cn(
                    'rounded-md border p-3 text-left text-sm transition-colors',
                    dayInterpretation === 'already_sent'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-muted-foreground'
                  )}
                  onClick={() => setDayInterpretation('already_sent')}
                >
                  <div className="font-medium">이미 보낸 Day</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Day까지 발송 완료
                  </div>
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-md border p-3 text-left text-sm transition-colors',
                    dayInterpretation === 'today_send'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-muted-foreground'
                  )}
                  onClick={() => setDayInterpretation('today_send')}
                >
                  <div className="font-medium">오늘 보내야 할 Day</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Day를 오늘 발송해야 함
                  </div>
                </button>
              </div>
            </div>

            {/* Reference date */}
            <div className="space-y-2">
              <label className="text-sm font-medium">CSV 기준일</label>
              <Input
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                CSV의 Day 값이 이 날짜 기준으로 계산된 값입니다
              </p>
            </div>

            {/* Upload button */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleClose(false)}>
                취소
              </Button>
              <Button onClick={handleUpload} disabled={!file || loading}>
                {loading ? <Spinner className="mr-2 h-4 w-4" /> : null}
                {loading ? '분석 중...' : '분석하기'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && preview && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard title="전체" value={preview.summary.total.toLocaleString()} />
              <MetricCard
                title="임포트 대상"
                value={preview.summary.valid.toLocaleString()}
                className="border-primary/30"
              />
              <MetricCard
                title="스킵"
                value={skippedTotal.toLocaleString()}
                description={[
                  preview.summary.skippedSku > 0 && `SKU ${preview.summary.skippedSku}`,
                  preview.summary.skippedPc > 0 && `PC ${preview.summary.skippedPc}`,
                  preview.summary.skippedCustomer > 0 && `고객 ${preview.summary.skippedCustomer}`,
                  preview.summary.duplicateInCsv > 0 && `중복 ${preview.summary.duplicateInCsv}`,
                  preview.summary.skippedEmpty > 0 && `빈행 ${preview.summary.skippedEmpty}`,
                ].filter(Boolean).join(' / ') || undefined}
              />
              <MetricCard
                title="Day 보정"
                value={dayInterpretation === 'already_sent' ? '이미 발송' : '오늘 발송'}
                description={`기준일: ${referenceDate}`}
              />
            </div>

            {/* Missing items */}
            {(preview.missingSkus.length > 0 || preview.missingPcs.length > 0 || preview.missingCustomers.length > 0) && (
              <div className="space-y-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  매칭 실패 항목
                </div>
                {preview.missingSkus.length > 0 && (
                  <div className="text-xs">
                    <span className="font-medium">SKU ({preview.missingSkus.length}): </span>
                    {preview.missingSkus.slice(0, 10).join(', ')}
                    {preview.missingSkus.length > 10 && ` 외 ${preview.missingSkus.length - 10}개`}
                  </div>
                )}
                {preview.missingPcs.length > 0 && (
                  <div className="text-xs">
                    <span className="font-medium">PC ({preview.missingPcs.length}): </span>
                    {preview.missingPcs.slice(0, 10).join(', ')}
                    {preview.missingPcs.length > 10 && ` 외 ${preview.missingPcs.length - 10}개`}
                  </div>
                )}
                {preview.missingCustomers.length > 0 && (
                  <div className="text-xs">
                    <span className="font-medium">고객 ({preview.missingCustomers.length}): </span>
                    {preview.missingCustomers.slice(0, 5).join(', ')}
                    {preview.missingCustomers.length > 5 && ` 외 ${preview.missingCustomers.length - 5}개`}
                  </div>
                )}
              </div>
            )}

            {/* Preview table */}
            <div className="max-h-[350px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead>카톡이름</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>PC</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">Day→LSD</TableHead>
                    <TableHead>시작일</TableHead>
                    <TableHead>스킵 사유</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.slice(0, 100).map((row) => (
                    <TableRow
                      key={row.rowIndex}
                      className={cn(row.skipReason && 'opacity-50')}
                    >
                      <TableCell className="text-xs text-muted-foreground">{row.rowIndex}</TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">{row.kakaoName}</TableCell>
                      <TableCell className="text-xs">{row.sku}</TableCell>
                      <TableCell className="text-xs max-w-[100px] truncate">{row.pcNumber}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.status as any} size="sm">{row.status}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {row.csvDay}→{row.lastSentDay}
                      </TableCell>
                      <TableCell className="text-xs">{row.startDate}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[150px] truncate">
                        {row.skipReason || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {preview.rows.length > 100 && (
                <div className="border-t bg-muted/50 px-3 py-2 text-center text-xs text-muted-foreground">
                  {preview.rows.length.toLocaleString()}건 중 100건만 표시
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => { setStep('upload'); setPreview(null) }}>
                뒤로
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleClose(false)}>
                  취소
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={loading || preview.summary.valid === 0}
                >
                  {loading ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  {loading ? '임포트 중...' : `${preview.summary.valid.toLocaleString()}건 임포트`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 'result' && result && (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
              <p className="text-lg font-semibold">임포트 완료</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard title="전체" value={result.total.toLocaleString()} />
              <MetricCard title="신규 생성" value={result.created.toLocaleString()} />
              <MetricCard title="업데이트" value={result.updated.toLocaleString()} />
              <MetricCard
                title="에러"
                value={result.errors.toLocaleString()}
                className={result.errors > 0 ? 'border-destructive/30' : ''}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => { handleClose(false); onComplete() }}>
                확인
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
