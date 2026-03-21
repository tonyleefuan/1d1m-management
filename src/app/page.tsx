import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Dashboard } from '@/components/Dashboard'

export default async function HomePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return <Dashboard userName={session.username} userRole={session.role} />
}
