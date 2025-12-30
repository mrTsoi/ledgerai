'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2,  Download, Upload, Plus, Edit, Trash2, Building2, Users, FileText, DollarSign } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'

type Tenant = Database['public']['Tables']['tenants']['Row'] & {
  is_active?: boolean
  subscription_plan?: string
  subscription_status?: string
  document_count?: number
  transaction_count?: number
  line_item_count?: number
  bank_account_count?: number
}

type DuplicateTenantGroup = {
  owner_id: string | null
  normalized_name: string
  canonical_tenant_id: string
  canonical_tenant_name: string
  tenant_ids: string[]
  tenant_names: string[]
  tenant_slugs: string[]
}

type MergeDuplicateTenantsResult = {
  canonical_tenant_id: string
  canonical_tenant_name: string
  normalized_name: string
  dry_run: boolean
  delete_empty_duplicates: boolean
  duplicates_processed: number
  documents_moved: number
  tenants_deleted: number
  tenants_deactivated: number
}

interface TenantDetails {
  tenant_id: string
  tenant_name: string
  tenant_slug: string
  locale: string
  created_at: string
  user_count: number
  document_count: number
  transaction_count: number
  total_revenue: number
  total_expenses: number
  net_income: number
  last_activity: string
  subscription_plan?: string
  subscription_status?: string
}

