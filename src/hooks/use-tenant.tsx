'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Database } from '@/types/database.types'

type Tenant = Database['public']['Tables']['tenants']['Row']
type Membership = Database['public']['Tables']['memberships']['Row']

interface TenantContextType {
  currentTenant: Tenant | null
  tenants: Tenant[]
  memberships: Membership[]
  loading: boolean
  isSuperAdmin: boolean
  switchTenant: (tenantId: string) => void
  refreshTenants: () => Promise<void>
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const fetchTenantsAndMemberships = async () => {
    try {
      setLoading(true)

      if (typeof window === 'undefined') return

      const storedTenantId = localStorage.getItem('currentTenantId')
      const hostname = window.location.hostname

      const qs = hostname ? `?hostname=${encodeURIComponent(hostname)}` : ''
      const res = await fetch(`/api/tenant-context${qs}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTenants([])
        setMemberships([])
        setIsSuperAdmin(false)
        setCurrentTenant(null)
        return
      }

      const tenantData = (json?.tenants || []) as Tenant[]
      const membershipData = (json?.memberships || []) as Membership[]

      setTenants(tenantData)
      setMemberships(membershipData)
      setIsSuperAdmin(!!json?.isSuperAdmin)

      // Select current tenant: localStorage -> verified custom domain mapping -> first tenant
      let tenant = tenantData.find((t) => t.id === storedTenantId) || null

      if (!tenant) {
        const mappedTenantId = (json?.mapped_tenant_id as string | null | undefined) || null
        if (mappedTenantId) {
          const mapped = tenantData.find((t) => t.id === mappedTenantId) || null
          if (mapped) {
            tenant = mapped
            localStorage.setItem('currentTenantId', mappedTenantId)
          }
        }
      }

      if (!tenant) tenant = tenantData[0] || null
      setCurrentTenant(tenant)
    } catch (error) {
      console.error('Error in fetchTenantsAndMemberships:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTenantsAndMemberships()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchTenant = (tenantId: string) => {
    const tenant = tenants.find((t) => t.id === tenantId)
    if (tenant) {
      setCurrentTenant(tenant)
      localStorage.setItem('currentTenantId', tenantId)
    }
  }

  const refreshTenants = async () => {
    await fetchTenantsAndMemberships()
  }

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        tenants,
        memberships,
        loading,
        isSuperAdmin,
        switchTenant,
        refreshTenants,
      }}
    >
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}

// Hook to get current user's role in the current tenant
export function useUserRole() {
  const { currentTenant, memberships, isSuperAdmin } = useTenant()
  
  if (isSuperAdmin) return 'SUPER_ADMIN'
  if (!currentTenant) return null
  
  const membership = memberships.find((m) => m.tenant_id === currentTenant.id)
  return membership?.role || null
}

// Hook to check if user has specific role
export function useHasRole(roles: string[]) {
  const role = useUserRole()
  return role ? roles.includes(role) : false
}
