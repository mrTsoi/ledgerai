import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

  // Redirect legacy route to consolidated Settings tab
  redirect('/dashboard/settings?tab=tenant-admin')
}

export default function Page() {
  // Redirect legacy route to consolidated Settings general tab
  redirect('/dashboard/settings?tab=general')
}
