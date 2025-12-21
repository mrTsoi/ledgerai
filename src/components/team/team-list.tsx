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
import { useLiterals } from '@/hooks/use-literals'
import { useLocale } from 'next-intl'

type Membership = Database['public']['Tables']['memberships']['Row'] & {
  profiles: Database['public']['Tables']['profiles']['Row']
}

export function TeamList() {
  const lt = useLiterals()
  const locale = useLocale()
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
      if (!res.ok) throw new Error(json?.error || lt('Failed to load team members'))
      setMembers((json?.members || []) as Membership[])
    } catch (error) {
      console.error('Error fetching members:', error)
    } finally {
      setLoading(false)
    }
  }, [tenantId, lt])

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
          locale,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to invite member'))

      setInviteEmail('')
      await fetchMembers()
      toast.success(lt('Invite sent successfully'))

    } catch (error: any) {
      console.error('Error inviting member:', error)
      toast.error(lt('Failed to invite member: {message}', { message: error?.message }))
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm(lt('Are you sure you want to remove this member?'))) return

    try {
      const res = await fetch(`/api/team/members?id=${encodeURIComponent(memberId)}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to remove member'))
      fetchMembers()
      toast.success(lt('Member removed successfully'))
    } catch (error) {
      console.error('Error removing member:', error)
      toast.error(lt('Failed to remove member'))
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
      if (!res.ok) throw new Error(json?.error || lt('Failed to update role'))
      fetchMembers()
      toast.success(lt('Role updated successfully'))
    } catch (error) {
      console.error('Error updating role:', error)
      toast.error(lt('Failed to update role'))
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8">{lt('Loading...')}</div>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{lt('Invite New Member')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">{lt('Email Address')}</label>
              <div className="relative">
                {/* <UserPlus className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" /> */}
                <Input
                  type="email"
                  placeholder={lt('colleague@example.com')}
                  className="pl-9"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="w-48 space-y-2">
              <label className="text-sm font-medium">{lt('Role')}</label>
              <Select 
                value={inviteRole} 
                onValueChange={(v: any) => setInviteRole(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPANY_ADMIN">{lt('Admin')}</SelectItem>
                  <SelectItem value="ACCOUNTANT">{lt('Accountant')}</SelectItem>
                  <SelectItem value="OPERATOR">{lt('Operator')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={inviting}>
              {inviting ? lt('Saving...') : lt('Invite')}
            </Button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            {lt('An invite email will be sent. They can create an account if needed.')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{lt('Team Members')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{lt('Name')}</TableHead>
                <TableHead>{lt('Email')}</TableHead>
                <TableHead>{lt('Role')}</TableHead>
                <TableHead>{lt('Joined')}</TableHead>
                <TableHead className="text-right">{lt('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.profiles?.full_name || lt('Unknown')}
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
                        <SelectItem value="COMPANY_ADMIN">{lt('Admin')}</SelectItem>
                        <SelectItem value="ACCOUNTANT">{lt('Accountant')}</SelectItem>
                        <SelectItem value="OPERATOR">{lt('Operator')}</SelectItem>
                        <SelectItem value="SUPER_ADMIN" disabled>{lt('Super Admin')}</SelectItem>
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
                      {lt('Remove')}
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
