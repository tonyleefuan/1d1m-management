# 구독 데이터 임포트 가이드

> CSV 파일에서 1D1M Management DB로 구독 데이터를 임포트하는 전체 프로세스

---

## 📋 목차

1. [사전 준비](#사전-준비)
2. [백업](#백업)
3. [DB 초기화](#db-초기화)
4. [데이터 임포트](#데이터-임포트)
5. [검증](#검증)
6. [롤백 (문제 발생 시)](#롤백)

---

## 1. 사전 준비

### ✅ 체크리스트

- [ ] CSV 파일 위치 확인: `/Users/tony.lee/Downloads/1D1M - Dashboard.csv`
- [ ] 환경 변수 설정 확인:
  ```bash
  # .env.local
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
  ```
- [ ] 의존성 설치:
  ```bash
  npm install
  ```

### 📊 CSV 데이터 확인

```bash
# CSV 파일 줄 수 확인 (헤더 포함)
wc -l "/Users/tony.lee/Downloads/1D1M - Dashboard.csv"
# 예상: 29,271줄

# 첫 5줄 미리보기
head -5 "/Users/tony.lee/Downloads/1D1M - Dashboard.csv"
```

---

## 2. 백업

### Supabase에서 백업하기

1. **Supabase Dashboard** 접속
2. **Database → Backups** 메뉴로 이동
3. **Create backup** 클릭
4. 백업 완료 대기 (약 5~10분)

또는 **pgAdmin / SQL Editor**에서 수동 백업:

```sql
-- 주요 테이블 데이터 카운트 저장
CREATE TABLE IF NOT EXISTS backup_counts (
  created_at TIMESTAMPTZ DEFAULT NOW(),
  table_name TEXT,
  count BIGINT
);

INSERT INTO backup_counts (table_name, count)
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL
SELECT 'messages', COUNT(*) FROM messages
UNION ALL
SELECT 'daily_messages', COUNT(*) FROM daily_messages;
```

---

## 3. DB 초기화

### ⚠️ 경고

**이 단계는 모든 데이터를 삭제합니다!**
프로덕션 환경이라면 절대 실행하지 마세요. 테스트 환경에서만 사용하세요.

### 실행 방법

1. **Supabase SQL Editor** 열기
2. `scripts/reset-database.sql` 파일 내용 복사
3. SQL Editor에 붙여넣기
4. **Run** 클릭
5. 결과 확인 (모든 테이블 카운트가 0이어야 함)

---

## 4. 데이터 임포트

### 스크립트 실행

```bash
# 환경 변수 로드 (.env.local)
export $(cat .env.local | grep -v '^#' | xargs)

# 임포트 실행
npx tsx scripts/import-subscriptions.ts "/Users/tony.lee/Downloads/1D1M - Dashboard.csv"
```

### 예상 출력

```
📂 Reading CSV file: /Users/tony.lee/Downloads/1D1M - Dashboard.csv
📊 Total rows: 29270

🔍 Loading products...
   Found 15 products

👥 Unique customers: 14215
📦 Total subscriptions to create: 29270

🚀 Starting import...

   Progress: 100/29270 (0%)
   Progress: 200/29270 (1%)
   ...
   Progress: 29200/29270 (99%)

============================================================
✅ Import completed!
============================================================

📊 Statistics:

Customers:
  - Created: 14215
  - Updated: 0
  - Errors: 0

Subscriptions:
  - Created: 29270
  - Skipped: 0
  - Errors: 0

Products:
  - Matched: 29270
  - Not found: 0

🎉 Done!
```

### 소요 시간 예상

- **고객 생성**: 약 5~10분
- **구독 생성**: 약 10~20분
- **전체**: 약 15~30분

---

## 5. 검증

### DB 데이터 확인

```sql
-- 테이블별 데이터 카운트
SELECT
  'customers' as table_name, COUNT(*) as count FROM customers
UNION ALL
SELECT 'subscriptions', COUNT(*) FROM subscriptions
ORDER BY table_name;

-- 예상 결과:
-- customers: 14,215
-- subscriptions: 29,270
```

### 샘플 데이터 확인

```sql
-- 고객 샘플
SELECT
  name, phone, kakao_friend_name, created_at
FROM customers
LIMIT 5;

-- 구독 샘플 (조인)
SELECT
  c.name,
  c.kakao_friend_name,
  p.sku_code,
  p.title,
  s.status,
  s.start_date,
  s.end_date,
  s.day
FROM subscriptions s
JOIN customers c ON s.customer_id = c.id
JOIN products p ON s.product_id = p.id
LIMIT 10;
```

### 대시보드에서 확인

1. 브라우저에서 대시보드 접속
2. **주문 관리** 탭: 주문 데이터 없음 (정상)
3. **구독 관리** 탭: 29,270개 구독 표시
4. 필터 테스트:
   - 상태별 필터 (Live, Pause, Cancel 등)
   - 검색 (고객명, 전화번호)
   - 정렬 (시작일, 종료일 등)

---

## 6. 롤백 (문제 발생 시)

### Supabase 백업 복원

1. **Supabase Dashboard** → **Database → Backups**
2. 이전 백업 선택
3. **Restore** 클릭
4. 복원 완료 대기

또는 **SQL로 수동 복원**:

```sql
-- 임포트 실패 시 모든 데이터 삭제
TRUNCATE TABLE subscriptions CASCADE;
TRUNCATE TABLE customers CASCADE;

-- 백업 카운트 확인
SELECT * FROM backup_counts ORDER BY created_at DESC LIMIT 10;
```

---

## 🚨 문제 해결

### 1. "Product not found" 경고 발생

**원인**: CSV의 SKU 코드가 DB의 products 테이블에 없음

**해결**:
1. 누락된 SKU 코드 확인 (스크립트 출력에 표시)
2. products 테이블에 상품 추가:
   ```sql
   INSERT INTO products (sku_code, title, message_type, total_days)
   VALUES ('SUB-XX', '상품명', 'fixed', 1000);
   ```
3. 스크립트 재실행

### 2. "Failed to create customer" 에러

**원인**: 전화번호 중복 또는 제약 조건 위반

**해결**:
```sql
-- 중복 전화번호 확인
SELECT phone, COUNT(*)
FROM customers
GROUP BY phone
HAVING COUNT(*) > 1;

-- 중복 제거 후 재실행
DELETE FROM customers
WHERE id NOT IN (
  SELECT MIN(id) FROM customers GROUP BY phone
);
```

### 3. 임포트 중단됨

**해결**:
- 스크립트는 **멱등성**을 보장하므로 재실행 가능
- 이미 생성된 고객은 업데이트되고, 새 구독만 추가됨

---

## 📝 체크리스트 요약

- [ ] 백업 완료
- [ ] DB 초기화 완료 (reset-database.sql)
- [ ] 환경 변수 설정 확인
- [ ] 임포트 스크립트 실행
- [ ] DB 데이터 카운트 검증
- [ ] 대시보드에서 데이터 확인
- [ ] 기능 테스트 (필터, 검색, 정렬)

---

## 🎯 다음 단계

임포트 완료 후:

1. **발송 디바이스 설정** (AdminTab)
2. **메시지 콘텐츠 준비** (MessagesTab)
3. **발송 큐 생성** (SendingTab)
4. **테스트 발송** 실행

---

**문제가 발생하면 즉시 롤백하고 백업을 복원하세요!**
