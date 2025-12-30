"use client";

import { useEffect, useState } from "react";
import { useTenant, useUserRole } from "@/hooks/use-tenant";
import { useSubscription } from '@/hooks/use-subscription'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import TenantDetails from '@/components/admin/tenant-details'
import { TenantDetailsView } from '@/components/admin/tenant-management'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from "@/components/ui/button";
import { Loader2, Download, Upload, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useLiterals } from '@/hooks/use-literals'

export default function TenantAdminDashboard() {
  const { tenants, refreshTenants } = useTenant();
  const userRole = useUserRole();
  const lt = useLiterals();
  const { subscription } = useSubscription();

  const isFreePlan = (subscription?.plan_name || '').toString().toLowerCase().includes('free') || false

  const [loading, setLoading] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [dashboardTenant, setDashboardTenant] = useState<any | null>(null);
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [tenantStats, setTenantStats] = useState<Record<string, any>>({});
  const [documentsByTenant, setDocumentsByTenant] = useState<Record<string, any[]>>({});
  const [docLoading, setDocLoading] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState("");

  const fetchDocuments = async (tenantId: string) => {
    setDocLoading(tenantId);
    try {
      const res = await fetch("/api/tenant-admin/list-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || lt("Failed to fetch documents"));
      setDocumentsByTenant(prev => ({ ...prev, [tenantId]: json.documents || [] }));
    } catch (e: any) {
      toast.error(lt(e.message) || lt("Failed to fetch documents"));
      setDocumentsByTenant(prev => ({ ...prev, [tenantId]: [] }));
    } finally {
      setDocLoading(null);
    }
  };

  const handleBackup = async (tenantId: string) => {
    try {
      const res = await fetch('/api/tenant-admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      if (!res.ok) throw new Error(lt('Failed to backup tenant'));
      const json = await res.json();
      const dataStr = JSON.stringify(json.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tenant-backup-${tenantId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(lt('Backup downloaded!'));
    } catch (e: any) {
      toast.error(e.message || lt('Backup failed'));
    }
  };

  const handleRestore = async (tenantId: string) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          toast.error('Invalid JSON file');
          return;
        }
        setRestoreLoading(true);
        try {
          const res = await fetch('/api/tenant-admin/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, data: json }),
          });
          const resJson = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(resJson?.error || lt('Restore failed'));
          toast.success(lt('Restore completed!'));
          refreshTenants();
        } finally {
          setRestoreLoading(false);
        }
      };
      input.click();
    } catch (e: any) {
      toast.error(e.message || lt('Restore failed'));
    }
  };

  const handleDeleteDocument = async (tenantId: string, documentId: string) => {
    if (!window.confirm(lt("Are you sure you want to delete this document? This cannot be undone."))) return;
    try {
      const res = await fetch("/api/tenant-admin/delete-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || lt("Delete failed"));
      toast.success(lt("Document deleted successfully"));
      await fetchDocuments(tenantId);
    } catch (e: any) {
      toast.error(e.message || lt("Delete failed"));
    }
  };

  const handleDeleteTenant = async (tenantId: string) => {
    if (!window.confirm(lt("Are you sure you want to delete this tenant? This cannot be undone."))) return;
    try {
      const res = await fetch("/api/tenant-admin/delete-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Delete failed");
      toast.success(lt("Tenant deleted successfully"));
      refreshTenants();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  const filteredTenants = tenants?.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    let mounted = true
    const loadStats = async () => {
      try {
        const ids = (tenants || []).map(t => t.id).filter(Boolean)
        if (ids.length === 0) return
        const res = await fetch('/api/tenant-admin/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantIds: ids }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Failed to load tenant stats')
        if (mounted) setTenantStats(json.stats || {})
      } catch (e: any) {
        console.error('Failed to load tenant stats', e)
      }
    }
    loadStats()
    return () => { mounted = false }
  }, [tenants])

  if (!filteredTenants || filteredTenants.length === 0) {
    return (
      <Card className="mt-8">
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="ml-4">{lt("Loading tenants...")}</span>
        </CardContent>
      </Card>
    );
  }

  // open details by selecting tenant id; `TenantDetails` component will fetch details
  const openTenantDetails = (tenantId: string) => setSelectedTenantId(tenantId)

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>{lt("Central Tenant Management")}</CardTitle>
        <CardDescription>
          {lt('Manage all your tenants, documents, and perform backup/restore operations.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <Input placeholder={lt("Search tenants...")} value={search} onChange={e => setSearch(e.target.value)} className="w-full md:max-w-sm" />
            {(userRole === 'COMPANY_ADMIN' || userRole === 'SUPER_ADMIN') && !isFreePlan && (
              <Button variant="outline" size="sm" onClick={() => {
                // user-level import: open file picker and call restore without tenantId
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'application/json';
                input.onchange = async (e: any) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const text = await file.text();
                  let json;
                  try { json = JSON.parse(text); } catch { toast.error('Invalid JSON file'); return; }
                  setRestoreLoading(true);
                  try {
                    const res = await fetch('/api/tenant-admin/restore', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: json })
                    });
                    const resJson = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(resJson?.error || lt('Restore failed'));
                    toast.success(lt('Import completed!'));
                    refreshTenants();
                  } catch (err: any) {
                    toast.error(err?.message || lt('Restore failed'));
                  } finally { setRestoreLoading(false); }
                };
                input.click();
              }}>
                {lt('Import Tenant')}
              </Button>
            )}
            {isFreePlan && (userRole === 'COMPANY_ADMIN' || userRole === 'SUPER_ADMIN') && (
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-500">{lt('Backup & Restore are available on paid plans.')}</div>
                <Button variant="ghost" size="sm" onClick={() => {
                  // Navigate to billing tab in dashboard settings
                  window.location.href = '/dashboard/settings?tab=billing'
                }}>
                  {lt('Upgrade')}
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-6">
          {filteredTenants.map((tenant) => (
            <div key={tenant.id} className="border rounded-lg p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="font-semibold text-lg">{tenant.name}</div>
                  <div className="text-sm text-gray-500">{lt("Slug")}: {tenant.slug}</div>
                  <div className="text-xs text-gray-400">{lt("Created")}: {lt(tenant.created_at)}</div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-700">
                    <span className="flex items-center gap-1">
                      {lt('Docs')}: {tenantStats[tenant.id]?.documents ?? '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      {lt('Txns')}: {tenantStats[tenant.id]?.transactions ?? '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      {lt('Users')}: {tenantStats[tenant.id]?.users ?? '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      {lt('Bank Accts')}: {tenantStats[tenant.id]?.bank_accounts ?? '—'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => {
                    if (expandedTenantId === tenant.id) {
                      setExpandedTenantId(null);
                    } else {
                      setExpandedTenantId(tenant.id);
                      if (!documentsByTenant[tenant.id]) fetchDocuments(tenant.id);
                    }
                  }}>
                    {expandedTenantId === tenant.id ? lt("Hide Documents") : lt("Show Documents")}
                  </Button>
                  { (userRole === 'COMPANY_ADMIN' || userRole === 'SUPER_ADMIN') && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setSelectedTenantId(tenant.id)}>
                        {lt('Edit')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={async () => {
                      // fetch tenant basic info + stats and open dashboard view
                      try {
                        const res = await fetch(`/api/tenants?tenant_id=${encodeURIComponent(tenant.id)}`)
                        const json = await res.json()
                        if (!res.ok) throw new Error(json?.error || lt('Failed to load tenant'))
                        const tenantRec = json.tenant || json

                        // fetch stats
                        const statsRes = await fetch('/api/tenant-admin/stats', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantIds: [tenant.id] })
                        })
                        const statsJson = await statsRes.json()
                        const stats = (statsJson && statsJson.stats && statsJson.stats[tenant.id]) || {}

                        const details = {
                          tenant_id: tenant.id,
                          tenant_name: tenant.name,
                          tenant_slug: tenant.slug,
                          locale: tenantRec.locale || tenant.locale || 'en',
                          created_at: tenant.created_at || tenantRec.created_at,
                          user_count: stats.users ?? 0,
                          document_count: stats.documents ?? 0,
                          transaction_count: stats.transactions ?? 0,
                          total_revenue: 0,
                          total_expenses: 0,
                          net_income: 0,
                          last_activity: stats.last_activity || null,
                        }
                        setDashboardTenant(details)
                      } catch (e: any) {
                        toast.error(e?.message || lt('Failed to load tenant'))
                      }
                    }}>
                      {lt('View Details')}
                    </Button>
                    </>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleBackup(tenant.id)} disabled={backupLoading || isFreePlan} title={isFreePlan ? lt('Upgrade to a paid plan to access backups') : undefined}>
                    {backupLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />} {lt("Backup")}
                  </Button>
                  {userRole === 'SUPER_ADMIN' && (
                    <Button variant="outline" size="sm" onClick={() => handleRestore(tenant.id)} disabled={restoreLoading}>
                      {restoreLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />} {lt("Restore")}
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteTenant(tenant.id)} disabled={deleteLoading}>
                    {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />} {lt("Delete Tenant")}
                  </Button>
                </div>
              </div>
              {expandedTenantId === tenant.id && (
                <div className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>{lt("Documents for Tenant")}</CardTitle>
                      <CardDescription>{lt("All documents for this tenant.")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {docLoading === tenant.id ? (
                        <div className="flex items-center justify-center p-8">
                          <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                      ) : (
                        <>
                          {(!documentsByTenant[tenant.id] || documentsByTenant[tenant.id].length === 0) ? (
                            <div className="text-gray-500">{lt("No documents found for this tenant.")}</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm border">
                                <thead>
                                  <tr className="bg-gray-100">
                                    <th className="p-2 text-left">{lt("File Name")}</th>
                                    <th className="p-2 text-left">{lt("Type")}</th>
                                    <th className="p-2 text-left">{lt("Status")}</th>
                                    <th className="p-2 text-left">{lt("Uploaded")}</th>
                                    <th className="p-2 text-left">{lt("Actions")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {documentsByTenant[tenant.id].map((doc) => (
                                    <tr key={doc.id} className="border-b">
                                      <td className="p-2">{doc.file_name}</td>
                                      <td className="p-2">{lt(doc.file_type)}</td>
                                      <td className="p-2">{lt(doc.status)}</td>
                                      <td className="p-2">{lt(doc.created_at)}</td>
                                      <td className="p-2">
                                        <Button variant="destructive" size="sm" onClick={() => handleDeleteDocument(tenant.id, doc.id)}>
                                          <Trash2 className="w-4 h-4 mr-1" /> {lt("Delete")}
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          ))}
        </div>

        {selectedTenantId && (
          <TenantDetails
            tenantId={selectedTenantId}
            onClose={() => setSelectedTenantId(null)}
            onSaved={() => { setSelectedTenantId(null); refreshTenants(); }}
          />
        )}

        {dashboardTenant && (
          <div className="mt-4">
            <TenantDetailsView tenant={dashboardTenant} onClose={() => setDashboardTenant(null)} />
          </div>
        )}

      </CardContent>
    </Card>
  );

}
