
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { Database } from '@/types/database.types'
import { Trash2, CheckCircle } from 'lucide-react'
import { useLiterals } from '@/hooks/use-literals'

type BankTransaction = Database['public']['Tables']['bank_transactions']['Row'] & {
  source_file?: string
}

interface DuplicateGroup {
  key: string
  items: BankTransaction[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  duplicateGroups: DuplicateGroup[]
  onResolve: (idsToDelete: string[]) => Promise<void>
}

export function DuplicateResolutionModal({ isOpen, onClose, duplicateGroups, onResolve }: Props) {
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set())
  const [isResolving, setIsResolving] = useState(false)

  const lt = useLiterals()

  // Auto-select duplicates (keep the first one, select others for deletion)
  const handleAutoSelect = () => {
    const toDelete = new Set<string>()
    duplicateGroups.forEach(group => {
      // Sort by ID or creation date to be deterministic? 
      // Let's assume the first one in the list is the one to keep (or maybe the one with 'MATCHED' status?)
      // Better logic: Keep MATCHED, then PENDING.
      
      const sorted = [...group.items].sort((a, b) => {
        if (a.status === 'MATCHED' && b.status !== 'MATCHED') return -1
        if (b.status === 'MATCHED' && a.status !== 'MATCHED') return 1
        return 0
      })

      // Keep the first one (index 0), delete the rest
      for (let i = 1; i < sorted.length; i++) {
        toDelete.add(sorted[i].id)
      }
    })
    setSelectedToDelete(toDelete)
  }

  const toggleDelete = (id: string) => {
    const newSet = new Set(selectedToDelete)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedToDelete(newSet)
  }

  const handleConfirm = async () => {
    try {
      setIsResolving(true)
      await onResolve(Array.from(selectedToDelete))
      onClose()
    } finally {
      setIsResolving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{lt('Resolve Duplicates')}</DialogTitle>
          <DialogDescription>
            {lt('Found {count} groups of potential duplicates. Select the transactions you want to DELETE.', { count: duplicateGroups.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end mb-2">
          <Button variant="outline" size="sm" onClick={handleAutoSelect}>
            <CheckCircle className="w-4 h-4 mr-2" />
            {lt('Auto-Select (Keep Best)')}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-4 min-h-0">
          <div className="space-y-6">
            {duplicateGroups.map((group, idx) => (
              <div key={idx} className="border rounded-lg p-4 bg-gray-50">
                <div className="text-sm font-medium text-gray-500 mb-2">
                  {lt('Group')} {idx + 1}: {format(new Date(group.items[0].transaction_date), 'MMM d, yyyy')} • {group.items[0].amount} • {group.items[0].description}
                </div>
                <div className="space-y-2">
                  {group.items.map(item => (
                    <div key={item.id} className={`flex items-center justify-between p-3 rounded border bg-white ${selectedToDelete.has(item.id) ? 'opacity-50 bg-red-50 border-red-200' : 'border-green-200 shadow-sm'}`}>
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          checked={selectedToDelete.has(item.id)}
                          onCheckedChange={() => toggleDelete(item.id)}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.description}</span>
                            <Badge variant="outline" className="text-xs">
                              {lt(String(item.status ?? ''))}
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-500">
                            {lt('Source')}: {item.source_file || lt('Unknown')} • {lt('ID')}: ...{item.id.slice(-4)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {selectedToDelete.has(item.id) ? (
                          <span className="text-xs text-red-600 font-medium flex items-center">
                            <Trash2 className="w-3 h-3 mr-1" /> {lt('Will Delete')}
                          </span>
                        ) : (
                          <span className="text-xs text-green-600 font-medium flex items-center">
                            <CheckCircle className="w-3 h-3 mr-1" /> {lt('Will Keep')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose}>{lt('Cancel')}</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={selectedToDelete.size === 0 || isResolving}>
            {isResolving ? lt('Deleting...') : lt('Delete Selected ({count})', { count: selectedToDelete.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
