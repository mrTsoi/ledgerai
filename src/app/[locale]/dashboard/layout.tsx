import { TenantProvider } from '@/hooks/use-tenant'
import { SubscriptionProvider } from '@/hooks/use-subscription'
import DashboardLayout from '@/components/dashboard/dashboard-layout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <SubscriptionProvider>
        <DashboardLayout>{children}</DashboardLayout>
      </SubscriptionProvider>
    </TenantProvider>
  )
}
