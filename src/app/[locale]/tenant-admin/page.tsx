"use client";

import React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { TenantAdminSettingsTabs } from './settings-tabs';
import { useTenant } from '@/hooks/use-tenant';
import TenantAdminDashboard from '@/app/tenant-admin/tenant-admin-client';

export default function TenantAdminPage() {
  const { isSuperAdmin } = useTenant();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requestedTab = searchParams.get('tab') || 'security';
  const [tab, setTab] = React.useState<string>(requestedTab);

  React.useEffect(() => {
    const sp = searchParams.get('tab') || 'security';
    if (sp !== tab) setTab(sp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (v: string) => {
    setTab(v);
    try {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set('tab', v);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
    } catch (e) {
      router.replace(`${pathname}?tab=${encodeURIComponent(v)}`);
    }
  };

  // Always render the admin tabs for tenant admins, but only show the platform-wide tenant management tab for SUPER_ADMIN
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Tenant Admin Settings</h1>
      <TenantAdminSettingsTabs tab={tab} onTabChange={handleTabChange} />
    </div>
  );
}
