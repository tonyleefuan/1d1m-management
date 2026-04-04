import 'server-only'
import { supabase } from '@/lib/supabase'
import { SYSTEM_DEFAULTS, SYSTEM_SETTING_KEYS } from '@/lib/constants'

export type SystemSettings = Record<string, number | string | boolean>

/**
 * DB(app_settings)에서 운영 설정을 로드하고 기본값과 병합합니다.
 * 서버 사이드 전용 — API route / server component에서만 호출
 *
 * @param keys 특정 키만 로드 (생략 시 전체)
 */
export async function getSystemSettings(keys?: string[]): Promise<SystemSettings> {
  const targetKeys = keys ?? SYSTEM_SETTING_KEYS

  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', targetKeys)

  // 기본값 복사 후 DB 값으로 덮어씀
  const settings: SystemSettings = {}
  for (const k of targetKeys) {
    settings[k] = SYSTEM_DEFAULTS[k]
  }
  data?.forEach(row => {
    if (row.value !== null && row.value !== undefined) {
      settings[row.key] = row.value as number | string | boolean
    }
  })

  return settings
}

/**
 * 특정 설정 값 1개만 빠르게 로드
 */
export async function getSetting<T extends number | string | boolean>(
  key: string
): Promise<T> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single()

  return (data?.value ?? SYSTEM_DEFAULTS[key]) as T
}
