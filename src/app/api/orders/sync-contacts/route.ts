import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { google } from 'googleapis'
import { Readable } from 'stream'

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  })

  return google.drive({ version: 'v3', auth })
}

/**
 * POST /api/orders/sync-contacts
 *
 * body: { contacts: Array<{ name: string, phone: string }> }
 *
 * 1) 이름/뒤4자리 + 전화번호 형식 CSV 생성
 * 2) Google Drive 폴더에 업로드
 * 3) 기존 Apps Script가 자동 처리
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { contacts } = await req.json()
    if (!contacts?.length) {
      return NextResponse.json({ error: '동기화할 연락처가 없습니다' }, { status: 400 })
    }

    // 전화번호 기준 중복 제거
    const phoneMap = new Map<string, { name: string; phone: string }>()
    for (const c of contacts) {
      const phone = c.phone?.trim()
      if (!phone) continue
      if (!phoneMap.has(phone)) {
        phoneMap.set(phone, { name: c.name?.trim() || '', phone })
      }
    }

    const uniqueContacts = Array.from(phoneMap.values())
    if (uniqueContacts.length === 0) {
      return NextResponse.json({ error: '유효한 연락처가 없습니다' }, { status: 400 })
    }

    // CSV 생성: 이름(이름/뒤4자리), 전화번호
    const csvRows = ['이름,전화번호']
    for (const c of uniqueContacts) {
      const last4 = c.phone.replace(/\D/g, '').slice(-4)
      const nameWithSuffix = `${c.name}/${last4}`
      // CSV에서 쉼표가 포함될 수 있으므로 따옴표로 감싸기
      csvRows.push(`"${nameWithSuffix}","${c.phone}"`)
    }
    const csvContent = '\uFEFF' + csvRows.join('\n') // BOM 추가 (한글 깨짐 방지)

    // Google Drive 업로드
    const drive = getDriveClient()
    const now = new Date()
    const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const fileName = `contacts_${timestamp}.csv`

    const fileMetadata = {
      name: fileName,
      parents: [FOLDER_ID],
    }

    const media = {
      mimeType: 'text/csv',
      body: Readable.from(Buffer.from(csvContent, 'utf-8')),
    }

    const result = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name',
    })

    return NextResponse.json({
      ok: true,
      file_id: result.data.id,
      file_name: result.data.name,
      contact_count: uniqueContacts.length,
    })
  } catch (err: any) {
    console.error('Google Drive 업로드 실패:', err)
    return NextResponse.json(
      { error: err.message || 'Google Drive 업로드에 실패했습니다' },
      { status: 500 },
    )
  }
}
