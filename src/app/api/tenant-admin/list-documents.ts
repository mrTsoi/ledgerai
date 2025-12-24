import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const { tenantId } = await req.json();
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
  }
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ documents: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch documents' }, { status: 500 });
  }
}
