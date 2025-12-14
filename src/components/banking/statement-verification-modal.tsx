
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileText, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react'
import { DocumentVerificationModal } from '@/components/documents/document-verification-modal'

interface Props {
  isOpen: boolean
  onClose: () => void
  accountId: string
}

interface StatementVerification {
  id: string
  statement_date: string
  file_name: string
  document_id: string
  feed_count: number
  extracted_count: number | null
  feed_total: number | null // We might need to fetch sum, not just count
  extracted_total: number | null
  status: string
}

export function StatementVerificationModal({ isOpen, onClose, accountId }: Props) {
  const [statements, setStatements] = useState<StatementVerification[]>([])
  const [loading, setLoading] = useState(true)
  const [viewDocumentId, setViewDocumentId] = useState<string | null>(null)
  
  const supabase = useMemo(() => createClient() as any, [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      
      // Fetch statements with document data and transaction counts
      // Note: Supabase .select() with count is easy, but sum is harder without RPC.
      // We'll fetch transactions to sum them up client side if the list isn't huge, 
      // or just rely on count for now. 
      // Let's fetch all transactions for these statements to be accurate.
      
      const { data: stmts, error } = await supabase
        .from('bank_statements')
        .select(`
          id,
          statement_date,
          status,
          document:documents (
            id,
            file_name,
            document_data (
              extracted_data,
              line_items,
              total_amount
            )
          ),
          transactions:bank_transactions (
            id,
            amount
          )
        `)
        .eq('bank_account_id', accountId)
        .order('statement_date', { ascending: false })

      if (error) throw error

      const verified = (stmts as any[]).map((stmt: any) => {
        const docData = stmt.document?.document_data?.[0] // Assuming one data record per doc
        
        // For bank statements, items might be in extracted_data.bank_transactions instead of line_items
        let extractedItems = docData?.line_items || []
        if ((!extractedItems || extractedItems.length === 0) && docData?.extracted_data?.bank_transactions) {
            extractedItems = docData.extracted_data.bank_transactions
        }

        const extractedCount = Array.isArray(extractedItems) ? extractedItems.length : null
        
        // Calculate totals
        const feedTotal = (stmt.transactions || []).reduce((sum: number, t: any) => sum + (t?.amount || 0), 0)
        
        // Extracted total might be in total_amount or sum of line items
        let extractedTotal = docData?.total_amount
        if (!extractedTotal && Array.isArray(extractedItems)) {
           // Try to sum line items if total_amount is missing
           // This depends on line item structure
           extractedTotal = (Array.isArray(extractedItems) ? extractedItems : []).reduce((sum: number, item: any) => sum + (Number(item?.amount) || 0), 0)
        }

        return {
          id: stmt.id,
          statement_date: stmt.statement_date,
          file_name: stmt.document?.file_name || 'Unknown',
          document_id: stmt.document?.id,
          feed_count: stmt.transactions?.length || 0,
          extracted_count: extractedCount,
          feed_total: feedTotal,
          extracted_total: extractedTotal,
          status: stmt.status
        }
      })

      setStatements(verified)
    } catch (error) {
      console.error('Error fetching verification data:', error)
    } finally {
      setLoading(false)
    }
  }, [accountId, supabase])

  useEffect(() => {
    if (isOpen && accountId) {
      fetchData()
    }
  }, [accountId, fetchData, isOpen])

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Statement Verification</DialogTitle>
            <DialogDescription>
              Compare imported feed data against original statement documents.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Statement</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-center">Items (Feed / Doc)</TableHead>
                    <TableHead className="text-center">Total (Feed / Doc)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statements.map((stmt) => {
                    const countMismatch = stmt.extracted_count !== null && stmt.feed_count !== stmt.extracted_count
                    // Allow small floating point diff
                    const totalMismatch = stmt.extracted_total !== null && Math.abs((stmt.feed_total || 0) - (stmt.extracted_total || 0)) > 0.01
                    
                    return (
                      <TableRow key={stmt.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <span className="font-medium">{stmt.file_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{stmt.statement_date || '-'}</TableCell>
                        <TableCell className="text-center">
                          <div className={`flex items-center justify-center gap-1 ${countMismatch ? 'text-red-600 font-bold' : ''}`}>
                            <span>{stmt.feed_count}</span>
                            <span className="text-gray-400">/</span>
                            <span>{stmt.extracted_count ?? '?'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className={`flex items-center justify-center gap-1 ${totalMismatch ? 'text-red-600 font-bold' : ''}`}>
                            <span>{stmt.feed_total?.toFixed(2)}</span>
                            <span className="text-gray-400">/</span>
                            <span>{stmt.extracted_total?.toFixed(2) ?? '?'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {countMismatch || totalMismatch ? (
                            <Badge variant="destructive" className="flex w-fit items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Mismatch
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex w-fit items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Verified
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {stmt.document_id && (
                            <Button variant="ghost" size="sm" onClick={() => setViewDocumentId(stmt.document_id)}>
                              <ExternalLink className="w-4 h-4 mr-2" /> View Source
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {viewDocumentId && (
        <DocumentVerificationModal 
          documentId={viewDocumentId}
          onClose={() => setViewDocumentId(null)}
        />
      )}
    </>
  )
}
