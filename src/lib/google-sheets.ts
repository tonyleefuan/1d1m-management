import 'server-only'
import { google, sheets_v4 } from 'googleapis'
import { supabase } from '@/lib/supabase'

const DEFAULT_SPREADSHEET_ID = '1n3izrz9w6PaXotYo3bueLy2gwg0TAbAmmc4Tu7nK7-k'

/**
 * Google Sheets API 인증 클라이언트 생성
 */
export function getSheetsClient(): sheets_v4.Sheets {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY

  if (!email || !privateKey) {
    throw new Error(`Google 서비스 계정 환경변수 누락 (email=${!!email}, key=${!!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY}, fallback=${!!process.env.GOOGLE_PRIVATE_KEY})`)
  }

  // private key: literal \n → actual newline
  const key = privateKey.replace(/\\n/g, '\n')
  console.log(`[google-sheets] email=${email}, key_len=${privateKey.length}, key_start=${key.slice(0, 27)}`)

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })

  return google.sheets({ version: 'v4', auth })
}

/**
 * app_settings 테이블에서 스프레드시트 ID 조회
 */
export async function getSpreadsheetId(): Promise<string> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'google_sheet_id')
    .single()

  if (error || !data) {
    return DEFAULT_SPREADSHEET_ID
  }

  const val = data.value
  const id = typeof val === 'string' ? val.replace(/^"|"$/g, '') : String(val)
  return id || DEFAULT_SPREADSHEET_ID
}

/**
 * 시트 탭을 초기화하고 데이터 쓰기
 */
export async function writeSheetData(sheetName: string, rows: string[][]): Promise<void> {
  const sheets = getSheetsClient()
  const spreadsheetId = await getSpreadsheetId()

  // 시트 전체 클리어
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${sheetName}'`,
    })
  } catch (err: any) {
    throw new Error(`시트 '${sheetName}' 초기화 실패: ${err.message}`)
  }

  // 데이터 쓰기
  if (rows.length === 0) return

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: rows,
      },
    })
  } catch (err: any) {
    throw new Error(`시트 '${sheetName}' 데이터 쓰기 실패: ${err.message}`)
  }
}

/**
 * 시트 탭에 데이터 이어 붙이기 (기존 데이터 유지)
 */
export async function appendSheetData(sheetName: string, rows: string[][]): Promise<void> {
  if (rows.length === 0) return

  const sheets = getSheetsClient()
  const spreadsheetId = await getSpreadsheetId()

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: rows,
      },
    })
  } catch (err: any) {
    throw new Error(`시트 '${sheetName}' 이어 붙이기 실패: ${err.message}`)
  }
}

/**
 * 시트 데이터 읽기
 */
export async function readSheetData(sheetName: string, range?: string): Promise<string[][]> {
  const sheets = getSheetsClient()
  const spreadsheetId = await getSpreadsheetId()

  const fullRange = range ? `'${sheetName}'!${range}` : `'${sheetName}'`

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: fullRange,
    })
    return (res.data.values as string[][]) || []
  } catch (err: any) {
    throw new Error(`시트 '${sheetName}' 읽기 실패: ${err.message}`)
  }
}

/**
 * 시트 탭 존재 확인 및 생성
 */
export async function ensureSheetTab(sheetName: string): Promise<void> {
  const sheets = getSheetsClient()
  const spreadsheetId = await getSpreadsheetId()

  const existingTabs = await getSheetTabNames()
  if (existingTabs.includes(sheetName)) return

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: sheetName },
            },
          },
        ],
      },
    })
  } catch (err: any) {
    // 이미 존재하는 경우 무시
    if (err.message?.includes('already exists')) return
    throw new Error(`시트 탭 '${sheetName}' 생성 실패: ${err.message}`)
  }
}

/**
 * 기존 시트 탭 이름 목록 조회
 */
export async function getSheetTabNames(): Promise<string[]> {
  const sheets = getSheetsClient()
  const spreadsheetId = await getSpreadsheetId()

  try {
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title',
    })
    return res.data.sheets?.map(s => s.properties?.title || '') || []
  } catch (err: any) {
    console.error(`[google-sheets] getSheetTabNames full error:`, JSON.stringify({ message: err.message, code: err.code, status: err.status, errors: err.errors }))
    throw new Error(`시트 탭 목록 조회 실패: ${err.message}`)
  }
}
