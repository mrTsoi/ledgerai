
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ImagePreview } from '@/components/ui/image-preview'
import { Database } from '@/types/database.types'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { X, ZoomIn, ZoomOut, RotateCcw, FileText, Save, Loader2 } from 'lucide-react'
import { useLiterals } from '@/hooks/use-literals'

type BankStatement = Database['public']['Tables']['bank_statements']['Row'] & {
  documents: {
    file_name: string
    file_path: string
    file_type?: string
  } | null
}

interface Props {
  statement: BankStatement
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

export function EditStatementModal({ statement, isOpen, onClose, onSaved }: Props) {
  const lt = useLiterals()
  const [formData, setFormData] = useState({
    start_date: statement.start_date || '',
    end_date: statement.end_date || '',
    opening_balance: statement.opening_balance?.toString() || '',
    closing_balance: statement.closing_balance?.toString() || ''
  })
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(100)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  const supabase = useMemo(() => createClient(), [])

  const loadPreview = useCallback(async (path: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(path)

      if (error) throw error
      if (data) {
        setPreviewUrl(URL.createObjectURL(data))
      }
    } catch (error) {
      console.error('Error loading preview:', error)
      toast.error(lt('Failed to load document preview'))
    }
  }, [supabase, lt])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    if (isOpen && statement.documents?.file_path) {
      loadPreview(statement.documents.file_path)
    }
  }, [isOpen, loadPreview, statement.documents?.file_path])

  const handleSave = async () => {
    try {
      setSaving(true)
      const { error } = await (supabase
        .from('bank_statements') as any)
        .update({
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          opening_balance: parseFloat(formData.opening_balance) || 0,
          closing_balance: parseFloat(formData.closing_balance) || 0
        })
        .eq('id', statement.id)

      if (error) throw error

      toast.success(lt('Statement updated'))
      onSaved()
      onClose()
    } catch (error: any) {
      toast.error(lt('Failed to update: {message}', { message: error.message }))
    } finally {
      setSaving(false)
    }
  }

  // Mouse/Touch Event Handlers for Pan/Zoom
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    e.preventDefault()
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => setIsDragging(false)

  if (!isOpen) return null

  const isImage = statement.documents?.file_name.match(/\.(jpg|jpeg|png|gif|webp)$/i)

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-black/80 backdrop-blur-sm">
      {/* Left Pane: Preview */}
      <div className="relative flex-1 flex flex-col h-[40vh] lg:h-full border-b lg:border-b-0 lg:border-r border-gray-800 bg-gray-900 overflow-hidden">
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <Button 
            variant="secondary" 
            size="sm" 
            className="bg-black/50 text-white hover:bg-black/70"
            onClick={() => setZoomLevel(z => Math.max(50, z - 10))}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="px-2 py-1 bg-black/50 text-white text-sm rounded flex items-center">
            {zoomLevel}%
          </span>
          <Button 
            variant="secondary" 
            size="sm" 
            className="bg-black/50 text-white hover:bg-black/70"
            onClick={() => setZoomLevel(z => Math.min(200, z + 10))}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button 
            variant="secondary" 
            size="sm" 
            className="bg-black/50 text-white hover:bg-black/70"
            onClick={() => {
              setZoomLevel(100)
              setPosition({ x: 0, y: 0 })
            }}
            title={lt('Reset View')}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <div 
          className="flex-1 overflow-hidden flex items-center justify-center bg-gray-900 cursor-grab active:cursor-grabbing p-4 touch-none"
          onMouseDown={isImage ? handleMouseDown : undefined}
          onMouseMove={isImage ? handleMouseMove : undefined}
          onMouseUp={isImage ? handleMouseUp : undefined}
          onMouseLeave={isImage ? handleMouseUp : undefined}
        >
          {previewUrl ? (
            isImage ? (
              <ImagePreview
                src={previewUrl}
                alt={lt('Document Preview')}
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel / 100})`,
                  transition: isDragging ? 'none' : 'transform 0.2s',
                }}
                className="max-w-full max-h-full object-contain shadow-2xl select-none pointer-events-none"
              />
            ) : (
              <iframe 
                src={previewUrl} 
                className="w-full h-full bg-white"
                title={lt('PDF Preview')}
              />
            )
          ) : (
            <div className="text-white text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>{lt('Loading preview...')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: Edit Form */}
      <div className="w-full lg:w-[400px] bg-white h-[60vh] lg:h-full flex flex-col shadow-2xl">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <h2 className="font-semibold text-lg">{lt('Edit Statement')}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{lt('Start Date')}</Label>
              <Input 
                type="date" 
                value={formData.start_date} 
                onChange={e => setFormData({...formData, start_date: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>{lt('End Date')}</Label>
              <Input 
                type="date" 
                value={formData.end_date} 
                onChange={e => setFormData({...formData, end_date: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>{lt('Opening Balance')}</Label>
              <Input 
                type="number" 
                step="0.01"
                value={formData.opening_balance} 
                onChange={e => setFormData({...formData, opening_balance: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>{lt('Closing Balance')}</Label>
              <Input 
                type="number" 
                step="0.01"
                value={formData.closing_balance} 
                onChange={e => setFormData({...formData, closing_balance: e.target.value})} 
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {lt('Cancel')}
          </Button>
          <Button 
            className="flex-1" 
            onClick={handleSave} 
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {lt('Saving...')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {lt('Save Changes')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
