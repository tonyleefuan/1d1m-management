import { cn } from '@/lib/utils'

/**
 * 통합 로딩 UI — 탭 간 일관된 로딩 표시
 *
 * 사용법:
 *   <Loading />                                           // 기본 bbuggu 로더
 *   <Loading message="시뮬레이터 데이터 로딩 중..." />     // 커스텀 메시지
 *   <Skeleton className="h-4 w-[200px]" />               // 인라인 스켈레톤
 *   <SkeletonTable cols={5} rows={8} />                   // 테이블 스켈레톤
 */

/** bbuggu 캐릭터 로더 — 페이지/섹션 로딩 시 사용 */
function Loading({
  message = '로딩 중...',
  className,
}: {
  message?: string
  className?: string
}) {
  return (
    <div className={cn('py-10 text-center text-[#999] text-xs', className)}>
      <img src="/bbuggu.gif" alt="로딩" className="w-9 h-9 mx-auto mb-2 block" />
      {message}
    </div>
  )
}

/** 인라인 스켈레톤 — 개별 요소 로딩 시 사용 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

/** 테이블 스켈레톤 — 행/열 수 지정 */
function SkeletonTable({ cols = 4, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <div className="w-full space-y-2">
      {/* 헤더 */}
      <div className="flex gap-3 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* 행 */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 px-4 py-3 border-t border-border-light">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn('h-4 flex-1', c === 0 && 'max-w-[60%]')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export { Loading, Skeleton, SkeletonTable }
