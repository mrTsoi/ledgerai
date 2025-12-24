import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const { tenantId, data } = await req.json();
  const supabase = await createClient();

  // Insert tenant row if not exists
  if (data.tenant) {
    const { error } = await supabase
      .from('tenants')
      .upsert([data.tenant], { onConflict: 'id' });
    if (error) {
      return NextResponse.json({ error: `Failed to restore tenant: ${error.message}` }, { status: 500 });
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
    if (Array.isArray(data[table])) {
      for (const row of data[table]) {
        const { error } = await supabase
          .from(table)
          .upsert([row]);
        if (error) {
          return NextResponse.json({ error: `Failed to restore ${table}: ${error.message}` }, { status: 500 });
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
