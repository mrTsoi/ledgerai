'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Save, ServerCog } from 'lucide-react'

interface BatchConfig {
  default_batch_size: number
  max_batch_size: number
}

const DEFAULT_CONFIG: BatchConfig = {
  default_batch_size: 10,
  max_batch_size: 100
}

export function ProcessingSettings() {
  const [config, setConfig] = useState<BatchConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await (supabase
        .from('system_settings') as any)
        .select('setting_value')
        .eq('setting_key', 'batch_processing_config')
        .single()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setConfig(data.setting_value as BatchConfig)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
      toast.error('Failed to load processing settings')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSave = async () => {
    try {
      setSaving(true)
      
      // Validation
      if (config.default_batch_size > config.max_batch_size) {
        toast.error('Default batch size cannot exceed max batch size')
        return
      }

      const { error } = await (supabase
        .from('system_settings') as any)
        .upsert({
          setting_key: 'batch_processing_config',
          setting_value: config as any,
          description: 'Configuration for concurrent batch processing limits',
          is_public: true
        }, { onConflict: 'setting_key' })

      if (error) throw error
      toast.success('Settings saved successfully')
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ServerCog className="h-5 w-5 text-blue-600" />
          <CardTitle>Concurrent Batch Processing</CardTitle>
        </div>
        <CardDescription>
          Configure global limits for concurrent processing. These settings define the boundaries for all tenants.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Default Batch Size</Label>
            <Input 
              type="number"
              min={1}
              value={config.default_batch_size} 
              onChange={(e) => setConfig({...config, default_batch_size: parseInt(e.target.value) || 0})}
            />
            <p className="text-sm text-muted-foreground">
              The default number of items processed concurrently if a tenant hasn&apos;t configured their own limit.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Max Batch Size Limit</Label>
            <Input 
              type="number"
              min={1}
              value={config.max_batch_size} 
              onChange={(e) => setConfig({...config, max_batch_size: parseInt(e.target.value) || 0})}
            />
            <p className="text-sm text-muted-foreground">
              The absolute maximum batch size a tenant can configure, regardless of their preference.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
