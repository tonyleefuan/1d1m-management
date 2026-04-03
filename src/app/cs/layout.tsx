import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '1D1M 고객 문의',
  description: '1Day1Message 고객 문의 페이지',
}

export default function CSLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-background border-b">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <span className="font-semibold text-sm">1Day1Message</span>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
