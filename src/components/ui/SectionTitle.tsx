'use client'

import React from 'react'

interface SectionTitleProps {
  children: React.ReactNode
}

export const SectionTitle = React.memo(function SectionTitle({ children }: SectionTitleProps) {
  return (
    <h3 className="text-sm font-bold text-[#111] mt-7 mb-3 border-b-2 border-[#111] pb-2 inline-block tracking-tight">
      {children}
    </h3>
  )
})
