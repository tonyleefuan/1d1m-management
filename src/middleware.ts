import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!)

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/cs', '/api/cs/']
const MACRO_PATHS = ['/api/macro/']
const CRON_PATHS = ['/api/cron/']

// CS 전용 도메인 — 이 호스트에서는 /cs 라우트만 허용
const CS_HOSTS = ['1d1m.space', 'www.1d1m.space']

function isCSHost(host: string): boolean {
  const h = host.split(':')[0] // 포트 제거
  return CS_HOSTS.includes(h)
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const host = req.headers.get('host') || ''

  // ─── CS 전용 도메인 (1d1m.space) ───
  if (isCSHost(host)) {
    // 정적 파일 통과
    if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
      return NextResponse.next()
    }

    // 루트 → /cs 리다이렉트
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/cs', req.url))
    }

    // /cs, /api/cs 만 허용 — 나머지는 전부 /cs로 리다이렉트
    if (pathname.startsWith('/cs') || pathname.startsWith('/api/cs')) {
      return NextResponse.next()
    }

    // 그 외 경로 (관리자 페이지 등) → /cs로 리다이렉트
    return NextResponse.redirect(new URL('/cs', req.url))
  }

  // ─── 관리자 도메인 (1d1m.app) ───
  // 관리자 도메인에서 /cs 경로 차단 → 404
  if (pathname === '/cs' || pathname.startsWith('/cs/')) {
    return NextResponse.rewrite(new URL('/not-found', req.url))
  }

  // Cron API — route handler does its own CRON_SECRET check
  if (CRON_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Macro API authentication (api_key based)
  if (MACRO_PATHS.some(p => pathname.startsWith(p))) {
    const auth = req.headers.get('authorization')
    const macroKey = process.env.MACRO_API_KEY
    if (!macroKey || auth !== `Bearer ${macroKey}`) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // Public paths (관리자 도메인용 — /cs는 위에서 이미 차단됨)
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Static files
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // Check session
  const token = req.cookies.get('1d1m-session')?.value
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  try {
    await jwtVerify(token, SECRET)
    return NextResponse.next()
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
