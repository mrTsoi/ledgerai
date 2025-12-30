'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Search, UserPlus, Shield, Building2, Mail, User } from 'lucide-react'
import { format } from 'date-fns'
import { Database } from '@/types/database.types'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'

type AdminUserView = {
  user_id: string
  email: string
  full_name: string
  user_created_at: string
  tenant_id: string | null
  tenant_name: string | null
  role: 'COMPANY_ADMIN' | 'ACCOUNTANT' | 'OPERATOR' | 'SUPER_ADMIN' | null
  membership_active: boolean | null
}

type Tenant = Database['public']['Tables']['tenants']['Row']

export function UserManagement() {
  const lt = useLiterals()
  const [users, setUsers] = useState<AdminUserView[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUserView | null>(null)
  
  const supabase = useMemo(() => createClient(), [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      
      // Fetch users view
      const { data: usersData, error: usersError } = await supabase
        .from('admin_user_view')
        .select('*')
        .order('user_created_at', { ascending: false })

      if (usersError) throw usersError
      setUsers(usersData || [])

      // Fetch tenants for assignment dropdown
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (tenantsError) throw tenantsError
      setTenants(tenantsData || [])

    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAssignUser = async (userId: string, tenantId: string, role: string) => {
    try {
      const { error } = await (supabase
        .from('memberships') as any)
        .upsert({
          user_id: userId,
          tenant_id: tenantId,
          role: role as any,
          is_active: true
        }, { onConflict: 'user_id, tenant_id' })

      if (error) throw error

      toast.success('User assigned successfully')
      // Don't close modal, just refresh data so user can see the new assignment
      fetchData()
    } catch (error: any) {
      console.error('Error assigning user:', error)
      toast.error('Failed to assign user: ' + error.message)
    }
  }

  const handleRemoveAccess = async (userId: string, tenantId: string) => {
    if (!confirm('Are you sure you want to remove access to this tenant?')) return

    try {
      const { error } = await (supabase
        .from('memberships') as any)
        .delete()
        .match({ user_id: userId, tenant_id: tenantId })

      if (error) throw error

      toast.success('Access removed successfully')
      fetchData()
    } catch (error: any) {
      console.error('Error removing access:', error)
      toast.error('Failed to remove access: ' + error.message)
    }
  }

  const filteredUsers = users.filter(user => 
    (user.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
     user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     user.tenant_name?.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Group users by ID to handle multiple memberships
  const groupedUsers = filteredUsers.reduce((acc, curr) => {
    if (!acc[curr.user_id]) {
      acc[curr.user_id] = {
        ...curr,
        memberships: []
      }
    }
    if (curr.tenant_id) {
      acc[curr.user_id].memberships.push({
        tenant_id: curr.tenant_id,
        tenant_name: curr.tenant_name,
        role: curr.role,
        active: curr.membership_active
      })
    }
    return acc
  }, {} as Record<string, AdminUserView & { memberships: any[] }>)

  const userList = Object.values(groupedUsers)

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{lt('User Management')}</CardTitle>
            <CardDescription>{lt('Manage users, roles, and tenant assignments')}</CardDescription>
          </div>
          {/* <Button onClick={() => setShowAssignModal(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Invite User
          </Button> */}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder={lt('Search users by name, email, or tenant...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="space-y-4">
          {userList.map((user) => (
            <div key={user.user_id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-gray-100 rounded-full">
                    <User className="w-6 h-6 text-gray-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{user.full_name || lt('Unknown Name')}</h3>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {format(new Date(user.user_created_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                      <Mail className="w-3 h-3" />
                      {user.email}
                    </div>
                    
                    <div className="mt-3 flex flex-wrap gap-2">
                      {user.memberships.length > 0 ? (
                        user.memberships.map((m: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-md text-sm border border-blue-100">
                            <Building2 className="w-3 h-3" />
                            <span className="font-medium">{m.tenant_name}</span>
                            <span className="text-blue-400">|</span>
                            <Shield className="w-3 h-3" />
                            <span className="capitalize">{m.role?.replace('_', ' ').toLowerCase()}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-sm text-gray-400 italic">No tenant assignments</span>
                      )}
                    </div>
                  </div>
                </div>

                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setSelectedUser(user)
                    setShowAssignModal(true)
                  }}
                >
                  Manage Access
                </Button>
              </div>
            </div>
          ))}

          {userList.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No users found</p>
            </div>
          )}
        </div>
      </CardContent>

      {showAssignModal && selectedUser && (
        <ManageAccessModal 
          user={selectedUser} 
          tenants={tenants}
          onClose={() => {
            setShowAssignModal(false)
            setSelectedUser(null)
          }}
          onAssign={handleAssignUser}
          onRemove={handleRemoveAccess}
        />
      )}
    </Card>
  )
}

function ManageAccessModal({ 
  user, 
  tenants, 
  onClose, 
  onAssign,
  onRemove
}: { 
  user: AdminUserView & { memberships?: any[] }, 
  tenants: Tenant[], 
  onClose: () => void,
  onAssign: (userId: string, tenantId: string, role: string) => void
  onRemove: (userId: string, tenantId: string) => void
}) {
  const lt = useLiterals()
  const [tenantId, setTenantId] = useState('')
  const [role, setRole] = useState('OPERATOR')

  // Filter out tenants that are already assigned
  const assignedTenantIds = new Set(user.memberships?.map(m => m.tenant_id) || [])
  const availableTenants = tenants.filter(t => !assignedTenantIds.has(t.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{lt('Manage Access: {name}', { name: user.full_name })}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>
        
        {/* Existing Assignments */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-500 mb-3">{lt('Current Assignments')}</h4>
          <div className="space-y-2">
            {user.memberships && user.memberships.length > 0 ? (
              user.memberships.map((m: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div>
                    <div className="font-medium">{m.tenant_name}</div>
                    <div className="text-xs text-gray-500 capitalize">{m.role?.replace('_', ' ').toLowerCase()}</div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => onRemove(user.user_id, m.tenant_id)}
                  >
                    {lt('Remove')}
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400 italic">{lt('No active assignments')}</p>
            )}
          </div>
        </div>

        {/* Add New Assignment */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium text-gray-500 mb-3">{lt('Add New Assignment')}</h4>
          <div className="space-y-4">
            <div>
              <Label>{lt('Select Tenant')}</Label>
              <select 
                className="w-full p-2 border rounded-md mt-1"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              >
                <option value="">{lt('Select a tenant...')}</option>
                {availableTenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>{lt('Select Role')}</Label>
              <select 
                className="w-full p-2 border rounded-md mt-1"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="OPERATOR">{lt('Operator')}</option>
                <option value="ACCOUNTANT">{lt('Accountant')}</option>
                <option value="COMPANY_ADMIN">{lt('Company Admin')}</option>
                <option value="SUPER_ADMIN">{lt('Super Admin')}</option>
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <Button 
                className="flex-1" 
                onClick={() => {
                  onAssign(user.user_id, tenantId, role)
                  setTenantId('') // Reset selection
                }}
                disabled={!tenantId}
              >
                Assign Role
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
