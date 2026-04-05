import 'server-only'
import { google, drive_v3 } from 'googleapis'

const CONTACTS_FOLDER_ID = '1bb7ZabqQnC1XdC76hVAmD2fPFKX4AGUR'

/**
 * Google Drive API 인증 클라이언트 생성
 */
export function getDriveClient(): drive_v3.Drive {
  const credsJson = process.env.GOOGLE_CREDENTIALS
  let email: string
  let key: string

  if (credsJson) {
    try {
      const creds = JSON.parse(credsJson)
      email = creds.client_email
      key = creds.private_key
    } catch {
      throw new Error('GOOGLE_CREDENTIALS JSON 파싱 실패')
    }
  } else {
    email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || ''
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || ''
    if (!email || !privateKey) {
      throw new Error('Google 서비스 계정 환경변수가 설정되지 않았습니다')
    }
    key = privateKey.replace(/\\n/g, '\n')
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  })

  return google.drive({ version: 'v3', auth })
}

/**
 * CSV 파일을 구글 드라이브 주소록 폴더에 업로드
 */
export async function uploadContactsCsv(
  fileName: string,
  csvContent: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const drive = getDriveClient()

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [CONTACTS_FOLDER_ID],
      mimeType: 'text/csv',
    },
    media: {
      mimeType: 'text/csv',
      body: csvContent,
    },
    fields: 'id, webViewLink',
  })

  return {
    fileId: res.data.id || '',
    webViewLink: res.data.webViewLink || '',
  }
}
