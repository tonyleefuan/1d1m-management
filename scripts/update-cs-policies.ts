/**
 * CS 운영 정책 일괄 업데이트 스크립트
 * 상품 페이지 동기화 + 상품 변경 정책 고도화
 *
 * Usage: npx tsx scripts/update-cs-policies.ts
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── 업데이트할 정책 데이터 ───────────────────────────────

interface PolicyUpdate {
  category: string
  content: string
  ai_instruction: string
}

const POLICY_UPDATES: PolicyUpdate[] = [
  {
    category: 'product_change',
    content: `## 상품 변경

동일 가격 상품 간 변경이 가능합니다.

### 실시간 메시지 상품 (realtime)
- 상품 코드만 변경됩니다.
- 진행일(Day)이 그대로 유지되며, 다음 날부터 새 상품 메시지가 발송됩니다.

### 고정 메시지 상품 (fixed)
- Day 1부터 새로 시작합니다.
- 이미 사용한 기간만큼 이용 기간이 줄어듭니다.
- 예: 30일 상품 10일째에 변경 → 새 상품 Day 1 ~ Day 20까지 수신
- 변경 전 반드시 이 점을 고객에게 안내하고 동의를 받아야 합니다.`,
    ai_instruction: `상품 변경 처리 순서:
1. query_subscription으로 현재 구독 확인 (상품명, message_type, 진행일)
2. 고객이 원하는 상품을 search_product로 검색
3. 가격 비교: 동일 가격(같은 duration_days + channel)만 가능. 다르면 에스컬레이션.
4. 새 상품의 message_type 확인:
   - realtime: "다음 날부터 새 상품 메시지가 발송됩니다" 안내 후 change_product 호출
   - fixed: 반드시 "Day 1부터 다시 시작되며, 남은 기간만 수신 가능합니다" 안내 + 고객 동의 확인 후 change_product 호출
5. 구독이 2개 이상이면 어떤 구독인지 먼저 확인.`,
  },
  {
    category: 'delivery_time',
    content: `## 발송 시간

매일 오전에 자동으로 발송됩니다 (오전 4시 ~ 13시 사이).
메시지를 받는 시간을 직접 정하실 수는 없습니다.

PC별 순차 발송으로 수신 시간이 매일 조금씩 다를 수 있습니다.`,
    ai_instruction: '발송 시간 문의 시 "매일 오전 자동 발송"으로 안내하세요. 시간 선택/변경 불가능함을 명확히 전달하세요.',
  },
  {
    category: 'general_notice',
    content: `## 서비스 일반 안내

### 자주 묻는 질문

**메시지를 직접 고를 수 있나요?**
매일 받는 메시지를 직접 선택하실 수는 없습니다. 학습에 적합한 메시지를 신중하게 선별하여 발송해 드립니다.

**메시지를 받는 시간을 정할 수 있나요?**
매일 오전 자동으로 발송됩니다. 시간을 직접 설정하실 수는 없습니다.

**결제 후 서비스는 어떻게 진행되나요?**
1회 결제 상품으로 정기 결제가 아닙니다. 결제 완료 후 다음 날부터 매일 메시지가 발송됩니다.

### 유의사항

- 미수신 날짜는 자동으로 연장 처리됩니다.
- 미등록 연락처로 발송 시 스팸으로 분류될 수 있으므로, 반드시 연락처 저장 후 수신해 주세요.
- 카카오톡 장애 시 문자 메시지로 대체 발송될 수 있습니다.
- 특정 시간 선택/변경은 불가능합니다.
- 구성 내용은 사전 고지 없이 변경될 수 있습니다.
- 이벤트 및 프로모션으로 인해 가격이 변동될 수 있으며, 이로 인한 환불이나 가격 보상은 불가능합니다.
- 천재지변이나 외부 사유로 인해 서비스가 중단될 경우, 별도의 공지를 통해 서비스 종료 절차가 안내됩니다.

### 문의 안내
추가 문의가 필요하시면 사이트 우측 하단 문의를 통해 문의해 주세요.`,
    ai_instruction: '자주 묻는 일반 질문에 대한 안내입니다. 메시지 선택 불가, 발송 시간, 결제 방식 등 기본적인 질문은 이 정책을 참고하여 답변하세요. 추가 문의 안내 시 "사이트 우측 하단 문의"를 안내하세요.',
  },
  {
    category: 'payment_info',
    content: `## 결제 및 서비스 안내

### 결제 방식
- 1회 결제 상품입니다. 정기 결제가 아니므로 자동 갱신이 없습니다.
- 결제 완료 후 다음 날부터 발송이 시작됩니다.

### 서비스 종료
- 이용 기간이 종료되면 서비스가 자동으로 중지됩니다.
- 연장을 원하시면 추가 결제가 필요합니다.

### 유의사항
- 구성 내용은 사전 고지 없이 변경될 수 있습니다.
- 이벤트/프로모션으로 인해 가격이 변동될 수 있으며, 이로 인한 환불이나 가격 보상은 불가능합니다.
- 천재지변이나 외부 사유로 서비스가 중단될 경우, 별도 공지를 통해 서비스 종료 절차가 안내됩니다.
- 카카오톡 오류/정책 변경으로 메시지 수신이 불가능할 경우, 문자 메시지로 대체 발송될 수 있습니다.`,
    ai_instruction: '정기 결제 아닌 1회 결제임을 명확히 안내하세요. 자동 갱신/자동 결제 걱정은 불필요하다고 안심시켜 주세요. "결제 후 서비스는 어떻게 진행되나요?" 질문에는 결제 완료 후 다음 날부터 발송 시작된다고 안내하세요.',
  },
]

// ─── 실행 ────────────────────────────────────────────────

async function run() {
  console.log('CS 운영 정책 업데이트 시작\n')

  // 1. 현재 정책 조회
  const { data: policies, error: fetchErr } = await supabase
    .from('cs_policies')
    .select('id, category, title')
    .order('sort_order', { ascending: true })

  if (fetchErr || !policies) {
    console.error('정책 조회 실패:', fetchErr?.message)
    process.exit(1)
  }

  console.log(`현재 정책 ${policies.length}건 조회됨\n`)

  // 2. 카테고리별 업데이트
  let updated = 0
  let skipped = 0

  for (const update of POLICY_UPDATES) {
    const policy = policies.find(p => p.category === update.category)
    if (!policy) {
      console.log(`  [SKIP] ${update.category} — DB에 없음`)
      skipped++
      continue
    }

    const { error } = await supabase
      .from('cs_policies')
      .update({
        content: update.content,
        ai_instruction: update.ai_instruction,
        updated_at: new Date().toISOString(),
      })
      .eq('id', policy.id)

    if (error) {
      console.error(`  [FAIL] ${update.category} — ${error.message}`)
    } else {
      console.log(`  [OK] ${update.category} (${policy.title})`)
      updated++
    }
  }

  console.log(`\n완료: ${updated}건 업데이트, ${skipped}건 스킵`)
}

run().catch(err => { console.error('Fatal:', err); process.exit(1) })
