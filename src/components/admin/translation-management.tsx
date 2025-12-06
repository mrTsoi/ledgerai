'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Plus, Save, Trash2, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from "sonner"

interface Translation {
  id: string
  locale: string
  namespace: string
  key: string
  value: string
}

interface Language {
  code: string
  name: string
  flag_emoji: string
}

const NAMESPACES = [
  'common',
  'navigation',
  'auth',
  'accounts',
  'transactions',
  'documents',
  'reports',
  'admin',
  'errors',
  'banking'
]

export function TranslationManagement() {
  const t = useTranslations('common') // Use common for UI labels
  const [languages, setLanguages] = useState<Language[]>([])
  const [translations, setTranslations] = useState<Translation[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLocale, setSelectedLocale] = useState<string>('en')
  const [selectedNamespace, setSelectedNamespace] = useState<string>('common')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  
  // New translation state
  const [isAdding, setIsAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const supabase = createClient()

  useEffect(() => {
    fetchLanguages()
  }, [])

  useEffect(() => {
    if (selectedLocale && selectedNamespace) {
      fetchTranslations()
    }
  }, [selectedLocale, selectedNamespace])

  const fetchLanguages = async () => {
    const { data } = await supabase
      .from('system_languages')
      .select('*')
      .eq('is_active', true)
      .order('name')
    
    if (data) {
      setLanguages(data)
      // Set default if not set
      if (!selectedLocale && data.length > 0) {
        setSelectedLocale(data[0].code)
      }
    }
  }

  const fetchTranslations = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('app_translations')
      .select('*')
      .eq('locale', selectedLocale)
      .eq('namespace', selectedNamespace)
      .order('key')

    if (error) {
      console.error('Error fetching translations:', error)
    } else {
      setTranslations(data || [])
    }
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!newKey || !newValue) return

    const { error } = await supabase.from('app_translations').insert([
      {
        locale: selectedLocale,
        namespace: selectedNamespace,
        key: newKey,
        value: newValue,
      },
    ])

    if (error) {
      console.error('Error adding translation:', error)
      toast.error('Failed to add translation. Key might already exist.')
    } else {
      toast.success('Translation added successfully')
      setNewKey('')
      setNewValue('')
      setIsAdding(false)
      fetchTranslations()
    }
  }

  const handleUpdate = async (id: string) => {
    const { error } = await supabase
      .from('app_translations')
      .update({ value: editValue })
      .eq('id', id)
    if (error) {
      console.error('Error updating translation:', error)
      toast.error('Failed to update translation')
    } else {
      toast.success('Translation updated successfully')
      setEditingId(null)
      fetchTranslations()
    } fetchTranslations()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return

    const { error } = await supabase
      .from('app_translations')
      .delete()
    if (error) {
      console.error('Error deleting translation:', error)
      toast.error('Failed to delete translation')
    } else {
      toast.success('Translation deleted successfully')
      fetchTranslations()
    } else {
      fetchTranslations()
    }
  }

  const filteredTranslations = translations.filter(
    (tr) =>
      tr.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tr.value.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="flex gap-4 w-full md:w-auto">
          <div className="w-40">
            <Label className="text-xs mb-1 block">Language</Label>
            <Select value={selectedLocale} onValueChange={setSelectedLocale}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.flag_emoji} {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label className="text-xs mb-1 block">Namespace</Label>
            <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NAMESPACES.map((ns) => (
                  <SelectItem key={ns} value={ns}>
                    {ns}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <Button onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? t('cancel') : <><Plus className="w-4 h-4 mr-2" /> Add Translation</>}
        </Button>
      </div>

      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Translation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="e.g. save_button"
                />
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Translated text"
                />
              </div>
              <Button onClick={handleAdd}>
                <Save className="w-4 h-4 mr-2" /> {t('save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center space-x-2">
        <Search className="w-4 h-4 text-gray-500" />
        <Input
          placeholder="Search keys or values..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredTranslations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No translations found in database for this namespace.
                    <br />
                    <span className="text-xs">
                      (Default file-based translations are used if not overridden here)
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                filteredTranslations.map((tr) => (
                  <TableRow key={tr.id}>
                    <TableCell className="font-mono text-sm">{tr.key}</TableCell>
                    <TableCell>
                      {editingId === tr.id ? (
                        <div className="flex gap-2">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-8"
                          />
                          <Button size="sm" onClick={() => handleUpdate(tr.id)}>
                            <Save className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="cursor-pointer hover:underline decoration-dotted"
                          onClick={() => {
                            setEditingId(tr.id)
                            setEditValue(tr.value)
                          }}
                        >
                          {tr.value}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(tr.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// Helper icon
function X({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
