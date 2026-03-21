'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent } from './dialog'
import { Button } from './button'
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw,
  Download, X, Maximize2,
} from 'lucide-react'

/* ── ImagePreviewDialog ─────────────────────────────
 *  이미지 미리보기 다이얼로그 — 확대/축소, 좌우 탐색, 다운로드
 *
 *  사용법:
 *    // 단일 이미지
 *    <ImagePreviewDialog
 *      open={!!previewUrl}
 *      onClose={() => setPreviewUrl(null)}
 *      src={previewUrl!}
 *      alt="상품 이미지"
 *    />
 *
 *    // 갤러리 (여러 이미지 좌우 탐색)
 *    <ImagePreviewDialog
 *      open={previewIndex >= 0}
 *      onClose={() => setPreviewIndex(-1)}
 *      images={photos.map(p => ({ src: p.url, alt: p.name }))}
 *      initialIndex={previewIndex}
 *    />
 *
 *    // 메타 정보 표시
 *    <ImagePreviewDialog
 *      open={open}
 *      onClose={close}
 *      images={photos.map(p => ({
 *        src: p.url,
 *        alt: p.name,
 *        meta: { 파일명: p.name, 크기: p.size, 비율: p.ratio },
 *      }))}
 *      initialIndex={0}
 *    />
 * ──────────────────────────────────────────────────── */

interface ImageItem {
  src: string
  alt?: string
  meta?: Record<string, string | number>
}

interface ImagePreviewDialogProps {
  open: boolean
  onClose: () => void
  /** 단일 이미지 */
  src?: string
  alt?: string
  /** 갤러리 모드 (여러 이미지) */
  images?: ImageItem[]
  /** 초기 인덱스 (갤러리 모드) */
  initialIndex?: number
  /** 다운로드 가능 */
  downloadable?: boolean
}

export function ImagePreviewDialog({
  open,
  onClose,
  src,
  alt,
  images,
  initialIndex = 0,
  downloadable = true,
}: ImagePreviewDialogProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  // 갤러리 목록 구성
  const gallery: ImageItem[] = images ?? (src ? [{ src, alt }] : [])
  const isGallery = gallery.length > 1
  const current = gallery[currentIndex] ?? gallery[0]

  // 초기화
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex)
      setZoom(1)
      setRotation(0)
    }
  }, [open, initialIndex])

  // 키보드 네비게이션
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goLeft()
      if (e.key === 'ArrowRight') goRight()
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') zoomIn()
      if (e.key === '-') zoomOut()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, currentIndex, gallery.length])

  const goLeft = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : gallery.length - 1))
    setZoom(1)
    setRotation(0)
  }, [gallery.length])

  const goRight = useCallback(() => {
    setCurrentIndex((i) => (i < gallery.length - 1 ? i + 1 : 0))
    setZoom(1)
    setRotation(0)
  }, [gallery.length])

  const zoomIn = () => setZoom((z) => Math.min(z + 0.25, 3))
  const zoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25))
  const rotate = () => setRotation((r) => (r + 90) % 360)
  const resetZoom = () => { setZoom(1); setRotation(0) }

  const handleDownload = () => {
    if (!current?.src) return
    const a = document.createElement('a')
    a.href = current.src
    a.download = current.alt ?? 'image'
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  if (!current) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 gap-0 bg-black/95 border-0 overflow-hidden">
        {/* 상단 툴바 */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/60">
          <div className="flex items-center gap-1">
            {isGallery && (
              <span className="text-sm text-white/70 mr-3">
                {currentIndex + 1} / {gallery.length}
              </span>
            )}
            {current.alt && (
              <span className="text-sm text-white/80 truncate max-w-[300px]">{current.alt}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10" onClick={zoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <button onClick={resetZoom} className="text-xs text-white/60 hover:text-white px-2 tabular-nums">
              {Math.round(zoom * 100)}%
            </button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10" onClick={zoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10" onClick={rotate}>
              <RotateCw className="h-4 w-4" />
            </Button>
            {downloadable && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10" onClick={handleDownload}>
                <Download className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 ml-2" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 이미지 영역 */}
        <div className="relative flex-1 flex items-center justify-center overflow-hidden min-h-[400px]">
          {/* 좌측 화살표 */}
          {isGallery && (
            <button
              onClick={goLeft}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* 이미지 */}
          <img
            src={current.src}
            alt={current.alt ?? ''}
            className="max-w-full max-h-[75vh] object-contain transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
            draggable={false}
          />

          {/* 우측 화살표 */}
          {isGallery && (
            <button
              onClick={goRight}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* 메타 정보 */}
        {current.meta && (
          <div className="px-4 py-2 bg-black/60 flex items-center gap-4 text-xs text-white/60">
            {Object.entries(current.meta).map(([key, value]) => (
              <span key={key}>
                <span className="text-white/40">{key}:</span> {value}
              </span>
            ))}
          </div>
        )}

        {/* 갤러리 썸네일 바 */}
        {isGallery && gallery.length <= 20 && (
          <div className="flex items-center gap-1.5 px-4 py-2 bg-black/60 overflow-x-auto">
            {gallery.map((img, i) => (
              <button
                key={i}
                onClick={() => { setCurrentIndex(i); setZoom(1); setRotation(0) }}
                className={cn(
                  'flex-shrink-0 rounded overflow-hidden border-2 transition-all',
                  i === currentIndex
                    ? 'border-white opacity-100'
                    : 'border-transparent opacity-50 hover:opacity-80',
                )}
              >
                <img
                  src={img.src}
                  alt={img.alt ?? ''}
                  className="h-10 w-10 object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
