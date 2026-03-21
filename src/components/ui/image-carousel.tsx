'use client'

import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

/* ── ImageCarousel ──────────────────────────────────
 *  이미지 슬라이더: 좌우 화살표 + 도트 인디케이터 + 에러 폴백
 *
 *  사용법:
 *    <ImageCarousel images={['/a.jpg', '/b.jpg']} />
 *    <ImageCarousel images={urls} aspectRatio="video" rounded="top" />
 *    <ImageCarousel
 *      images={urls}
 *      fallback={<div>이미지 없음</div>}
 *      overlay={<PlayButton />}
 *      badge="캐러셀"
 *      proxyPattern={/fbcdn\.net/}
 *      proxyUrl="/api/proxy?url="
 *    />
 * ──────────────────────────────────────────────────── */

interface ImageCarouselProps {
  /** 이미지 URL 배열 */
  images: string[]
  /** 이미지 없을 때 표시할 폴백 UI */
  fallback?: React.ReactNode
  /** 이미지 위에 띄울 오버레이 (예: 재생 버튼) */
  overlay?: React.ReactNode
  /** 우측 상단 뱃지 텍스트 (예: '캐러셀', 'VIDEO') */
  badge?: React.ReactNode
  /** 종횡비: square(기본), video(16:9) */
  aspectRatio?: 'square' | 'video'
  /** 라운딩: all(기본), top, none */
  rounded?: 'all' | 'top' | 'none'
  /** 프록시 재시도할 URL 패턴 (매칭 시 proxyUrl로 재시도) */
  proxyPattern?: RegExp
  /** 프록시 URL 접두사 (원본 URL을 encodeURIComponent로 붙임) */
  proxyUrl?: string
  className?: string
}

export function ImageCarousel({
  images,
  fallback,
  overlay,
  badge,
  aspectRatio = 'square',
  rounded = 'top',
  proxyPattern,
  proxyUrl,
  className,
}: ImageCarouselProps) {
  const [idx, setIdx] = useState(0)
  const [imgError, setImgError] = useState(false)
  const [triedProxy, setTriedProxy] = useState(false)

  // images 배열 변경 시 idx 리셋 (out of bounds 방지)
  useEffect(() => {
    setIdx(0)
    setImgError(false)
    setTriedProxy(false)
  }, [images])

  const roundedClass = {
    all: 'rounded-lg',
    top: 'rounded-t-lg',
    none: '',
  }[rounded]

  const aspectClass = aspectRatio === 'video' ? 'aspect-video' : 'aspect-square'

  // 이미지 없음 → 폴백
  if (images.length === 0) {
    return (
      <div className={cn('flex w-full flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground bg-surface-alt', aspectClass, roundedClass, className)}>
        {fallback ?? <span>이미지 없음</span>}
      </div>
    )
  }

  const currentUrl = triedProxy && proxyUrl
    ? `${proxyUrl}${encodeURIComponent(images[idx])}`
    : images[idx]

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setImgError(false)
    setTriedProxy(false)
    setIdx(idx - 1)
  }

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    setImgError(false)
    setTriedProxy(false)
    setIdx(idx + 1)
  }

  const handleDot = (e: React.MouseEvent, i: number) => {
    e.stopPropagation()
    setImgError(false)
    setTriedProxy(false)
    setIdx(i)
  }

  const handleImgError = () => {
    if (!triedProxy && proxyPattern && proxyUrl && proxyPattern.test(images[idx])) {
      setTriedProxy(true)
    } else {
      setImgError(true)
    }
  }

  return (
    <div className={cn('relative w-full', className)}>
      {imgError ? (
        <div className={cn('flex w-full flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground bg-surface-alt', aspectClass, roundedClass)}>
          {fallback ?? <span>이미지를 불러올 수 없음</span>}
        </div>
      ) : (
        <img
          src={currentUrl}
          alt={`slide ${idx + 1}`}
          className={cn('block w-full object-cover', aspectClass, roundedClass)}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={handleImgError}
        />
      )}

      {/* 좌우 화살표 */}
      {images.length > 1 && (
        <>
          {idx > 0 && (
            <button
              onClick={handlePrev}
              className="absolute left-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border-none bg-black/50 text-sm text-white cursor-pointer"
            >
              &#8249;
            </button>
          )}
          {idx < images.length - 1 && (
            <button
              onClick={handleNext}
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border-none bg-black/50 text-sm text-white cursor-pointer"
            >
              &#8250;
            </button>
          )}
          {/* 도트 인디케이터 */}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {images.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 w-1.5 rounded-full cursor-pointer',
                  i === idx ? 'bg-white' : 'bg-white/50',
                )}
                onClick={(e) => handleDot(e, i)}
              />
            ))}
          </div>
          {/* 페이지 번호 뱃지 */}
          <div className="absolute top-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
            {idx + 1}/{images.length}
          </div>
        </>
      )}

      {/* 오버레이 (재생 버튼 등) */}
      {overlay && !imgError && overlay}

      {/* 커스텀 뱃지 (단일 이미지일 때도 표시 가능) */}
      {badge && images.length <= 1 && !imgError && (
        <div className="absolute top-2 right-2 flex items-center gap-[3px] rounded bg-white/75 px-2 py-0.5 text-[10px] font-medium text-black/55 backdrop-blur-sm">
          {badge}
        </div>
      )}
    </div>
  )
}
