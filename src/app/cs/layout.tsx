import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: '1D1M 고객 문의',
  description: '1Day1Message 고객 문의 페이지',
}

export default function CSLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-muted/40">
      <header className="bg-background border-b sticky top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-center">
          <img src="/logo.png" alt="1Day1Message" className="h-5" />
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-6 overflow-x-hidden" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
        {children}
      </main>
    </div>
  )
}
