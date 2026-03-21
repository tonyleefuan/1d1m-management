'use client'

import React from 'react'

export const ReadOnlyBanner = React.memo(function ReadOnlyBanner() {
  return (
    <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-md px-3.5 py-2 text-xs text-[#8D6E00] font-medium">
      읽기 전용 모드 — 이 탭의 편집 권한이 없습니다. 관리자에게 문의하세요.
    </div>
  )
})
