'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTenant } from '@/hooks/use-tenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
// import { Loader2, Trash2, UserPlus } from 'lucide-react'
import { Database } from '@/types/database.types'
import { toast } from "sonner"

type Membership = Database['public']['Tables']['memberships']['Row'] & {
  profiles: Database['public']['Tables']['profiles']['Row']
}

export function TeamList() {
  const { currentTenant } = useTenant()
  const tenantId = currentTenant?.id
  const [members, setMembers] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'COMPANY_ADMIN' | 'ACCOUNTANT' | 'OPERATOR'>('OPERATOR')
  const [inviting, setInviting] = useState(false)

  const fetchMembers = useCallback(async () => {
    if (!tenantId) return

    try {
      setLoading(true)
      const res = await fetch(`/api/team/members?tenant_id=${encodeURIComponent(tenantId)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load team members')
      setMembers((json?.members || []) as Membership[])
    } catch (error) {
      console.error('Error fetching members:', error)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail || !currentTenant) return

    try {
      setInviting(true)

      const res = await fetch('/api/team/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: currentTenant.id,
          email: inviteEmail,
          role: inviteRole,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to invite member')

      setInviteEmail('')
      await fetchMembers()
      toast.success('Member added successfully!')

    } catch (error: any) {
      console.error('Error inviting member:', error)
      toast.error('Failed to invite member: ' + error.message)
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return

    try {
      const res = await fetch(`/api/team/members?id=${encodeURIComponent(memberId)}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to remove member')
      fetchMembers()
      toast.success('Member removed successfully')
    } catch (error) {
      console.error('Error removing member:', error)
      toast.error('Failed to remove member')
    }
  }

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      const res = await fetch('/api/team/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: memberId, role: newRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to update role')
      fetchMembers()
      toast.success('Role updated successfully')
    } catch (error) {
      console.error('Error updating role:', error)
      toast.error('Failed to update role')
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite New Member</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <div className="relative">
                {/* <UserPlus className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" /> */}
                <Input
                  type="email"
                  placeholder="colleague@example.com"
                  className="pl-9"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="w-48 space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select 
                value={inviteRole} 
                onValueChange={(v: any) => setInviteRole(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPANY_ADMIN">Admin</SelectItem>
                  <SelectItem value="ACCOUNTANT">Accountant</SelectItem>
                  <SelectItem value="OPERATOR">Operator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={inviting}>
              {inviting ? 'Saving...' : 'Invite'}
            </Button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            Note: The user must already have an account on the platform to be invited.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.profiles?.full_name || 'Unknown'}
                  </TableCell>
                  <TableCell>{member.profiles?.email}</TableCell>
                  <TableCell>
                    <Select 
                      defaultValue={member.role ?? undefined} 
                      onValueChange={(v) => handleRoleChange(member.id, v)}
                    >
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COMPANY_ADMIN">Admin</SelectItem>
                        <SelectItem value="ACCOUNTANT">Accountant</SelectItem>
                        <SelectItem value="OPERATOR">Operator</SelectItem>
                        <SelectItem value="SUPER_ADMIN" disabled>Super Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {member.created_at ? new Date(member.created_at).toLocaleDateString() : ''}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleRemoveMember(member.id)}
                      disabled={member.role === 'SUPER_ADMIN'}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
