export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { uploadContactsCsv } from '@/lib/google-drive'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { items } = await req.json()
    if (!items?.length) return NextResponse.json({ error: '저장할 주문이 없습니다' }, { status: 400 })

    // 1. Product map (한 번만 조회)
    const skuCodes = Array.from(new Set(items.map((i: any) => i.product_sku)))
    const { data: products } = await supabase
      .from('products')
      .select('id, sku_code')
      .in('sku_code', skuCodes)
    const productMap = new Map(products?.map(p => [p.sku_code, p.id]) || [])

    // 2. 고객 일괄 처리 — 전화번호 기준 dedup
    const phoneToItem = new Map<string, any>()
    for (const item of items) {
      if (item.customer_phone && !phoneToItem.has(item.customer_phone)) {
        phoneToItem.set(item.customer_phone, item)
      }
    }

    // 기존 고객 조회 — 1차: phone 매칭
    const phones = Array.from(phoneToItem.keys())
    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('id, phone')
      .in('phone', phones)
    const phoneToId = new Map(existingCustomers?.map(c => [c.phone, c.id]) || [])

    // 2차: phone 매칭 실패한 고객 → kakao_friend_name으로 fallback 매칭
    const unmatchedPhones = phones.filter(phone => !phoneToId.has(phone))
    if (unmatchedPhones.length > 0) {
      const kakaoNames = unmatchedPhones.map(phone => {
        const item = phoneToItem.get(phone)!
        return item.customer_name + '/' + phone.slice(-4)
      })
      const { data: kakaoMatched } = await supabase
        .from('customers')
        .select('id, kakao_friend_name')
        .in('kakao_friend_name', kakaoNames)

      const kakaoToId = new Map(kakaoMatched?.map(c => [c.kakao_friend_name, c.id]) || [])

      // 매칭된 고객은 phone도 업데이트 (다음에는 phone으로 바로 매칭되도록)
      for (const phone of unmatchedPhones) {
        const item = phoneToItem.get(phone)!
        const kakaoName = item.customer_name + '/' + phone.slice(-4)
        const existingId = kakaoToId.get(kakaoName)
        if (existingId) {
          phoneToId.set(phone, existingId)
          // phone 채우기
          await supabase.from('customers').update({ phone, phone_last4: phone.slice(-4) }).eq('id', existingId)
        }
      }
    }

    // 새 고객 일괄 생성 (phone도 kakao도 매칭 안 된 고객만)
    const newCustomerRows = phones
      .filter(phone => !phoneToId.has(phone))
      .map(phone => {
        const item = phoneToItem.get(phone)!
        return {
          name: item.customer_name,
          phone,
          phone_last4: phone.slice(-4),
          kakao_friend_name: item.customer_name + '/' + phone.slice(-4),
        }
      })

    if (newCustomerRows.length > 0) {
      const { data: newCustomers, error: custErr } = await supabase
        .from('customers')
        .insert(newCustomerRows)
        .select('id, phone')
      if (custErr) {
        return NextResponse.json({ error: `고객 생성 실패: ${custErr.message}` }, { status: 500 })
      }
      newCustomers?.forEach(c => phoneToId.set(c.phone, c.id))
    }

    // 3. 주문 일괄 생성 — 주문번호 기준 그룹
    const orderGroups = new Map<string, any[]>()
    for (const item of items) {
      const group = orderGroups.get(item.imweb_order_no) || []
      group.push(item)
      orderGroups.set(item.imweb_order_no, group)
    }

    const orderRows = Array.from(orderGroups.entries()).map(([orderNo, orderItems]) => {
      const first = orderItems[0]
      return {
        imweb_order_no: orderNo,
        customer_id: phoneToId.get(first.customer_phone),
        total_amount: first.total_amount,
        ordered_at: first.ordered_at,
      }
    }).filter(o => o.customer_id)

    const { data: orders, error: orderErr } = await supabase
      .from('orders')
      .upsert(orderRows, { onConflict: 'imweb_order_no', ignoreDuplicates: true })
      .select('id, imweb_order_no')

    if (orderErr) {
      return NextResponse.json({ error: `주문 생성 실패: ${orderErr.message}` }, { status: 500 })
    }

    // 기존 주문도 가져오기 (upsert에서 ignored된 것들)
    const orderNos = Array.from(orderGroups.keys())
    const { data: allOrders } = await supabase
      .from('orders')
      .select('id, imweb_order_no')
      .in('imweb_order_no', orderNos)
    const orderNoToId = new Map(allOrders?.map(o => [o.imweb_order_no, o.id]) || [])

    // 4. 품목 일괄 생성
    const itemRows = items
      .filter((item: any) => productMap.has(item.product_sku) && orderNoToId.has(item.imweb_order_no))
      .map((item: any) => ({
        order_id: orderNoToId.get(item.imweb_order_no),
        imweb_item_no: item.imweb_item_no,
        product_id: productMap.get(item.product_sku),
        duration_days: item.duration_days,
        list_price: item.list_price || 0,
        allocated_amount: item.allocated_amount || 0,
        is_addon: item.is_addon,
        raw_product_sku: item.raw_product_sku,
        raw_option_sku: item.raw_option_sku,
        raw_option_name: item.raw_option_name,
      }))

    const { data: savedItems, error: itemErr } = await supabase
      .from('order_items')
      .upsert(itemRows, { onConflict: 'imweb_item_no', ignoreDuplicates: true })
      .select('id, product_id, imweb_item_no')

    if (itemErr) {
      return NextResponse.json({ error: `품목 생성 실패: ${itemErr.message}` }, { status: 500 })
    }

    // 5. 구독 일괄 생성
    const itemNoToSaved = new Map(savedItems?.map(si => [si.imweb_item_no, si]) || [])

    // 디폴트 PC 조회
    const { data: defaultSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'default_device_id')
      .single()
    const defaultDeviceId = defaultSetting?.value || null

    // customer_id → 과거 배정 PC 매핑
    const customerIds = Array.from(phoneToId.values()).filter(Boolean) as string[]
    let customerDeviceMap = new Map<string, string>()
    if (customerIds.length > 0) {
      const { data: pastSubs } = await supabase
        .from('subscriptions')
        .select('customer_id, device_id')
        .in('customer_id', customerIds)
        .not('device_id', 'is', null)
        .order('created_at', { ascending: false })

      pastSubs?.forEach(s => {
        if (!customerDeviceMap.has(s.customer_id)) {
          customerDeviceMap.set(s.customer_id, s.device_id)
        }
      })
    }

    const subRows = items
      .filter((item: any) => {
        const saved = itemNoToSaved.get(item.imweb_item_no)
        return saved && productMap.has(item.product_sku) && phoneToId.has(item.customer_phone)
      })
      .map((item: any) => {
        // 시작일 = 업로드 시점 KST 기준 4AM 컷오프
        // KST 04시 이전 → 오늘, 04시 이후 → 내일
        const nowKST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
        const kstHour = nowKST.getHours()
        let startStr: string
        if (kstHour < 4) {
          // 오늘 KST
          startStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
        } else {
          // 내일 KST
          const tomorrow = new Date()
          tomorrow.setDate(tomorrow.getDate() + 1)
          startStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(tomorrow)
        }
        // 종료일 = 시작일 + 기간 - 1
        const startDate = new Date(startStr + 'T00:00:00')
        const endDate = new Date(startDate)
        endDate.setDate(endDate.getDate() + (item.duration_days || 365) - 1)
        const endStr = endDate.toISOString().slice(0, 10)

        return {
          order_item_id: itemNoToSaved.get(item.imweb_item_no)!.id,
          customer_id: phoneToId.get(item.customer_phone),
          product_id: productMap.get(item.product_sku),
          status: 'pending',
          duration_days: item.duration_days,
          start_date: startStr,
          end_date: endStr,
          // PC 자동 배정: 1순위 과거 PC, 2순위 디폴트
          device_id: customerDeviceMap.get(phoneToId.get(item.customer_phone)!) || defaultDeviceId,
        }
      })

    if (subRows.length > 0) {
      // 기존 구독 체크 — CSV 임포트로 이미 생성된 구독과 중복 방지
      const subCustomerIds = [...new Set(subRows.map((r: any) => r.customer_id).filter(Boolean))] as string[]
      const subProductIds = [...new Set(subRows.map((r: any) => r.product_id).filter(Boolean))] as string[]

      const { data: existingSubs } = await supabase
        .from('subscriptions')
        .select('customer_id, product_id')
        .in('customer_id', subCustomerIds)
        .in('product_id', subProductIds)

      const existingSubSet = new Set(
        existingSubs?.map(s => `${s.customer_id}::${s.product_id}`) || []
      )

      // 이미 있는 구독은 order_item_id만 연결, 신규만 insert
      const newSubRows = []
      for (const row of subRows) {
        const key = `${row.customer_id}::${row.product_id}`
        if (existingSubSet.has(key)) {
          // 기존 구독에 order_item_id 연결
          if (row.order_item_id) {
            await supabase
              .from('subscriptions')
              .update({ order_item_id: row.order_item_id })
              .eq('customer_id', row.customer_id)
              .eq('product_id', row.product_id)
              .is('order_item_id', null)
          }
        } else {
          newSubRows.push(row)
        }
      }

      if (newSubRows.length > 0) {
        const { error: subErr } = await supabase
          .from('subscriptions')
          .insert(newSubRows)

        if (subErr) {
          return NextResponse.json({ error: `구독 생성 실패: ${subErr.message}` }, { status: 500 })
        }
      }
    }

    // 구독 생성 완료 후, phone 삭제 전에 CSV 생성 → 구글 드라이브 업로드
    // (phone이 삭제되면 전화번호를 알 수 없으므로 반드시 먼저 실행)
    const contactRows: string[] = ['이름,전화번호']
    for (const [phone, item] of phoneToItem) {
      if (!phone) continue
      const kakaoName = item.customer_name + '/' + phone.slice(-4)
      contactRows.push(`${kakaoName},${phone}`)
    }

    if (contactRows.length > 1) {
      try {
        const now = new Date()
        const fileName = `contacts_${now.toISOString().slice(0, 10)}_${now.getTime()}.csv`
        // BOM 추가 (Excel에서 한글 깨짐 방지)
        const csvContent = '\uFEFF' + contactRows.join('\n')
        await uploadContactsCsv(fileName, csvContent)
      } catch (err: any) {
        // 드라이브 업로드 실패해도 주문 처리는 계속 진행 (로그만 남김)
        console.error('[orders/confirm] 구글 드라이브 CSV 업로드 실패:', err.message)
      }
    }

    // 구독 생성 완료 후 phone 원본 삭제 (개인정보보호)
    const customerIdsToClean = Array.from(phoneToId.values()).filter(Boolean) as string[]
    if (customerIdsToClean.length > 0) {
      await supabase
        .from('customers')
        .update({ phone: null })
        .in('id', customerIdsToClean)
    }

    return NextResponse.json({
      ok: true,
      saved_orders: orders?.length || 0,
      saved_items: savedItems?.length || 0,
      saved_subscriptions: subRows.length,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
