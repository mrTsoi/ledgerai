"use client"

import { BankAccountList } from '@/components/banking/bank-account-list'
import Link from 'next/link'
import { useSubscription } from '@/hooks/use-subscription'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLiterals } from '@/hooks/use-literals'

export default function BankingPage() {
  const lt = useLiterals()
  const { subscription, loading: subscriptionLoading } = useSubscription()
  const hasBankFeature = Boolean(subscription?.features?.bank_integration === true)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{lt('Banking & Reconciliation')}</h1>
        <p className="text-muted-foreground">
          {lt('Manage your bank accounts, import statements, and reconcile transactions.')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{lt('Bank feeds')}</CardTitle>
          <CardDescription>{lt('Configure OAuth connections and webhook ingestion in Settings.')}</CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptionLoading ? (
            <div className="text-sm text-muted-foreground">{lt('Checking your subscription...')}</div>
          ) : hasBankFeature ? (
            <Button asChild variant="outline">
              <Link href="../../tenant-admin?tab=bank-feeds">{lt('Open Bank Feed Settings')}</Link>
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">{lt('Bank feeds are available on paid plans only.')}</div>
              <div>
                <Link href="/dashboard/settings?tab=billing">
                  <Button variant="ghost">{lt('Upgrade')}</Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <BankAccountList />
    </div>
  )
}
