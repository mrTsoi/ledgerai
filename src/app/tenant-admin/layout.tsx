"use client";
import React from "react";
import { TenantProvider } from "@/hooks/use-tenant";
import DashboardLayout from '@/components/dashboard/dashboard-layout'
import { SubscriptionProvider } from '@/hooks/use-subscription'

export default function TenantAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <div className="min-h-screen bg-background">
        <SubscriptionProvider>
          <DashboardLayout>
            {children}
          </DashboardLayout>
        </SubscriptionProvider>
      </div>
    </TenantProvider>
  );
}
