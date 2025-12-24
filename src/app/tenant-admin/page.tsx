"use client";

import { useEffect, useState } from "react";
import { useTenant, useUserRole } from "@/hooks/use-tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Upload, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useLiterals } from '@/hooks/use-literals'

export default function TenantAdminDashboard() {
  const { tenants, refreshTenants } = useTenant();
  const userRole = useUserRole();
  const lt = useLiterals();

  const [loading, setLoading] = useState(false);
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [documentsByTenant, setDocumentsByTenant] = useState<Record<string, any[]>>({});
  const [docLoading, setDocLoading] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Fetch documents for a tenant
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

  // Backup a tenant (JSON download)
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

  // Restore a tenant (JSON upload)
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
        const res = await fetch('/api/tenant-admin/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, data: json }),
        });
        if (!res.ok) throw new Error(lt('Restore failed'));
        toast.success(lt('Restore completed!'));
        refreshTenants();
      };
      input.click();
    } catch (e: any) {
      toast.error(e.message || lt('Restore failed'));
    }
  };

  // Delete a document
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
      // Refresh document list
      await fetchDocuments(tenantId);
    } catch (e: any) {
      toast.error(e.message || lt("Delete failed"));
    }
  };

  // Delete a tenant
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
          <Input placeholder={lt("Search tenants...")} value={search} onChange={e => setSearch(e.target.value)} className="w-full md:max-w-sm" />
        </div>
        <div className="space-y-6">
          {filteredTenants.map((tenant) => (
            <div key={tenant.id} className="border rounded-lg p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="font-semibold text-lg">{tenant.name}</div>
                  <div className="text-sm text-gray-500">{lt("Slug")}: {tenant.slug}</div>
                  <div className="text-xs text-gray-400">{lt("Created")}: {lt(tenant.created_at)}</div>
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
                  <Button variant="outline" size="sm" onClick={() => handleBackup(tenant.id)} disabled={backupLoading}>
                    {backupLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />} {lt("Backup")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleRestore(tenant.id)} disabled={restoreLoading}>
                    {restoreLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />} {lt("Restore")}
                  </Button>
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
      </CardContent>
    </Card>
  );

}
