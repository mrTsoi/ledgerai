'use client'

import { useState, useEffect } from 'react'
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
import { FileText, Download, Trash2, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

type BankStatement = Database['public']['Tables']['bank_statements']['Row'] & {
  documents: {
    file_name: string
    file_path: string
  } | null
}

interface Props {
  accountId: string
}

export function BankStatementList({ accountId }: Props) {
  const [statements, setStatements] = useState<BankStatement[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchStatements()
  }, [accountId])

  const fetchStatements = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('bank_statements')
        .select(`
          *,
          documents (
            file_name,
            file_path
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
  }

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
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this statement? This will also delete all associated transactions.')) return

    try {
      const { error } = await supabase
        .from('bank_statements')
        .delete()
        .eq('id', id)

      if (error) throw error
      fetchStatements()
    } catch (error) {
      console.error('Error deleting statement:', error)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }

  if (statements.length === 0) {
    return (
      <div className="text-center p-8 border rounded-md bg-gray-50">
        <FileText className="w-12 h-12 mx-auto text-gray-400 mb-3" />
        <h3 className="text-lg font-medium text-gray-900">No Statements Found</h3>
        <p className="text-gray-500">Upload a bank statement to get started.</p>
      </div>
    )
  }

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead>File Name</TableHead>
            <TableHead className="text-right">Opening Balance</TableHead>
            <TableHead className="text-right">Closing Balance</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statements.map((statement) => (
            <TableRow key={statement.id}>
              <TableCell>
                {statement.start_date && statement.end_date ? (
                  <>
                    {format(new Date(statement.start_date), 'MMM d, yyyy')} - {format(new Date(statement.end_date), 'MMM d, yyyy')}
                  </>
                ) : (
                  <span className="text-gray-400">Unknown Period</span>
                )}
              </TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  {statement.documents?.file_name || 'Unknown File'}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {statement.opening_balance?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </TableCell>
              <TableCell className="text-right">
                {statement.closing_balance?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
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
                <div className="flex justify-end gap-2">
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
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
