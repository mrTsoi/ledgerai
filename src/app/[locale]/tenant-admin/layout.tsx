import React from "react";
import { TenantProvider } from "@/hooks/use-tenant";

export default function TenantAdminLocaleLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <div className="min-h-screen bg-background">
        {children}
      </div>
    </TenantProvider>
  );
}
