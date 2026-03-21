import React from 'react'
import { cn } from '@/lib/utils'
import { ImageIcon, X } from 'lucide-react'

/* ── PhotoPickerButton ──────────────────────────────
 *  사진 선택 버튼 — 비어있으면 점선 테두리 + 아이콘, 선택되면 썸네일 표시
 *
 *  사용법:
 *    <PhotoPickerButton
 *      thumbnailUrl={photo?.thumbnail_url}
 *      onClick={() => openPicker()}
 *      aspectRatio="4:5"
 *    />
 *
 *    <PhotoPickerButton
 *      thumbnailUrl={photo?.thumbnail_url}
 *      onClick={() => openPicker()}
 *      aspectRatio="9:16"
 *      label="Vertical"
 *      onRemove={() => clearPhoto()}
 *    />
 *
 *    // 작은 사이즈 (카드뉴스 등)
 *    <PhotoPickerButton
 *      thumbnailUrl={photo?.thumbnail_url}
 *      onClick={() => openPicker()}
 *      size="sm"
 *    />
 * ──────────────────────────────────────────────────── */

const sizeMap = {
  sm: { width: 36, height: 36 },
  md: { width: 80, height: 100 },
  lg: { width: 120, height: 150 },
}

const ratioMap: Record<string, { width: number; height: number }> = {
  '4:5': { width: 120, height: 150 },
  '9:16': { width: 85, height: 150 },
  '1:1': { width: 120, height: 120 },
}

interface PhotoPickerButtonProps {
  thumbnailUrl?: string | null
  onClick: () => void
  /** 사이즈 프리셋 (ratioMap에 없을 때 사용) */
  size?: 'sm' | 'md' | 'lg'
  /** 비율로 크기 결정 (size보다 우선) */
  aspectRatio?: '4:5' | '9:16' | '1:1'
  /** 라벨 */
  label?: string
  /** 힌트 텍스트 */
  hint?: string
  /** 삭제 콜백 (있으면 X 버튼 표시) */
  onRemove?: () => void
  /** 번호 표시 (캐러셀 등) */
  index?: number
  /** 드래그 가능 */
  draggable?: boolean
  onDragStart?: React.DragEventHandler
  onDragOver?: React.DragEventHandler
  onDrop?: React.DragEventHandler
  disabled?: boolean
  className?: string
}

export function PhotoPickerButton({
  thumbnailUrl,
  onClick,
  size = 'lg',
  aspectRatio,
  label,
  hint,
  onRemove,
  index,
  draggable: isDraggable,
  onDragStart,
  onDragOver,
  onDrop,
  disabled,
  className,
}: PhotoPickerButtonProps) {
  const dimensions = aspectRatio ? ratioMap[aspectRatio] : sizeMap[size]
  const hasPhoto = !!thumbnailUrl
  const isSmall = size === 'sm' || (dimensions.width <= 40)

  return (
    <div className={cn('relative group', className)}>
      {label && (
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        draggable={isDraggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          'rounded-md border-2 overflow-hidden flex items-center justify-center transition-colors',
          hasPhoto
            ? 'border-hh-blue/40 bg-transparent'
            : 'border-dashed border-border bg-muted hover:border-hh-blue/40 hover:bg-blue-bg/30',
          isDraggable && 'cursor-grab active:cursor-grabbing',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
        style={{ width: dimensions.width, height: dimensions.height }}
        title={hint}
      >
        {hasPhoto ? (
          <img src={thumbnailUrl!} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <ImageIcon className={cn(isSmall ? 'h-4 w-4' : 'h-5 w-5')} />
            {!isSmall && <span className="text-[10px]">사진 선택</span>}
          </div>
        )}
      </button>

      {/* 번호 표시 */}
      {index !== undefined && hasPhoto && (
        <span className="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded-sm font-medium">
          {index}
        </span>
      )}

      {/* 삭제 버튼 */}
      {onRemove && hasPhoto && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
