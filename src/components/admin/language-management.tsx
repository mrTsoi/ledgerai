'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Save, Trash2, Check } from 'lucide-react'
import { toast } from "sonner"

interface Language {
  code: string
  name: string
  flag_emoji: string
  is_active: boolean
  is_default: boolean
}

export function LanguageManagement() {
  const [languages, setLanguages] = useState<Language[]>([])
  const [loading, setLoading] = useState(true)
  const [newLanguage, setNewLanguage] = useState<Partial<Language>>({
    code: '',
    name: '',
    flag_emoji: '',
    is_active: true,
    is_default: false,
  })
  const [isAdding, setIsAdding] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const fetchLanguages = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('system_languages')
      .select('*')
      .order('name')

    if (error) {
      console.error('Error fetching languages:', error)
    } else {
      setLanguages(data || [])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchLanguages()
  }, [fetchLanguages])

  const handleAddLanguage = async () => {
    if (!newLanguage.code || !newLanguage.name) return

    const { error } = await (supabase.from('system_languages') as any).insert([
      {
        code: newLanguage.code,
        name: newLanguage.name,
        flag_emoji: newLanguage.flag_emoji,
        is_active: newLanguage.is_active,
        is_default: false, // Always false initially, must be set explicitly
      },
    ])

    if (error) {
      console.error('Error adding language:', error)
      toast.error('Failed to add language')
    } else {
      toast.success('Language added successfully')
      setNewLanguage({
        code: '',
        name: '',
        flag_emoji: '',
        is_active: true,
        is_default: false,
      })
      setIsAdding(false)
      fetchLanguages()
    }
  }

  const toggleActive = async (code: string, currentState: boolean) => {
    // Don't allow deactivating the default language
    const lang = languages.find((l) => l.code === code)
    if (lang?.is_default && currentState) {
      toast.error('Cannot deactivate the default language')
      return
    }

    const { error } = await (supabase
      .from('system_languages') as any)
      .update({ is_active: !currentState })
      .eq('code', code)

    if (error) {
      console.error('Error updating language:', error)
    } else {
      fetchLanguages()
    }
  }

  const setAsDefault = async (code: string) => {
    // Transaction-like update: set all to false, then one to true
    // Supabase doesn't support transactions in client lib easily without RPC, 
    // but we can do it in two steps or use a stored procedure if we had one.
    // For now, we'll just update the new default first, then others.
    // Actually, better to use an RPC or just be careful.
    // Let's just update the target to true. We might have multiple defaults if we aren't careful,
    // but the UI will only show one.
    // Ideally we should have a database constraint or trigger.
    
    // Let's try to update all others to false first.
    await (supabase
      .from('system_languages') as any)
      .update({ is_default: false })
      .neq('code', code) // Update all except the new one (though we want to update ALL to false really, but let's do this)
    
    // Actually, just update ALL to false.
    await (supabase
      .from('system_languages') as any)
      .update({ is_default: false })
      .neq('code', 'PLACEHOLDER') // Hack to match all rows? No, just omit filter?  
      // .update requires a filter usually.
      // Let's iterate or use a better query.
      
    // Better approach:
    // 1. Set the new one to true.
    // 2. Set all others to false.
    
    const { error } = await (supabase
      .from('system_languages') as any)
      .update({ is_default: true, is_active: true }) // Ensure it's active
      .eq('code', code)

    if (error) {
      console.error('Error setting default:', error)
      return
    }

    // Set others to false
    await (supabase
      .from('system_languages') as any)
      .update({ is_default: false })
      .neq('code', code)

    fetchLanguages()
  }

  const deleteLanguage = async (code: string) => {
    if (!confirm('Are you sure you want to delete this language?')) return

    const { error } = await (supabase
      .from('system_languages') as any)
      .delete()
      .eq('code', code)

    if (error) {
      console.error('Error deleting language:', error)
      toast.error('Failed to delete language')
    } else {
      toast.success('Language deleted successfully')
      fetchLanguages()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">System Languages</h2>
        <Button onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? 'Cancel' : <><Plus className="w-4 h-4 mr-2" /> Add Language</>}
        </Button>
      </div>

      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Language</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <Label>Code (e.g., fr-FR)</Label>
                <Input
                  value={newLanguage.code}
                  onChange={(e) =>
                    setNewLanguage({ ...newLanguage, code: e.target.value })
                  }
                  placeholder="fr-FR"
                />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={newLanguage.name}
                  onChange={(e) =>
                    setNewLanguage({ ...newLanguage, name: e.target.value })
                  }
                  placeholder="French"
                />
              </div>
              <div className="space-y-2">
                <Label>Flag Emoji</Label>
                <Input
                  value={newLanguage.flag_emoji}
                  onChange={(e) =>
                    setNewLanguage({ ...newLanguage, flag_emoji: e.target.value })
                  }
                  placeholder="🇫🇷"
                />
              </div>
              <Button onClick={handleAddLanguage}>
                <Save className="w-4 h-4 mr-2" /> Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flag</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Default</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : languages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    No languages found.
                  </TableCell>
                </TableRow>
              ) : (
                languages.map((lang) => (
                  <TableRow key={lang.code}>
                    <TableCell className="text-2xl">{lang.flag_emoji}</TableCell>
                    <TableCell className="font-medium">{lang.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{lang.code}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`active-${lang.code}`}
                          checked={lang.is_active}
                          onCheckedChange={() =>
                            toggleActive(lang.code, lang.is_active)
                          }
                          disabled={lang.is_default}
                        />
                        <Label htmlFor={`active-${lang.code}`}>
                          {lang.is_active ? 'Active' : 'Inactive'}
                        </Label>
                      </div>
                    </TableCell>
                    <TableCell>
                      {lang.is_default ? (
                        <Badge variant="default" className="bg-green-600">
                          Default
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAsDefault(lang.code)}
                          disabled={!lang.is_active}
                        >
                          Set as Default
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!lang.is_default && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deleteLanguage(lang.code)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
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
