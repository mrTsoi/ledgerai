
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let tenantId = body?.tenantId;
    const data = body?.data;

    // If tenantId not provided, this is a user-level import -> generate a new tenant id
    const explicitTenantId = typeof tenantId === 'string' && tenantId.length > 0;
    if (!explicitTenantId) {
      tenantId = crypto?.randomUUID ? crypto.randomUUID() : (require('crypto').randomUUID());
    }

    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Missing restore data' }, { status: 400 });
    }
  if (!tenantId || typeof tenantId !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid tenantId' }, { status: 400 });
  }
  if (!data || typeof data !== 'object') {
    return NextResponse.json({ error: 'Missing restore data' }, { status: 400 });
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

  // Enforce subscription: non-super-admins must be on a paid plan to use restore/import
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
      return NextResponse.json({ error: 'Restore/Import requires a paid subscription. Please upgrade to access this feature.' }, { status: 403 });
    }
  }

    if (!isSuperAdmin) {
      // If this is an explicit tenant restore (user supplied tenantId) require membership and admin role
      if (explicitTenantId) {
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
          return NextResponse.json({ error: 'Forbidden: insufficient role for restore.' }, { status: 403 });
        }
      }
      // For user-level imports (no explicit tenantId), we allow creation and will set owner_id to requester below
    }

  // Insert tenant row if not exists. Force tenant id to the requested tenantId.
    if (data.tenant) {
      const baseTenant = { ...data.tenant, id: tenantId };
      // If the requester is not a SUPER_ADMIN, set the tenant owner to the requesting user
      // to ensure subscription checks apply to the requester and prevent failures
      // when the original owner has no quota. SUPER_ADMIN can preserve original owner.
      const tenantRow = isSuperAdmin ? baseTenant : { ...baseTenant, owner_id: user.id };
      const { error } = await supabase.from('tenants').upsert([tenantRow], { onConflict: 'id' });
      if (error) {
        return NextResponse.json({ error: `Failed to restore tenant: ${error.message}` }, { status: 500 });
      }

      // If we reassigned owner_id during import (non-super-admin), create an audit log entry.
      try {
        const originalOwner = data.tenant?.owner_id || null;
        const newOwner = tenantRow.owner_id || null;
        if (!isSuperAdmin && newOwner && originalOwner !== newOwner) {
          await (supabase as any).rpc('create_audit_log', {
            p_tenant_id: tenantId,
            p_action: 'OWNER_REASSIGN',
            p_resource_type: 'tenant',
            p_resource_id: tenantId,
            p_old_data: originalOwner ? { owner_id: originalOwner } : null,
            p_new_data: { owner_id: newOwner },
          });
        }
      } catch (auditErr: any) {
        console.error('Failed to create audit log for owner reassignment:', auditErr);
      }
    }

  // Restore all tables
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

  for (const table of tables) {
    const rows = Array.isArray(data[table]) ? data[table] : [];
    if (rows.length === 0) continue;

    // Ensure each row is scoped to the requested tenantId to prevent privilege escalation.
    const normalized = rows.map((r: any) => ({ ...r, tenant_id: tenantId }));

    const { error } = await supabase.from(table).upsert(normalized);
    if (error) {
      return NextResponse.json({ error: `Failed to restore ${table}: ${error.message}` }, { status: 500 });
    }
  }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('tenant-admin/restore error:', err);
    const msg = err?.message || String(err || 'Unknown error');
    return NextResponse.json({ error: `Restore failed: ${msg}` }, { status: 500 });
  }
}
