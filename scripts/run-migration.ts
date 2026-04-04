/**
 * Run SQL migration via Supabase
 * Usage: npx tsx scripts/run-migration.ts <sql_file>
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const SQL_FILE = process.argv[2]
if (!SQL_FILE) {
  console.error('Usage: npx tsx scripts/run-migration.ts <sql_file>')
  process.exit(1)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  const sql = fs.readFileSync(SQL_FILE, 'utf-8')
  console.log('Running migration:', SQL_FILE)
  console.log('SQL length:', sql.length, 'chars\n')

  // Try to create tables using Supabase client's from() won't work for DDL
  // Instead, split into individual statements and attempt each
  // For DDL we need to use the SQL editor approach or pg connection

  // Approach: Use the supabase client to check if tables already exist
  // and if not, create them via individual API calls

  // First, check if cs_inquiries already exists
  const { error: checkError } = await supabase
    .from('cs_inquiries')
    .select('id')
    .limit(1)

  if (!checkError) {
    console.log('cs_inquiries table already exists!')

    // Check cs_replies
    const { error: e2 } = await supabase.from('cs_replies').select('id').limit(1)
    console.log('cs_replies:', e2 ? 'NOT EXISTS' : 'EXISTS')

    // Check cs_policies
    const { data: policies, error: e3 } = await supabase.from('cs_policies').select('id').limit(1)
    console.log('cs_policies:', e3 ? 'NOT EXISTS' : 'EXISTS', policies?.length ? `(${policies.length} rows)` : '')

    // Check cs_rate_limits
    const { error: e4 } = await supabase.from('cs_rate_limits').select('id').limit(1)
    console.log('cs_rate_limits:', e4 ? 'NOT EXISTS' : 'EXISTS')

    console.log('\nTables already exist. If you need to re-create, use Supabase SQL Editor.')
    return
  }

  console.log('Tables do not exist yet. Please run the SQL in Supabase SQL Editor:')
  console.log('  1. Go to https://supabase.com/dashboard')
  console.log('  2. Select your project')
  console.log('  3. Go to SQL Editor')
  console.log('  4. Paste and run: docs/migrations/007_cs_tables.sql')
  console.log('\nAlternatively, the SQL file has been saved and you can copy it.')
}

run().catch(err => { console.error('Fatal:', err); process.exit(1) })
