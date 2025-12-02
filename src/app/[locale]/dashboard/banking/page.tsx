import { BankAccountList } from '@/components/banking/bank-account-list'

export default function BankingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Banking & Reconciliation</h1>
        <p className="text-muted-foreground">
          Manage your bank accounts, import statements, and reconcile transactions.
        </p>
      </div>

      <BankAccountList />
    </div>
  )
}
