import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const { tenantId } = await req.json();
  const supabase = await createClient();

  // Fetch all tenant-related data
  const tables = [
    'tenants',
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
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) {
      return NextResponse.json({ error: `Failed to fetch ${table}: ${error.message}` }, { status: 500 });
    }
    backup[table] = data || [];
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
