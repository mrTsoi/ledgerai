'use client'

import { createContext, useContext } from 'react'
import type React from 'react'
import type { DashboardLayoutV1 } from '@/lib/dashboard/registry'

export type DashboardTemplateOption = {
  key: string
  name: string
  role?: string
}

export type DashboardActionLoading = null | 'save' | 'reset' | 'publish'

export type DashboardPersonalizationContextValue = {
  tenantId: string | null

  templatesLoading: boolean
  templates: DashboardTemplateOption[]
  defaultTemplateKey: string | null
  selectedTemplateKey: string | null
  setSelectedTemplateKey: React.Dispatch<React.SetStateAction<string | null>>

  layout: DashboardLayoutV1 | null
  setLayout: React.Dispatch<React.SetStateAction<DashboardLayoutV1 | null>>

  isCustomizing: boolean
  setIsCustomizing: React.Dispatch<React.SetStateAction<boolean>>

  actionLoading: DashboardActionLoading
  setActionLoading: React.Dispatch<React.SetStateAction<DashboardActionLoading>>
}

const DashboardPersonalizationContext = createContext<DashboardPersonalizationContextValue | undefined>(undefined)

export function DashboardPersonalizationProvider({
  value,
  children,
}: {
  value: DashboardPersonalizationContextValue
  children: React.ReactNode
}) {
  return <DashboardPersonalizationContext.Provider value={value}>{children}</DashboardPersonalizationContext.Provider>
}

export function useDashboardPersonalization() {
  const ctx = useContext(DashboardPersonalizationContext)
  if (!ctx) throw new Error('useDashboardPersonalization must be used within DashboardPersonalizationProvider')
  return ctx
}
