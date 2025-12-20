'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { FileText, Download, Trash2, Loader2, Pencil, ShieldCheck, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'
import { EditStatementModal } from './edit-statement-modal'
import { StatementVerificationModal } from './statement-verification-modal'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useLiterals } from '@/hooks/use-literals'

type BankStatement = Database['public']['Tables']['bank_statements']['Row'] & {
  documents: {
    file_name: string
    file_path: string
    validation_flags: string[] | null
    document_data: {
      confidence_score: number | null
    }[]
  } | null
}

interface Props {
  accountId: string
}

export function BankStatementList({ accountId }: Props) {
  const lt = useLiterals()
  const [statements, setStatements] = useState<BankStatement[]>([])
  const [loading, setLoading] = useState(true)
  const [reprocessingId, setReprocessingId] = useState<string | null>(null)
  const [editingStatement, setEditingStatement] = useState<BankStatement | null>(null)
  const [isVerificationOpen, setIsVerificationOpen] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const fetchStatements = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('bank_statements')
        .select(`
          *,
          documents (
            file_name,
            file_path,
            validation_flags,
            document_data (
              confidence_score
            )
          )
        `)
        .eq('bank_account_id', accountId)
        .order('start_date', { ascending: false })

      if (error) throw error
      setStatements(data as any)
    } catch (error) {
      console.error('Error fetching statements:', error)
    } finally {
      setLoading(false)
    }
  }, [accountId, supabase])

  useEffect(() => {
    fetchStatements()
  }, [fetchStatements])

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(filePath)

      if (error) throw error

      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading file:', error)
      toast.error(lt('Failed to download file'))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(lt('Are you sure you want to delete this statement? This will also delete all associated transactions.'))) return

    try {
      const { error } = await (supabase
        .from('bank_statements') as any)
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success(lt('Statement deleted'))
      await fetchStatements()
    } catch (error) {
      console.error('Error deleting statement:', error)
      toast.error(lt('Failed to delete statement'))
    }
  }

  const handleReprocess = async (id: string) => {
    const statement = statements.find(s => s.id === id)
    if (!statement || !statement.document_id) {
      toast.error(lt('Cannot reprocess: Missing document'))
        return
    }

    try {
      setReprocessingId(id)
      toast.info(lt('Starting reprocessing...'))

      // 1. Reset status to IMPORTED (valid enum value)
      const { error } = await (supabase
        .from('bank_statements') as any)
        .update({ status: 'IMPORTED' }) 
        .eq('id', id)

      if (error) throw error

      // 2. Trigger processing
      const response = await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: statement.document_id })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || lt('Processing failed'))
      }

      toast.success(lt('Statement reprocessed successfully'))
      
      // 3. Refresh list to show updated data
      await fetchStatements()
    } catch (error: any) {
      console.error('Error reprocessing statement:', error)
      toast.error(lt('Failed to reprocess: {message}', { message: error.message }))
    } finally {
      setReprocessingId(null)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }

  if (statements.length === 0) {
    return (
      <div className="text-center p-8 border rounded-md bg-gray-50">
        <FileText className="w-12 h-12 mx-auto text-gray-400 mb-3" />
        <h3 className="text-lg font-medium text-gray-900">{lt('No Statements Found')}</h3>
        <p className="text-gray-500">{lt('Upload a bank statement to get started.')}</p>
      </div>
    )
  }

  return (
    <div className="border rounded-md">
      <div className="p-4 border-b flex justify-between items-center bg-gray-50">
        <h3 className="font-medium">{lt('Statement History')}</h3>
        <Button variant="outline" size="sm" onClick={() => setIsVerificationOpen(true)}>
          <ShieldCheck className="w-4 h-4 mr-2" />
          {lt('Verify All')}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{lt('Period')}</TableHead>
            <TableHead>{lt('File Name')}</TableHead>
            <TableHead className="text-right">{lt('Opening Balance')}</TableHead>
            <TableHead className="text-right">{lt('Closing Balance')}</TableHead>
            <TableHead>{lt('AI Analysis')}</TableHead>
            <TableHead>{lt('Status')}</TableHead>
            <TableHead className="text-right">{lt('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statements.map((statement) => {
            const docData = statement.documents?.document_data?.[0]
            const confidence = docData?.confidence_score || 0
            const flags = statement.documents?.validation_flags || []
            
            return (
            <TableRow key={statement.id}>
              <TableCell>
                {statement.start_date && statement.end_date ? (
                  <>
                    {format(new Date(statement.start_date), 'MMM d, yyyy')} - {format(new Date(statement.end_date), 'MMM d, yyyy')}
                  </>
                ) : (
                  <span className="text-gray-400">{lt('Unknown Period')}</span>
                )}
              </TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  {statement.documents?.file_name || lt('Unknown File')}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {statement.opening_balance?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </TableCell>
              <TableCell className="text-right">
                {statement.closing_balance?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {confidence > 0 && (
                    <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      confidence > 0.8 ? 'bg-green-100 text-green-700' : 
                      confidence > 0.5 ? 'bg-yellow-100 text-yellow-700' : 
                      'bg-red-100 text-red-700'
                    }`}>
                      {Math.round(confidence * 100)}%
                    </div>
                  )}
                  {flags.length > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <ul className="list-disc list-inside text-xs">
                            {flags.map((flag, i) => (
                              <li key={i}>{flag}</li>
                            ))}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                  ${statement.status === 'RECONCILED' ? 'bg-green-100 text-green-800' : 
                    statement.status === 'PROCESSED' ? 'bg-blue-100 text-blue-800' : 
                    'bg-gray-100 text-gray-800'}`}>
                  {statement.status}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setEditingStatement(statement)}
                    title="Edit Details"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => handleReprocess(statement.id)}
                    title="Reprocess"
                    disabled={reprocessingId === statement.id}
                  >
                    {reprocessingId === statement.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>

                  {statement.documents?.file_path && (
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleDownload(statement.documents!.file_path, statement.documents!.file_name)}
                      title="Download Original"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                  
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDelete(statement.id)}
                    title="Delete Statement"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {editingStatement && (
        <EditStatementModal 
          statement={editingStatement}
          isOpen={!!editingStatement}
          onClose={() => setEditingStatement(null)}
          onSaved={fetchStatements}
        />
      )}

      <StatementVerificationModal 
        isOpen={isVerificationOpen}
        onClose={() => setIsVerificationOpen(false)}
        accountId={accountId}
      />
    </div>
  )
}
