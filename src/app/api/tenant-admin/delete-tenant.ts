import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';


// POST: Delete a tenant and all associated data
export async function POST(req: NextRequest) {
  const { tenantId } = await req.json();
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
  }

  const supabase = await createClient();

  // Get current user and memberships
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check if user is SUPER_ADMIN
  const { data: isSuperAdminRaw } = await (supabase as any).rpc('is_super_admin');
  const isSuperAdmin = isSuperAdminRaw === true;

  if (!isSuperAdmin) {
    // Check if user is a member of the tenant
    const { data: membershipData, error: membershipError } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();
    if (membershipError || !membershipData) {
      return NextResponse.json({ error: 'Forbidden: You do not have access to this tenant.' }, { status: 403 });
    }
  }

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
