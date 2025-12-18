import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AIProcessingService } from '@/lib/ai/document-processor'
import { userHasFeature } from '@/lib/subscription/server'

/**
 * POST /api/documents/process
 * Trigger AI processing for a document
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    try {
      const ok = await userHasFeature(supabase, user.id, 'ai_access')
      if (!ok) {
        return NextResponse.json({ error: 'AI automation is not available on your plan' }, { status: 403 })
      }
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
    }

    // Get document ID from request body
    const body = await request.json()
    const { documentId } = body

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      )
    }

    // Verify user has access to this document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*, tenants!inner(*)')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Verify user is a member of the document's tenant
    const { data: membership } = await supabase
      .from('memberships')
      .select('*')
      .eq('user_id', user.id)
      .eq('tenant_id', document.tenant_id)
      .eq('is_active', true)
      .single()

    if (!membership) {
      return NextResponse.json(
        { error: 'Unauthorized access to this document' },
        { status: 403 }
      )
    }

    // Process document
    // We await here to return the validation status to the UI
    const result = await AIProcessingService.processDocument(documentId)

    if (!result.success) {
       return NextResponse.json(
        { error: result.error || 'Processing failed' },
        { status: result.statusCode || 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Document processed successfully',
      documentId,
      validationStatus: result.validationStatus,
      validationFlags: result.validationFlags
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/*
 * GET /api/documents/[id]
 * Get document details including extracted data
 * 
 * NOTE: This handler is commented out because it was in the wrong file (process/route.ts)
 * and caused build errors. It should be in [id]/route.ts if needed.
 */
/*
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const documentId = params.id

    // Get document with extracted data
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select(`
        *,
        document_data (*)
      `)
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Verify access
    const { data: membership } = await supabase
      .from('memberships')
      .select('*')
      .eq('user_id', user.id)
      .eq('tenant_id', document.tenant_id)
      .eq('is_active', true)
      .single()

    if (!membership) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    return NextResponse.json({ document })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
*/
