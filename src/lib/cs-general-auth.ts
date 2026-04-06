import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { createHash } from 'crypto'

// #17: CS 시크릿 분리 필수
const CS_SECRET = process.env.CS_AUTH_SECRET
if (!CS_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('CS_AUTH_SECRET must be set in production.')
}
const SECRET = new TextEncoder().encode(CS_SECRET || process.env.AUTH_SECRET || 'dev-fallback')
const SESSION_COOKIE = '1d1m-general-session'
const SESSION_EXPIRY = '1h'

export interface GeneralSessionPayload {
  email: string
}

export function hashPin(pin: string, email: string): string {
  return createHash('sha256').update(pin + email.toLowerCase()).digest('hex')
}

export async function createGeneralSession(payload: GeneralSessionPayload): Promise<string> {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(SECRET)

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60,
    path: '/',
  })

  return token
}

export async function getGeneralSession(): Promise<GeneralSessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as GeneralSessionPayload
  } catch {
    return null
  }
}

export async function clearGeneralSession() {
  cookies().delete(SESSION_COOKIE)
}
