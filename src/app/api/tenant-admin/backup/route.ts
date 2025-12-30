
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const { tenantId } = await req.json();
  if (!tenantId || typeof tenantId !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid tenantId' }, { status: 400 });
  }
  const supabase = await createClient();

  // Get current user and memberships
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check if user is SUPER_ADMIN
  const { data: isSuperAdminRaw, error: isSuperError } = await (supabase as any).rpc('is_super_admin');
  if (isSuperError) {
    return NextResponse.json({ error: 'Failed to verify admin status' }, { status: 500 });
  }
  const isSuperAdmin = isSuperAdminRaw === true;

  // Enforce subscription: non-super-admins must be on a paid plan to use backup
  if (!isSuperAdmin) {
    const { data: userSubscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (subError) return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 });
    const subRow: any = userSubscription || null;
    const isFreePlan = !subRow ||
      ((subRow.plan_name && String(subRow.plan_name).toLowerCase().includes('free')) ||
       (subRow.subscription_tier && String(subRow.subscription_tier).toLowerCase() === 'free') ||
       (subRow.tier && String(subRow.tier).toLowerCase() === 'free'));
    if (isFreePlan) {
      return NextResponse.json({ error: 'Backup requires a paid subscription. Please upgrade to access this feature.' }, { status: 403 });
    }
  }

  if (!isSuperAdmin) {
    // Check if user is a tenant admin (explicit role) for this tenant.
    // Only tenant-level admins (e.g. COMPANY_ADMIN) may request backups for their tenant.
    const { data: membershipData, error: membershipError } = await supabase
      .from('memberships')
      .select('id, role, is_active')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (membershipError || !membershipData || membershipData.is_active === false) {
      return NextResponse.json({ error: 'Forbidden: You do not have access to this tenant.' }, { status: 403 });
    }

    const allowedRoles = ['COMPANY_ADMIN', 'SUPER_ADMIN'];
    if (!allowedRoles.includes((membershipData.role || '').toString())) {
      return NextResponse.json({ error: 'Forbidden: insufficient role for backup.' }, { status: 403 });
    }
  }

  // Fetch all tenant-related data
  const tables = [
    'documents',
    'transactions',
    'line_items',
    'bank_accounts',
    'memberships',
    'tenant_settings',
    'tenant_statistics',
    // Add more tables as needed
  ];

  const backup: Record<string, any[]> = {};
  for (const table of tables) {
    // Try to fetch rows scoped to this tenant. Some tables (like `tenants`) don't
    // have a `tenant_id` column, so handle that gracefully by falling back.
    let data: any[] | null = null;
    try {
      const res = await supabase.from(table).select('*').eq('tenant_id', tenantId);
      if (res.error) throw res.error;
      data = res.data || [];
    } catch (err: any) {
      const msg = err?.message || String(err || '');
      // If the table doesn't have tenant_id, skip it (we fetch the tenant row separately)
      if (/tenant_id/i.test(msg) || /column \"tenant_id\" does not exist/i.test(msg)) {
        data = [];
      } else {
        return NextResponse.json({ error: `Failed to fetch ${table}: ${msg}` }, { status: 500 });
      }
    }
    backup[table] = data;
  }

  // Also fetch the tenant row itself
  const { data: tenantData, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();
  if (tenantError) {
    return NextResponse.json({ error: `Failed to fetch tenant: ${tenantError.message}` }, { status: 500 });
  }
  backup['tenant'] = tenantData;

  return NextResponse.json({ data: backup });
}
