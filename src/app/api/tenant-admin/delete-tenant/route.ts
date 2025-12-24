import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST: Delete a tenant and all associated data
export async function POST(req: NextRequest) {
  const { tenantId } = await req.json();
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    // 1. Delete line_items for tenant's transactions
    await supabase.rpc('delete_tenant_line_items', { p_tenant_id: tenantId });
    // 2. Delete transactions
    await supabase.from('transactions').delete().eq('tenant_id', tenantId);
    // 3. Delete documents
    await supabase.from('documents').delete().eq('tenant_id', tenantId);
    // 4. Delete bank_accounts
    await supabase.from('bank_accounts').delete().eq('tenant_id', tenantId);
    // 5. Delete bank_transactions
    await supabase.from('bank_transactions').delete().eq('tenant_id', tenantId);
    // 6. Delete the tenant
    await supabase.from('tenants').delete().eq('id', tenantId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete tenant' }, { status: 500 });
  }
}
