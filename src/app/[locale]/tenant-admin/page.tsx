

import { redirect } from 'next/navigation'

export default async function TenantAdminDashboardLocaleWrapper({ params }: { params?: Promise<{ locale: string }> }) {
  // Redirect localized legacy route to the consolidated settings general tab
  const resolved = params ? await params : undefined
  const locale = resolved?.locale || 'en'
  redirect(`/${locale}/dashboard/settings?tab=general`)
}
