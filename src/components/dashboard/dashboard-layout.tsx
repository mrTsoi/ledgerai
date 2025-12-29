'use client'

import { useTenant, useUserRole } from '@/hooks/use-tenant'
import { useSubscription } from '@/hooks/use-subscription'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname, Link } from '@/i18n/navigation'
import { DashboardPersonalizationProvider } from '@/hooks/use-dashboard-personalization'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { AiAgentWidget } from '@/components/ai-agent/ai-agent-widget'
import { useTranslations } from 'next-intl'
import { useLiterals } from '@/hooks/use-literals'
import {
  Home,
  FileText,
  CreditCard,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Building2,
  Menu,
  X,
  FolderTree,
  Landmark,
  Check,
  ChevronsUpDown,
  Loader2
} from 'lucide-react'

import { useEffect, useMemo, useState } from 'react'
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { CreateTenantModal } from '@/components/tenant/create-tenant-modal'
import usePlatform from '@/hooks/use-platform'

interface NavItem {
  name: string
  href: string
  icon: React.ReactNode
  roles: string[]
  group?: 'company' | 'admin' | 'user'
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tCommon = useTranslations('common')
  const lt = useLiterals()
  const { currentTenant, tenants, switchTenant, loading } = useTenant()
  const { subscription } = useSubscription()
  const userRole = useUserRole()
  const router = useRouter()
  const pathname = usePathname() // Use usePathname hook
  const supabase = useMemo(() => createClient(), [])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [dashboardMenuOpen, setDashboardMenuOpen] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null)

  const [dashboardTemplatesLoading, setDashboardTemplatesLoading] = useState(false)
  const [dashboardActionLoading, setDashboardActionLoading] = useState<null | 'save' | 'reset' | 'publish'>(null)
  const [dashboardTemplates, setDashboardTemplates] = useState<Array<{ key: string; name: string; role?: string }>>([])
  const [dashboardDefaultTemplateKey, setDashboardDefaultTemplateKey] = useState<string | null>(null)
  const [dashboardSelectedTemplateKey, setDashboardSelectedTemplateKey] = useState<string | null>(null)
  const [dashboardLayout, setDashboardLayout] = useState<any>(null)
  const [isCustomizing, setIsCustomizing] = useState(false)
  const { platform } = usePlatform()

  const canPublishTenantDashboard = userRole === 'COMPANY_ADMIN' || userRole === 'SUPER_ADMIN'

  const getRoleLabel = (role: string | null | undefined) => {
    switch (role) {
      case 'COMPANY_ADMIN':
        return lt('Company Admin')
      case 'ACCOUNTANT':
        return lt('Accountant')
      case 'OPERATOR':
        return lt('Operator')
      case 'SUPER_ADMIN':
        return lt('Super Admin')
      default:
        return role || ''
    }
  }

  useEffect(() => {
    // Clear the optimistic loader once navigation completes.
    if (isNavigating) setIsNavigating(false)
    if (navigatingTo) setNavigatingTo(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    const tenantId = currentTenant?.id
    if (!tenantId) {
      setDashboardTemplates([])
      setDashboardDefaultTemplateKey(null)
      setDashboardSelectedTemplateKey(null)
      setDashboardLayout(null)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        setDashboardTemplatesLoading(true)

        const [templatesRes, prefRes] = await Promise.all([
          fetch(`/api/dashboard/templates?tenant_id=${encodeURIComponent(tenantId)}`),
          fetch(`/api/dashboard/preferences?tenant_id=${encodeURIComponent(tenantId)}`),
        ])

        const templatesJson = await templatesRes.json().catch(() => ({}))
        const prefJson = await prefRes.json().catch(() => ({}))

        if (!templatesRes.ok) throw new Error(templatesJson?.error || 'Failed to load dashboard templates')
        if (!prefRes.ok) throw new Error(prefJson?.error || 'Failed to load dashboard preferences')

        const templates = Array.isArray(templatesJson?.templates) ? templatesJson.templates : []
        const defaultTemplateKey = (templatesJson?.default_template_key as string | undefined) || null
        const selectedTemplateKey = (prefJson?.selected_template_key as string | null | undefined) || defaultTemplateKey

        if (cancelled) return

        setDashboardTemplates(
          templates
            .filter((t: any) => typeof t?.key === 'string' && typeof t?.name === 'string')
            .map((t: any) => ({
              key: t.key,
              name: t.name,
              role: typeof t?.role === 'string' ? t.role : undefined,
            }))
        )
        setDashboardDefaultTemplateKey(defaultTemplateKey)
        setDashboardSelectedTemplateKey(selectedTemplateKey)
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setDashboardTemplates([])
          setDashboardDefaultTemplateKey(null)
          setDashboardSelectedTemplateKey(null)
        }
      } finally {
        if (!cancelled) setDashboardTemplatesLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenant?.id])

  useEffect(() => {
    const tenantId = currentTenant?.id
    const templateKey = dashboardSelectedTemplateKey
    if (!tenantId || !templateKey) {
      setDashboardLayout(null)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const url = `/api/dashboard/layout?tenant_id=${encodeURIComponent(tenantId)}&template_key=${encodeURIComponent(templateKey)}`
        const res = await fetch(url)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'Failed to load dashboard layout')
        if (!cancelled) setDashboardLayout(json?.layout ?? null)
      } catch (e) {
        console.error(e)
        if (!cancelled) setDashboardLayout(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentTenant?.id, dashboardSelectedTemplateKey])

  const handleDashboardTemplateChange = async (templateKey: string) => {
    const tenantId = currentTenant?.id
    if (!tenantId) return

    setDashboardSelectedTemplateKey(templateKey)

    try {
      const res = await fetch('/api/dashboard/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, selected_template_key: templateKey }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to update dashboard template')
      router.refresh()
    } catch (e) {
      console.error(e)
      // Best effort revert to default.
      setDashboardSelectedTemplateKey(dashboardDefaultTemplateKey)
    }
  }

  const handleSaveDashboardLayout = async () => {
    const tenantId = currentTenant?.id
    const templateKey = dashboardSelectedTemplateKey
    if (!tenantId || !templateKey || !dashboardLayout) return

    try {
      setDashboardActionLoading('save')
      const res = await fetch('/api/dashboard/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, template_key: templateKey, layout_json: dashboardLayout }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to save dashboard layout')
      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setDashboardActionLoading(null)
    }
  }

  const handleResetDashboardLayout = async () => {
    const tenantId = currentTenant?.id
    const templateKey = dashboardSelectedTemplateKey
    if (!tenantId || !templateKey) return

    try {
      setDashboardActionLoading('reset')
      const url = `/api/dashboard/layout?tenant_id=${encodeURIComponent(tenantId)}&template_key=${encodeURIComponent(templateKey)}`
      const res = await fetch(url, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to reset dashboard layout')
      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setDashboardActionLoading(null)
    }
  }

  const handlePublishTenantDashboardLayout = async () => {
    const tenantId = currentTenant?.id
    const templateKey = dashboardSelectedTemplateKey
    if (!tenantId || !templateKey || !dashboardLayout) return

    try {
      setDashboardActionLoading('publish')
      const res = await fetch('/api/dashboard/layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, template_key: templateKey, layout_json: dashboardLayout }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to publish tenant dashboard layout')
      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setDashboardActionLoading(null)
    }
  }

  const handleNavClick = (href: string) => {
    setSidebarOpen(false)

    // Only show loader when a real navigation is about to happen.
    if (href !== pathname) {
      setNavigatingTo(href)
      setIsNavigating(true)
    }
  }

  const navigationItems: NavItem[] = [
    {
      name: lt('Dashboard'),
      href: '/dashboard',
      icon: <Home className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'OPERATOR', 'SUPER_ADMIN'],
      group: 'company',
    },
    {
      name: lt('Documents'),
      href: '/dashboard/documents',
      icon: <FileText className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'OPERATOR', 'SUPER_ADMIN'],
      group: 'company',
    },
    {
      name: lt('Transactions'),
      href: '/dashboard/transactions',
      icon: <CreditCard className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'],
      group: 'company',
    },
    {
      name: lt('Banking'),
      href: '/dashboard/banking',
      icon: <Landmark className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'],
      group: 'company',
    },
    {
      name: lt('Accounts'),
      href: '/dashboard/accounts',
      icon: <FolderTree className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'],
      group: 'company',
    },
    {
      name: lt('Reports'),
      href: '/dashboard/reports',
      icon: <BarChart3 className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'],
      group: 'company',
    },
    {
      name: lt('Team'),
      href: '/dashboard/team',
      icon: <Users className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'SUPER_ADMIN'],
      group: 'company',
    },
    // Admin group: tenant management and platform admin
    {
      name: lt('Tenant Admin'),
      href: '/tenant-admin',
      icon: <Building2 className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN'],
      group: 'admin',
    },
    {
      name: lt('Admin'),
      href: '/admin',
      icon: <Building2 className="w-5 h-5" />,
      roles: ['SUPER_ADMIN'],
      group: 'admin',
    },
    // User & Billing / Settings group
    {
      name: lt('Settings'),
      href: '/dashboard/settings',
      icon: <Settings className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'OPERATOR', 'SUPER_ADMIN'],
      group: 'user',
    },
  ]

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Filter navigation items based on user role
  const visibleNavItems = navigationItems.filter((item) => {
    // New users may not have a tenant yet, so `userRole` can be null.
    // Keep a minimal nav so the sidebar doesn't appear empty.
    if (!userRole) return item.href === '/dashboard' || item.href === '/dashboard/settings'
    return item.roles.includes(userRole)
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">{tCommon('loading')}</div>
      </div>
    )
  }

  const personalizationValue = {
    tenantId: currentTenant?.id || null,
    templatesLoading: dashboardTemplatesLoading,
    templates: dashboardTemplates,
    defaultTemplateKey: dashboardDefaultTemplateKey,
    selectedTemplateKey: dashboardSelectedTemplateKey,
    setSelectedTemplateKey: setDashboardSelectedTemplateKey,
    layout: dashboardLayout,
    setLayout: setDashboardLayout,
    isCustomizing,
    setIsCustomizing,
    actionLoading: dashboardActionLoading,
    setActionLoading: setDashboardActionLoading,
  }

  return (
    <DashboardPersonalizationProvider value={personalizationValue}>
    <div className="flex min-h-screen bg-gray-100">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
            <h1 className="text-xl font-bold text-gray-900">{platform?.name || lt('LedgerAI')}</h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Tenant Selector */}
          <div className="p-4 border-b border-gray-200">
            {tenants.length > 0 && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  {lt('Current Company')}
                </label>
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={open}
                      className="w-full justify-between"
                    >
                      <span className="truncate">
                        {currentTenant
                          ? tenants.find((tenant) => tenant.id === currentTenant.id)?.name
                          : lt('Select company...')}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-0">
                    <Command>
                      <CommandInput placeholder={lt('Search company...')} />
                      <CommandList>
                        <CommandEmpty>{lt('No company found.')}</CommandEmpty>
                        <CommandGroup>
                          {tenants.map((tenant) => (
                            <CommandItem
                              key={tenant.id}
                              value={tenant.name}
                              onSelect={() => {
                                switchTenant(tenant.id)
                                setOpen(false)
                              }}
                              className="cursor-pointer data-[disabled]:opacity-100 data-[disabled]:pointer-events-auto"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  currentTenant?.id === tenant.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {tenant.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <CreateTenantModal />
            {userRole && (
              <p className="mt-2 text-xs text-gray-500">
                {lt('Role:')} <span className="font-medium">{getRoleLabel(userRole)}</span>
              </p>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-6 overflow-y-auto">
            {/* Company Section */}
            <div>
              <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {lt('Company')}
              </h3>
              <div className="space-y-1">
                {visibleNavItems.filter(item => (item.group || 'company') === 'company').map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      pathname === item.href 
                        ? 'bg-primary/10 text-primary' 
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    } ${navigatingTo === item.href ? 'opacity-80' : ''}`}
                    onClick={() => handleNavClick(item.href)}
                    aria-busy={navigatingTo === item.href}
                  >
                    {item.icon}
                    <span className="ml-3">{item.name}</span>
                    {navigatingTo === item.href && (
                      <Loader2 className="ml-auto h-4 w-4 animate-spin text-gray-500" />
                    )}
                  </Link>
                ))}
              </div>
            </div>

            {/* Admin Section */}
            {visibleNavItems.some(i => i.group === 'admin') && (
              <div>
                <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {lt('Admin')}
                </h3>
                <div className="space-y-1">
                  {visibleNavItems.filter(item => item.group === 'admin').map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        pathname === item.href 
                          ? 'bg-primary/10 text-primary' 
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      } ${navigatingTo === item.href ? 'opacity-80' : ''}`}
                      onClick={() => handleNavClick(item.href)}
                      aria-busy={navigatingTo === item.href}
                    >
                      {item.icon}
                      <span className="ml-3">{item.name}</span>
                      {navigatingTo === item.href && (
                        <Loader2 className="ml-auto h-4 w-4 animate-spin text-gray-500" />
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* User Section */}
            <div>
              <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {lt('USER & BILLING')}
              </h3>
              <div className="space-y-1">
                {visibleNavItems.filter(item => item.group === 'user').map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      pathname === item.href 
                        ? 'bg-primary/10 text-primary' 
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    } ${navigatingTo === item.href ? 'opacity-80' : ''}`}
                    onClick={() => handleNavClick(item.href)}
                    aria-busy={navigatingTo === item.href}
                  >
                    {item.icon}
                    <span className="ml-3">{item.name}</span>
                    {navigatingTo === item.href && (
                      <Loader2 className="ml-auto h-4 w-4 animate-spin text-gray-500" />
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-gray-200">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5 mr-3" />
              {lt('Log out')}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between h-full px-4 md:px-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden"
              >
                <Menu className="w-6 h-6" />
              </button>
              <h2 className="text-lg font-semibold text-gray-800 block">
                {visibleNavItems.find(item => item.href === pathname)?.name || lt('Dashboard')}
              </h2>
            </div>
            <div className="flex items-center space-x-4">
              {currentTenant?.id && dashboardTemplates.length > 0 && (
                <div className="flex md:hidden items-center">
                  <Popover open={dashboardMenuOpen} onOpenChange={setDashboardMenuOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" disabled={dashboardTemplatesLoading}>
                        {lt('Dashboard')}
                        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-3" align="end">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-gray-500">{lt('Template')}</div>
                          <Select
                            value={dashboardSelectedTemplateKey || undefined}
                            onValueChange={(v) => {
                              setDashboardMenuOpen(false)
                              handleDashboardTemplateChange(v)
                            }}
                            disabled={dashboardTemplatesLoading}
                          >
                            <SelectTrigger className="h-9 w-full" aria-label={lt('Dashboard template')}>
                              <SelectValue placeholder={dashboardTemplatesLoading ? lt('Loading templates…') : lt('Select template…')} />
                            </SelectTrigger>
                            <SelectContent>
                              {dashboardTemplates.map((tpl) => (
                                <SelectItem key={tpl.key} value={tpl.key}>
                                  {userRole === 'SUPER_ADMIN' && tpl.role
                                    ? `${getRoleLabel(tpl.role)}: ${lt(tpl.name)}`
                                    : lt(tpl.name)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant={isCustomizing ? 'default' : 'outline'}
                            size="sm"
                            className="flex-1"
                            onClick={() => setIsCustomizing(v => !v)}
                          >
                            {lt('Customize')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={handleSaveDashboardLayout}
                            disabled={!isCustomizing || !dashboardLayout || dashboardActionLoading !== null}
                          >
                            {dashboardActionLoading === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : tCommon('save')}
                          </Button>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={handleResetDashboardLayout}
                            disabled={!dashboardSelectedTemplateKey || dashboardActionLoading !== null}
                          >
                            {dashboardActionLoading === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : tCommon('reset')}
                          </Button>
                          {canPublishTenantDashboard ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={handlePublishTenantDashboardLayout}
                              disabled={!dashboardLayout || dashboardActionLoading !== null}
                            >
                              {dashboardActionLoading === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : lt('Publish')}
                            </Button>
                          ) : (
                            <div className="flex-1" />
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {currentTenant?.id && dashboardTemplates.length > 0 && (
                <div className="hidden md:flex items-center gap-2">
                  <Select
                    value={dashboardSelectedTemplateKey || undefined}
                    onValueChange={handleDashboardTemplateChange}
                    disabled={dashboardTemplatesLoading}
                  >
                    <SelectTrigger className="h-9 w-[210px]" aria-label={lt('Dashboard template')}>
                      <SelectValue placeholder={dashboardTemplatesLoading ? lt('Loading templates…') : lt('Select template…')} />
                    </SelectTrigger>
                    <SelectContent>
                      {dashboardTemplates.map((tpl) => (
                        <SelectItem key={tpl.key} value={tpl.key}>
                          {userRole === 'SUPER_ADMIN' && tpl.role
                            ? `${getRoleLabel(tpl.role)}: ${lt(tpl.name)}`
                            : lt(tpl.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant={isCustomizing ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setIsCustomizing(v => !v)}
                  >
                    {lt('Customize')}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveDashboardLayout}
                    disabled={!isCustomizing || !dashboardLayout || dashboardActionLoading !== null}
                  >
                    {dashboardActionLoading === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : tCommon('save')}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetDashboardLayout}
                    disabled={!dashboardSelectedTemplateKey || dashboardActionLoading !== null}
                  >
                    {dashboardActionLoading === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : tCommon('reset')}
                  </Button>

                  {canPublishTenantDashboard && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePublishTenantDashboardLayout}
                      disabled={!dashboardLayout || dashboardActionLoading !== null}
                    >
                      {dashboardActionLoading === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : lt('Publish')}
                    </Button>
                  )}
                </div>
              )}

              {userRole === 'SUPER_ADMIN' && (
                <Link
                  href="/admin"
                  prefetch
                  onClick={() => handleNavClick('/admin')}
                  aria-busy={navigatingTo === '/admin'}
                >
                  <Button variant="outline" size="sm">
                    <Building2 className="w-4 h-4 md:mr-2" />
                    <span className="hidden md:inline">{lt('Admin')}</span>
                  </Button>
                </Link>
              )}
              <LanguageSwitcher />
              {isNavigating && (
                <div className="flex items-center text-sm text-gray-500" aria-live="polite">
                  <span className="inline-flex items-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span className="hidden md:inline">{tCommon('loading')}</span>
                  </span>
                </div>
              )}
              <span className="text-sm font-medium text-gray-700">
                {currentTenant?.name || lt('No Company Selected')}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
          {children}
        </main>

        {/* AI Agent Widget */}
        {subscription?.features?.ai_agent && (
          <AiAgentWidget 
            tenantId={currentTenant?.id} 
          />
        )}
      </div>
    </div>
    </DashboardPersonalizationProvider>
  )
}