export function TenantManagement() {
  console.log('TenantManagement mounted')
  const lt = useLiterals()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState<TenantDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateTenantGroup[]>([])
  const [duplicatesLoading, setDuplicatesLoading] = useState(false)
  const [mergeRunningForCanonicalId, setMergeRunningForCanonicalId] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  //const {tenants, refreshTenants } = useTenant();
  //const userRole = useUserRole();

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
      if (!res.ok) throw new Error(json?.error || "Failed to fetch documents");
      setDocumentsByTenant(prev => ({ ...prev, [tenantId]: json.documents || [] }));
    } catch (e: any) {
      toast.error(e.message || "Failed to fetch documents");
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
      if (!res.ok) throw new Error('Failed to backup tenant');
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
      toast.success('Backup downloaded!');
    } catch (e: any) {
      toast.error(e.message || 'Backup failed');
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
        if (!res.ok) throw new Error('Restore failed');
        toast.success('Restore completed!');
        fetchTenants();
      };
      input.click();
    } catch (e: any) {
      toast.error(e.message || 'Restore failed');
    }
  };

  // Delete a document
  const handleDeleteDocument = async (tenantId: string, documentId: string) => {
    if (!window.confirm("Are you sure you want to delete this document? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/tenant-admin/delete-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Delete failed");
      toast.success("Document deleted successfully");
      // Refresh document list
      await fetchDocuments(tenantId);
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  // Delete a tenant
  const handleDeleteTenant = async (tenantId: string) => {
    if (!window.confirm("Are you sure you want to delete this tenant? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/tenant-admin/delete-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Delete failed");
      toast.success("Tenant deleted successfully");
      fetchTenants();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  /*const filteredTenants = tenants?.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()));

  if (!filteredTenants || filteredTenants.length === 0) {
    return (
      <Card className="mt-8">
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="ml-4">Loading tenants...</span>
        </CardContent>
      </Card>
    );
  }
*/
  const deleteTenant = async (tenantId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this tenant? This action cannot be undone.')) return;
    try {
      const { error } = await supabase
        .from('tenants')
        .delete()
        .eq('id', tenantId);
      if (error) throw error;
      fetchTenants();
      toast.success('Tenant deleted successfully!');
    } catch (error: any) {
      console.error('Error deleting tenant:', error);
      toast.error('Failed to delete tenant: ' + error.message);
    }
  };

  const fetchTenants = useCallback(async () => {
    try {
      // Fetch tenant statistics via RPC
      const { data, error } = await supabase.rpc('admin_list_tenant_statistics', {})
      console.log('Tenant statistics RPC result:', data)
      if (error) throw error
      setTenants((data || []).map((t: any) => ({
        ...t,
        id: t.tenant_id, // Add this line
        name: t.tenant_name,
        slug: t.tenant_slug,
      })));
    } catch (error) {
      console.error('Error fetching tenants:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    console.log('Calling fetchTenants')
    fetchTenants()
  }, [fetchTenants])

  const fetchTenantDetails = async (tenantId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_tenant_details', {
        p_tenant_id: tenantId
      } as any)

      if (error) throw error
      if (data && (data as any).length > 0) {
        setSelectedTenant((data as any)[0])
      }
    } catch (error) {
      console.error('Error fetching tenant details:', error)
    }
  }

  const createTenant = async (formData: { name: string; slug: string; locale: string; plan: string }) => {
    try {
      const { error } = await (supabase
        .from('tenants') as any)
        .insert({
          name: formData.name,
          slug: formData.slug,
          locale: formData.locale,
          is_active: true,
          subscription_plan: formData.plan,
          subscription_status: 'active'
        })

      if (error) throw error
      
      setShowCreateForm(false)
      fetchTenants()
      toast.success('Tenant created successfully!')
    } catch (error: any) {
      console.error('Error creating tenant:', error)
      toast.error('Failed to create tenant: ' + error.message)
    }
  }

  const toggleTenantStatus = async (tenantId: string, currentStatus: boolean) => {
    try {
      const { error } = await (supabase
        .from('tenants') as any)
        .update({ is_active: !currentStatus })
        .eq('id', tenantId)

      if (error) throw error
      fetchTenants()
      toast.success(`Tenant ${!currentStatus ? 'activated' : 'deactivated'} successfully`)
    } catch (error: any) {
      console.error('Error updating tenant:', error)
      toast.error('Failed to update tenant: ' + error.message)
    }
  }

  const scanDuplicateTenantsImpl = useCallback(
    async (silent: boolean) => {
      setDuplicatesLoading(true)
      try {
        const { data, error } = await supabase.rpc('admin_list_duplicate_tenants' as any, {} as any)
        if (error) throw error
        setDuplicateGroups((data as any) || [])
        if (!silent) {
          toast.success(`Found ${((data as any) || []).length} duplicate group(s)`)
        }
      } catch (error: any) {
        console.error('Error scanning duplicate tenants:', error)
        toast.error('Failed to scan duplicate tenants: ' + (error?.message || 'Unknown error'))
      } finally {
        setDuplicatesLoading(false)
      }
    },
    [supabase]
  )

  const scanDuplicateTenants = useCallback(async () => {
    await scanDuplicateTenantsImpl(false)
  }, [scanDuplicateTenantsImpl])

  const mergeDuplicateTenantGroup = useCallback(
    async (canonicalTenantId: string) => {
      const confirmed = window.confirm(
        'Merge duplicate tenants into the canonical tenant?\n\nThis will move documents and merge memberships/settings/identifiers.\nDuplicate tenants will be deleted only if empty after merge; otherwise they will be deactivated.'
      )
      if (!confirmed) return

      setMergeRunningForCanonicalId(canonicalTenantId)
      try {
        const { data, error } = await supabase.rpc('admin_merge_duplicate_tenants' as any, {
          p_canonical_tenant_id: canonicalTenantId,
          p_delete_empty_duplicates: true,
          p_dry_run: false
        } as any)

        if (error) throw error

        const result = (data as any) as MergeDuplicateTenantsResult
        toast.success(
          `Merged ${result.duplicates_processed} duplicate(s): moved ${result.documents_moved} docs, deleted ${result.tenants_deleted}, deactivated ${result.tenants_deactivated}`
        )

        // Optimistically remove the merged group immediately (avoids a stale list
        // if the subsequent refresh is slow or fails).
        setDuplicateGroups((prev) => prev.filter((g) => g.canonical_tenant_id !== canonicalTenantId))

        // Refresh both lists so the admin sees the post-merge state.
        await Promise.all([fetchTenants(), scanDuplicateTenantsImpl(true)])
      } catch (error: any) {
        console.error('Error merging duplicate tenants:', error)
        toast.error('Failed to merge duplicate tenants: ' + (error?.message || 'Unknown error'))
      } finally {
        setMergeRunningForCanonicalId(null)
      }
    },
    [fetchTenants, scanDuplicateTenantsImpl, supabase]
  )

  const filteredTenants = tenants?.filter(
            t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            t.slug.toLowerCase().includes(searchTerm.toLowerCase()));


  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  if (showCreateForm) {
    return <CreateTenantForm onSubmit={createTenant} onCancel={() => setShowCreateForm(false)} />
  }

  if (selectedTenant) {
    return (
      <TenantDetailsView
        tenant={selectedTenant}
        onClose={() => setSelectedTenant(null)}
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tenant Management</CardTitle>
            <CardDescription>
              Manage all platform tenants and their settings
            </CardDescription>
          </div>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Tenant
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Duplicate Tenant Cleanup */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Duplicate Tenants Cleanup</p>
              <p className="text-sm text-muted-foreground">
                Scans for tenants with the same owner and normalized name.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={scanDuplicateTenants}
              disabled={duplicatesLoading}
            >
              {duplicatesLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                'Scan Duplicates'
              )}
            </Button>
          </div>

          {duplicateGroups.length > 0 && (
            <div className="space-y-2">
              {duplicateGroups.map((group) => (
                <div
                  key={group.canonical_tenant_id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 border rounded-lg"
                >
                  <div className="min-w-0">
                    <p className="font-semibold truncate">
                      {group.canonical_tenant_name}{' '}
                      <span className="text-sm text-muted-foreground font-normal">
                        {lt('({count} tenants)', { count: group.tenant_ids.length })}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {lt('Canonical: {canonical} • Normalized: {normalized}', {
                        canonical: group.canonical_tenant_id,
                        normalized: group.normalized_name,
                      })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => mergeDuplicateTenantGroup(group.canonical_tenant_id)}
                    disabled={mergeRunningForCanonicalId !== null}
                  >
                    {mergeRunningForCanonicalId === group.canonical_tenant_id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {lt('Merging...')}
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        {lt('Merge Group')}
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="mb-6">
          <Input
            placeholder={lt('Search tenants...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:max-w-sm"
          />
        </div>

        {/* Tenants List with Usage Statistics */}
        <div className="space-y-3">
          {filteredTenants.map((tenant) => (
            <div key={tenant.id}>
              <div className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4 flex-1">
                  <div className="p-3 bg-blue-100 rounded-lg flex-shrink-0">
                    <Building2 className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold truncate">{tenant.name}</p>
                      <span className={`px-2 py-1 text-xs rounded-full ${tenant.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {tenant.is_active ? lt('Active') : lt('Inactive')}
                      </span>
                      {tenant.subscription_plan && (
                        <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 capitalize">
                          {tenant.subscription_plan}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      {lt('{slug} • Created {date}', {
                        slug: tenant.slug,
                        date: format(new Date(tenant.created_at), 'MMM dd, yyyy'),
                      })}
                    </p>
                    {/* Usage Statistics */}
                    <div className="flex flex-wrap gap-4 mt-2">
                      <span className="flex items-center gap-1 text-xs text-gray-700">
                        <FileText className="w-3 h-3" />
                        {lt('Docs')}: {tenant.document_count ?? '—'}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-700">
                        <Building2 className="w-3 h-3" />
                        {lt('Txns')}: {tenant.transaction_count ?? '—'}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-700">
                        <Users className="w-3 h-3" />
                        {lt('Line Items')}: {tenant.line_item_count ?? '—'}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-700">
                        <DollarSign className="w-3 h-3" />
                        {lt('Bank Accts')}: {tenant.bank_account_count ?? '—'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 md:mt-0 md:ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchTenantDetails(tenant.id)}
                    className="flex-1 md:flex-none"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    {lt('Details')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleTenantStatus(tenant.id, tenant.is_active || false)}
                    className="flex-1 md:flex-none"
                  >
                    {tenant.is_active ? lt('Deactivate') : lt('Activate')}
                  </Button>

                  <Button variant="outline" size="sm" onClick={() => {
                      if (expandedTenantId === tenant.id) {
                        setExpandedTenantId(null);
                      } else {
                        setExpandedTenantId(tenant.id);
                        if (!documentsByTenant[tenant.id]) fetchDocuments(tenant.id);
                      }
                    }}>
                      {expandedTenantId === tenant.id ? "Hide Documents" : "Show Documents"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleBackup(tenant.id)} disabled={backupLoading}>
                      {backupLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />} Backup
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleRestore(tenant.id)} disabled={restoreLoading}>
                      {restoreLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />} Restore
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteTenant(tenant.id)} disabled={deleteLoading}>
                      {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />} Delete Tenant
                    </Button>
                </div>
              </div>
              {/* Expanded document list below tenant card */}
              {expandedTenantId === tenant.id && (
                <div className="w-full pb-4">
                  <Card className="border-t-0 rounded-t-none">
                    <CardHeader>
                      <CardTitle>Documents for Tenant</CardTitle>
                      <CardDescription>All documents for this tenant.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {docLoading === tenant.id ? (
                        <div className="flex items-center justify-center p-8">
                          <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                      ) : (
                        <>
                          {(!documentsByTenant[tenant.id] || documentsByTenant[tenant.id].length === 0) ? (
                            <div className="text-gray-500">No documents found for this tenant.</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm border">
                                <thead>
                                  <tr className="bg-gray-100">
                                    <th className="p-2 text-left">File Name</th>
                                    <th className="p-2 text-left">Type</th>
                                    <th className="p-2 text-left">Status</th>
                                    <th className="p-2 text-left">Uploaded</th>
                                    <th className="p-2 text-left">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {documentsByTenant[tenant.id].map((doc) => (
                                    <tr key={doc.id} className="border-b">
                                      <td className="p-2">{doc.file_name}</td>
                                      <td className="p-2">{doc.file_type}</td>
                                      <td className="p-2">{doc.status}</td>
                                      <td className="p-2">{doc.created_at}</td>
                                      <td className="p-2">
                                        <Button variant="destructive" size="sm" onClick={() => handleDeleteDocument(tenant.id, doc.id)}>
                                          <Trash2 className="w-4 h-4 mr-1" /> Delete
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

        {filteredTenants.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{lt('No tenants found')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CreateTenantForm({ onSubmit, onCancel }: { onSubmit: (data: any) => void; onCancel: () => void }) {
  const lt = useLiterals()
  const [formData, setFormData] = useState({ name: '', slug: '', locale: 'en', plan: 'free' })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{lt('Create New Tenant')}</CardTitle>
        <CardDescription>{lt('Add a new tenant to the platform')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => {
          e.preventDefault()
          onSubmit(formData)
        }} className="space-y-4">
          <div>
            <Label htmlFor="name">{lt('Tenant Name')} *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={lt('e.g., Acme Corporation')}
              required
            />
          </div>
          <div>
            <Label htmlFor="slug">{lt('Slug (URL-friendly)')} *</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              placeholder={lt('e.g., acme-corp')}
              required
            />
            <p className="text-xs text-gray-500 mt-1">{lt('Only lowercase letters, numbers, and hyphens')}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="locale">{lt('Default Locale')}</Label>
              <select
                id="locale"
                value={formData.locale}
                onChange={(e) => setFormData({ ...formData, locale: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="en">{lt('English')}</option>
                <option value="zh-CN">{lt('Chinese (Simplified)')}</option>
                <option value="zh-HK">{lt('Chinese (Traditional)')}</option>
              </select>
            </div>
            <div>
              <Label htmlFor="plan">{lt('Subscription Plan')}</Label>
              <select
                id="plan"
                value={formData.plan}
                onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="free">{lt('Free Tier')}</option>
                <option value="pro">{lt('Professional')}</option>
                <option value="enterprise">{lt('Enterprise')}</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <Button type="submit">{lt('Create Tenant')}</Button>
            <Button type="button" variant="outline" onClick={onCancel}>{lt('Cancel')}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function TenantDetailsView({ tenant, onClose }: { tenant: TenantDetails; onClose: () => void }) {
  const lt = useLiterals()
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{tenant.tenant_name}</CardTitle>
            <CardDescription>{tenant.tenant_slug}</CardDescription>
          </div>
          <Button variant="outline" onClick={onClose}>{lt('Close')}</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          {/* Statistics Cards */}
          <div className="col-span-2 grid grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <Users className="w-4 h-4" />
                <span className="text-sm font-medium">Users</span>
              </div>
              <p className="text-2xl font-bold">{tenant.user_count}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-purple-600 mb-2">
                <FileText className="w-4 h-4" />
                <span className="text-sm font-medium">Documents</span>
              </div>
              <p className="text-2xl font-bold">{tenant.document_count}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-orange-600 mb-2">
                <Building2 className="w-4 h-4" />
                <span className="text-sm font-medium">Transactions</span>
              </div>
              <p className="text-2xl font-bold">{tenant.transaction_count}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-sm font-medium">Net Income</span>
              </div>
              <p className={`text-2xl font-bold ${tenant.net_income >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${Math.abs(tenant.net_income).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-gray-600">Tenant ID</Label>
              <p className="font-mono text-sm">{tenant.tenant_id}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Locale</Label>
              <p>{tenant.locale}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Created</Label>
              <p>{format(new Date(tenant.created_at), 'PPP')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-sm text-gray-600">Total Revenue (YTD)</Label>
              <p className="text-lg font-semibold text-green-600">${tenant.total_revenue.toFixed(2)}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Total Expenses (YTD)</Label>
              <p className="text-lg font-semibold text-red-600">${tenant.total_expenses.toFixed(2)}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Last Activity</Label>
              <p>{tenant.last_activity ? format(new Date(tenant.last_activity), 'PPp') : 'No activity'}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
