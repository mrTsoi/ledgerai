'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLiterals } from '@/hooks/use-literals'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { format } from 'date-fns'
import { toast } from "sonner"

interface UserSubscription {
  id: string
  user_id: string
  status: string
  current_period_end: string | null
  plan: {
    id: string
    name: string
    price_monthly: number
  }
  profile: {
    email: string
    full_name: string
  }
}

export function UserSubscriptionList() {
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [plans, setPlans] = useState<any[]>([])
  const lt = useLiterals()
  const supabase = useMemo(() => createClient(), [])

  const fetchPlans = useCallback(async () => {
    const { data } = await supabase.from('subscription_plans').select('id, name')
    if (data) setPlans(data)
  }, [supabase])

  const fetchSubscriptions = useCallback(async () => {
    try {
      setLoading(true)
      // We need to join user_subscriptions with profiles and subscription_plans
      // Since Supabase JS client doesn't support deep nested joins easily in one go for all cases,
      // we might need to use a view or multiple queries. 
      // But let's try standard join syntax if relationships are set up.
      
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          plan:subscription_plans!user_subscriptions_plan_id_fkey(id, name, price_monthly),
          profile:profiles(email, full_name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setSubscriptions(data as any || [])
    } catch (error: any) {
      console.error('Error fetching subscriptions:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchSubscriptions()
    fetchPlans()
  }, [fetchSubscriptions, fetchPlans])

  const handleStatusChange = async (subId: string, newStatus: string) => {
    try {
      const { error } = await (supabase
        .from('user_subscriptions') as any)
        .update({ status: newStatus })
        .eq('id', subId)

      if (error) throw error
      fetchSubscriptions()
      toast.success(lt('Subscription status updated'))
    } catch (error: any) {
      toast.error(lt('Error updating status: {message}', { message: error?.message ?? '' }))
    }
  }

  const handlePlanChange = async (subId: string, planId: string) => {
    try {
      const { error } = await (supabase
        .from('user_subscriptions') as any)
        .update({ plan_id: planId })
        .eq('id', subId)

      if (error) throw error
      fetchSubscriptions()
      toast.success(lt('Subscription plan updated'))
    } catch (error: any) {
      toast.error(lt('Error updating plan: {message}', { message: error?.message ?? '' }))
    }
  }

  const filteredSubs = subscriptions.filter(sub => 
    sub.profile?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.profile?.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{lt('User Subscriptions')}</CardTitle>
        <CardDescription>{lt('Manage individual user subscriptions and statuses')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={lt('Search users...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{lt('User')}</TableHead>
                <TableHead>{lt('Plan')}</TableHead>
                <TableHead>{lt('Status')}</TableHead>
                <TableHead>{lt('Renews')}</TableHead>
                <TableHead className="text-right">{lt('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubs.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{sub.profile?.full_name || lt('Unknown')}</div>
                      <div className="text-sm text-muted-foreground">{sub.profile?.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{sub.plan?.name}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={
                      sub.status === 'active' ? 'bg-green-500' : 
                      sub.status === 'past_due' ? 'bg-red-500' : 
                      'bg-gray-500'
                    }>
                      {sub.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {sub.current_period_end ? format(new Date(sub.current_period_end), 'MMM d, yyyy') : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleStatusChange(sub.id, 'active')}>
                          Mark Active
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(sub.id, 'canceled')}>
                          Cancel Subscription
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Change Plan</DropdownMenuLabel>
                        {plans.map(plan => (
                          <DropdownMenuItem key={plan.id} onClick={() => handlePlanChange(sub.id, plan.id)}>
                            Switch to {plan.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
