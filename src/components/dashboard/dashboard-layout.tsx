'use client'

import { useTenant, useUserRole } from '@/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname, Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { useTranslations } from 'next-intl'
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
  Landmark
} from 'lucide-react'
import { useState } from 'react'

import { CreateTenantModal } from '@/components/tenant/create-tenant-modal'

interface NavItem {
  name: string
  href: string
  icon: React.ReactNode
  roles: string[]
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const { currentTenant, tenants, switchTenant, loading } = useTenant()
  const userRole = useUserRole()
  const router = useRouter()
  const pathname = usePathname() // Use usePathname hook
  const supabase = createClient()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navigationItems: NavItem[] = [
    {
      name: t('dashboard'),
      href: '/dashboard',
      icon: <Home className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'OPERATOR', 'SUPER_ADMIN'],
    },
    {
      name: t('documents'),
      href: '/dashboard/documents',
      icon: <FileText className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'OPERATOR', 'SUPER_ADMIN'],
    },
    {
      name: t('transactions'),
      href: '/dashboard/transactions',
      icon: <CreditCard className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'],
    },
    {
      name: t('banking'),
      href: '/dashboard/banking',
      icon: <Landmark className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'],
    },
    {
      name: t('accounts'),
      href: '/dashboard/accounts',
      icon: <FolderTree className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'],
    },
    {
      name: t('reports'),
      href: '/dashboard/reports',
      icon: <BarChart3 className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'],
    },
    {
      name: t('team'),
      href: '/dashboard/team',
      icon: <Users className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'SUPER_ADMIN'],
    },
    {
      name: t('settings'),
      href: '/dashboard/settings',
      icon: <Settings className="w-5 h-5" />,
      roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'OPERATOR', 'SUPER_ADMIN'],
    },
  ]

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Filter navigation items based on user role
  const visibleNavItems = navigationItems.filter((item) =>
    userRole ? item.roles.includes(userRole) : false
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">{tCommon('loading')}</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-100">
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
            <h1 className="text-xl font-bold text-gray-900">LedgerAI</h1>
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
                  Current Company
                </label>
                <select
                  value={currentTenant?.id || ''}
                  onChange={(e) => switchTenant(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <CreateTenantModal />
            {userRole && (
              <p className="mt-2 text-xs text-gray-500">
                Role: <span className="font-medium">{userRole}</span>
              </p>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-6 overflow-y-auto">
            {/* Company Section */}
            <div>
              <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Company
              </h3>
              <div className="space-y-1">
                {visibleNavItems.filter(item => item.href !== '/dashboard/settings').map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      pathname === item.href 
                        ? 'bg-primary/10 text-primary' 
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    {item.icon}
                    <span className="ml-3">{item.name}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* User Section */}
            <div>
              <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                User & Billing
              </h3>
              <div className="space-y-1">
                {visibleNavItems.filter(item => item.href === '/dashboard/settings').map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      pathname === item.href 
                        ? 'bg-primary/10 text-primary' 
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    {item.icon}
                    <span className="ml-3">{item.name}</span>
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
              {t('logout')}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden">
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
                {visibleNavItems.find(item => item.href === pathname)?.name || t('dashboard')}
              </h2>
            </div>
            <div className="flex items-center space-x-4">
              {userRole === 'SUPER_ADMIN' && (
                <Link href="/admin">
                  <Button variant="outline" size="sm">
                    <Building2 className="w-4 h-4 md:mr-2" />
                    <span className="hidden md:inline">{t('admin')}</span>
                  </Button>
                </Link>
              )}
              <LanguageSwitcher />
              <span className="text-sm font-medium text-gray-700">
                {currentTenant?.name || 'No Company Selected'}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
