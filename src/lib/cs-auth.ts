import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

// CS와 admin은 반드시 다른 시크릿을 사용해야 함 (JWT 교차 검증 방지)
const CS_SECRET = process.env.CS_AUTH_SECRET
if (!CS_SECRET) {
  console.warn('[CS Auth] CS_AUTH_SECRET 미설정 — AUTH_SECRET 폴백 사용. 프로덕션에서는 반드시 별도 설정하세요.')
}
const SECRET = new TextEncoder().encode(CS_SECRET || process.env.AUTH_SECRET!)
const SESSION_COOKIE = '1d1m-cs-session'
const SESSION_EXPIRY = '1h'

export interface CsSessionPayload {
  customerId: string
  customerName: string
}

export async function createCsSession(payload: CsSessionPayload): Promise<string> {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(SECRET)

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60, // 1 hour
    path: '/',
  })

  return token
}

export async function getCsSession(): Promise<CsSessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as CsSessionPayload
  } catch {
    return null
  }
}

export async function clearCsSession() {
  cookies().delete(SESSION_COOKIE)
}
