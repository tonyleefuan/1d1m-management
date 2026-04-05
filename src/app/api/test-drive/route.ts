import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { uploadContactsCsv } from '@/lib/google-drive'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const testCsv = '이름,전화번호\n테스트/0000,010-0000-0000'
    const result = await uploadContactsCsv('test-upload.csv', testCsv)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
