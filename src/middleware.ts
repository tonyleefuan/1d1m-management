import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!)

const PUBLIC_PATHS = ['/login', '/api/auth/login']
const MACRO_PATHS = ['/api/macro/']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Macro API authentication (api_key based)
  if (MACRO_PATHS.some(p => pathname.startsWith(p))) {
    const auth = req.headers.get('authorization')
    const macroKey = process.env.MACRO_API_KEY
    if (!macroKey || auth !== `Bearer ${macroKey}`) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // Public paths
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
