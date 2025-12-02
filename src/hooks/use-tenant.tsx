'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
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
  const supabase = createClient()

  const fetchTenantsAndMemberships = async () => {
    try {
      setLoading(true)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Fetch user's memberships
      const { data: membershipData, error: membershipError } = await supabase
        .from('memberships')
        .select('*')
        .eq('user_id', user.id)

      if (membershipError) {
        console.error('Error fetching memberships:', membershipError)
        setLoading(false)
        return
      }

      // Filter active memberships client-side
      const activeMemberships = (membershipData || []).filter(m => m.is_active !== false)
      setMemberships(activeMemberships)

      // Check for Super Admin role
      const superAdminStatus = activeMemberships.some(m => m.role === 'SUPER_ADMIN')
      setIsSuperAdmin(superAdminStatus)

      let tenantData: Tenant[] = []

      if (superAdminStatus) {
        // Super Admin sees ALL tenants
        const { data, error } = await supabase
          .from('tenants')
          .select('*')
          .order('name')
        
        if (error) {
          console.error('Error fetching all tenants:', error)
        } else {
          tenantData = data || []
        }
      } else {
        // Regular users see only their tenants
        const tenantIds = activeMemberships?.map((m) => m.tenant_id) || []
        if (tenantIds.length > 0) {
          const { data, error } = await supabase
            .from('tenants')
            .select('*')
            .in('id', tenantIds)

          if (error) {
            console.error('Error fetching tenants:', error)
          } else {
            tenantData = data || []
          }
        }
      }

      setTenants(tenantData)

      // Set current tenant from localStorage or first tenant
      const storedTenantId = localStorage.getItem('currentTenantId')
      const tenant = tenantData.find((t) => t.id === storedTenantId) || tenantData[0]
      setCurrentTenant(tenant || null)
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
