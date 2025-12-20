"use client"

import { BankAccountList } from '@/components/banking/bank-account-list'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLiterals } from '@/hooks/use-literals'

export default function BankingPage() {
  const lt = useLiterals()

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
          <Button asChild variant="outline">
            <Link href="../settings?tab=bank-feeds">{lt('Open Bank Feed Settings')}</Link>
          </Button>
        </CardContent>
      </Card>

      <BankAccountList />
    </div>
  )
}
