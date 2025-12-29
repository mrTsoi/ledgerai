"use client"

import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useLiterals } from '@/hooks/use-literals'

interface Props {
  result: {
    bankAccountId?: string | null
    bankStatementId?: string | null
    transactionsInserted?: number
    transactionId?: string | null
    transactionStatus?: string | null
    message?: string
  }
  onClose: () => void
}

export default function VerificationResultModal({ result, onClose }: Props) {
  const lt = useLiterals()
  const ltVars = (english: string, vars?: Record<string, string | number>) => lt(english, vars)

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-xl p-4">
        <Card>
          <CardHeader>
            <CardTitle>{lt('Verification Result')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-gray-700">
              {result.bankAccountId && <div>{ltVars('Bank account created/linked: {id}', { id: result.bankAccountId })}</div>}
              {result.bankStatementId && <div>{ltVars('Bank statement created/updated: {id}', { id: result.bankStatementId })}</div>}
              {typeof result.transactionsInserted === 'number' && (
                <div>{ltVars('{count} transaction(s) inserted', { count: result.transactionsInserted })}</div>
              )}
              {result.transactionId && <div>{ltVars('Transaction updated/created: {id}', { id: result.transactionId })}</div>}
              {result.transactionStatus && <div className="text-xs text-gray-500">{ltVars('Transaction status: {status}', { status: result.transactionStatus })}</div>}

              {result.message && <div className="text-xs text-gray-600">{result.message}</div>}

              <div className="pt-3 flex gap-2">
                {result.bankAccountId && (
                  <Link href={`/dashboard/banking/${result.bankAccountId}`}>
                    <Button size="sm">{lt('Open Bank Account')}</Button>
                  </Link>
                )}

                {result.bankStatementId && result.bankAccountId && (
                  <Link href={`/dashboard/banking/${result.bankAccountId}#statements`}>
                    <Button size="sm" variant="outline">{lt('View Statement')}</Button>
                  </Link>
                )}

                {result.transactionId ? (
                  <Link href={`/dashboard/transactions`}>
                    <Button size="sm" variant="ghost">{lt('Open Transaction')}</Button>
                  </Link>
                ) : null}

                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    const text = `bankAccountId:${result.bankAccountId || ''}\nbankStatementId:${result.bankStatementId || ''}\ntransactions:${result.transactionsInserted || 0}\ntransactionId:${result.transactionId || ''}\ntransactionStatus:${result.transactionStatus || ''}`
                    await navigator.clipboard.writeText(text)
                    toast.success(lt('Copied IDs to clipboard'))
                  } catch (e) {
                    toast.error(lt('Failed to copy'))
                  }
                }}>{lt('Copy IDs')}</Button>

                <Button size="sm" variant="ghost" onClick={onClose}>{lt('Close')}</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
