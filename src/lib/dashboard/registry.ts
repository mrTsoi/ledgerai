export type UserRole = 'COMPANY_ADMIN' | 'ACCOUNTANT' | 'OPERATOR' | 'SUPER_ADMIN'

export type WidgetSize = 'S' | 'M' | 'L'

export type DashboardWidgetType =
  | 'kpis'
  | 'quick_actions'
  | 'recent_activity'
  | 'subscription_status'
  | 'admin_shortcuts'
  | 'alerts'
  | 'work_queue'
  | 'document_pipeline'
  | 'transaction_health'
  | 'profit_loss_snapshot'
  | 'external_import_schedule'
  | 'next_steps'
  | 'usage'
  | 'reports_overview'
  | 'trends'

export type DashboardLayoutV1 = {
  version: 1
  templateKey: string
  widgets: Array<{
    id: string
    type: DashboardWidgetType
    size: WidgetSize
    hidden?: boolean
    settings?: Record<string, unknown>
  }>
  order: string[]
}

export type DashboardTemplate = {
  key: string
  name: string
  description: string
  role: UserRole
  defaultLayout: DashboardLayoutV1
}

const widget = (id: string, type: DashboardWidgetType, size: WidgetSize) => ({ id, type, size })

const makeLayout = (templateKey: string, widgets: Array<{ id: string; type: DashboardWidgetType; size: WidgetSize }>): DashboardLayoutV1 => ({
  version: 1,
  templateKey,
  widgets,
  order: widgets.map(w => w.id),
})

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    key: 'company_admin.overview',
    role: 'COMPANY_ADMIN',
    name: 'Business Overview',
    description: 'High-level company KPIs and recent activity.',
    defaultLayout: makeLayout('company_admin.overview', [
      widget('w_kpis', 'kpis', 'L'),
      widget('w_quick', 'quick_actions', 'M'),
      widget('w_recent', 'recent_activity', 'L'),
      widget('w_sub', 'subscription_status', 'S'),
    ]),
  },
  {
    key: 'company_admin.finance',
    role: 'COMPANY_ADMIN',
    name: 'Finance Snapshot',
    description: 'Profit/loss, transaction health, and important alerts.',
    defaultLayout: makeLayout('company_admin.finance', [
      widget('w_pl', 'profit_loss_snapshot', 'L'),
      widget('w_tx_health', 'transaction_health', 'M'),
      widget('w_alerts', 'alerts', 'M'),
      widget('w_recent', 'recent_activity', 'L'),
    ]),
  },
  {
    key: 'company_admin.operations',
    role: 'COMPANY_ADMIN',
    name: 'Operations',
    description: 'Work queue and pipeline status for the team.',
    defaultLayout: makeLayout('company_admin.operations', [
      widget('w_queue', 'work_queue', 'M'),
      widget('w_pipeline', 'document_pipeline', 'M'),
      widget('w_quick', 'quick_actions', 'M'),
      widget('w_alerts', 'alerts', 'S'),
      widget('w_recent', 'recent_activity', 'L'),
    ]),
  },
  {
    key: 'company_admin.imports',
    role: 'COMPANY_ADMIN',
    name: 'Imports & Ops',
    description: 'External import schedule with next steps and trends.',
    defaultLayout: makeLayout('company_admin.imports', [
      widget('w_imports', 'external_import_schedule', 'L'),
      widget('w_next', 'next_steps', 'M'),
      widget('w_trends', 'trends', 'M'),
      widget('w_reports', 'reports_overview', 'S'),
    ]),
  },
  {
    key: 'accountant.close',
    role: 'ACCOUNTANT',
    name: 'Close & Reconcile',
    description: 'Focus on in-progress work and monthly movement.',
    defaultLayout: makeLayout('accountant.close', [
      widget('w_kpis', 'kpis', 'L'),
      widget('w_recent', 'recent_activity', 'L'),
      widget('w_quick', 'quick_actions', 'M'),
      widget('w_sub', 'subscription_status', 'S'),
    ]),
  },
  {
    key: 'accountant.reconcile',
    role: 'ACCOUNTANT',
    name: 'Reconcile',
    description: 'Transaction health plus a focused work queue.',
    defaultLayout: makeLayout('accountant.reconcile', [
      widget('w_tx_health', 'transaction_health', 'L'),
      widget('w_queue', 'work_queue', 'M'),
      widget('w_alerts', 'alerts', 'S'),
      widget('w_recent', 'recent_activity', 'L'),
    ]),
  },
  {
    key: 'accountant.reporting',
    role: 'ACCOUNTANT',
    name: 'Reporting',
    description: 'Profit/loss snapshot and month-to-date movement.',
    defaultLayout: makeLayout('accountant.reporting', [
      widget('w_pl', 'profit_loss_snapshot', 'L'),
      widget('w_tx_health', 'transaction_health', 'M'),
      widget('w_recent', 'recent_activity', 'L'),
      widget('w_alerts', 'alerts', 'S'),
    ]),
  },
  {
    key: 'accountant.month_end',
    role: 'ACCOUNTANT',
    name: 'Month End',
    description: 'Reports, imports, and what to do next for close.',
    defaultLayout: makeLayout('accountant.month_end', [
      widget('w_reports', 'reports_overview', 'M'),
      widget('w_imports', 'external_import_schedule', 'L'),
      widget('w_next', 'next_steps', 'M'),
      widget('w_trends', 'trends', 'S'),
      widget('w_pl', 'profit_loss_snapshot', 'L'),
    ]),
  },
  {
    key: 'operator.daily',
    role: 'OPERATOR',
    name: 'Daily Processing',
    description: 'Daily document and transaction workflow.',
    defaultLayout: makeLayout('operator.daily', [
      widget('w_quick', 'quick_actions', 'M'),
      widget('w_recent', 'recent_activity', 'L'),
      widget('w_kpis', 'kpis', 'L'),
      widget('w_sub', 'subscription_status', 'S'),
    ]),
  },
  {
    key: 'operator.inbox',
    role: 'OPERATOR',
    name: 'Inbox',
    description: 'Pipeline and queue-first view for daily ops.',
    defaultLayout: makeLayout('operator.inbox', [
      widget('w_queue', 'work_queue', 'M'),
      widget('w_pipeline', 'document_pipeline', 'M'),
      widget('w_recent', 'recent_activity', 'L'),
      widget('w_quick', 'quick_actions', 'M'),
    ]),
  },
  {
    key: 'operator.quality',
    role: 'OPERATOR',
    name: 'Quality Control',
    description: 'Spot issues early: failures, drafts, and alerts.',
    defaultLayout: makeLayout('operator.quality', [
      widget('w_alerts', 'alerts', 'M'),
      widget('w_pipeline', 'document_pipeline', 'M'),
      widget('w_queue', 'work_queue', 'M'),
      widget('w_recent', 'recent_activity', 'L'),
    ]),
  },
  {
    key: 'operator.imports',
    role: 'OPERATOR',
    name: 'Imports',
    description: 'External import schedule and next-step actions.',
    defaultLayout: makeLayout('operator.imports', [
      widget('w_imports', 'external_import_schedule', 'L'),
      widget('w_next', 'next_steps', 'M'),
      widget('w_pipeline', 'document_pipeline', 'M'),
      widget('w_queue', 'work_queue', 'M'),
    ]),
  },
  {
    key: 'super_admin.platform',
    role: 'SUPER_ADMIN',
    name: 'Platform Health',
    description: 'Shortcuts and signals for platform administration.',
    defaultLayout: makeLayout('super_admin.platform', [
      widget('w_admin', 'admin_shortcuts', 'M'),
      widget('w_kpis', 'kpis', 'L'),
      widget('w_recent', 'recent_activity', 'L'),
      widget('w_sub', 'subscription_status', 'S'),
    ]),
  },
  {
    key: 'super_admin.ops',
    role: 'SUPER_ADMIN',
    name: 'Ops Console',
    description: 'Admin shortcuts plus alerts and tenant activity.',
    defaultLayout: makeLayout('super_admin.ops', [
      widget('w_admin', 'admin_shortcuts', 'M'),
      widget('w_alerts', 'alerts', 'M'),
      widget('w_recent', 'recent_activity', 'L'),
      widget('w_sub', 'subscription_status', 'S'),
    ]),
  },
  {
    key: 'super_admin.usage',
    role: 'SUPER_ADMIN',
    name: 'Usage & Limits',
    description: 'Usage signals with shortcuts and alerts.',
    defaultLayout: makeLayout('super_admin.usage', [
      widget('w_usage', 'usage', 'M'),
      widget('w_admin', 'admin_shortcuts', 'M'),
      widget('w_alerts', 'alerts', 'M'),
      widget('w_trends', 'trends', 'M'),
    ]),
  },
]

export function getTemplatesForRole(role: UserRole): DashboardTemplate[] {
  return DASHBOARD_TEMPLATES.filter(t => t.role === role)
}

export function getTemplateByKey(templateKey: string): DashboardTemplate | undefined {
  return DASHBOARD_TEMPLATES.find(t => t.key === templateKey)
}

export function getDefaultTemplateKeyForRole(role: UserRole): string {
  const first = getTemplatesForRole(role)[0]
  return first?.key || 'company_admin.overview'
}

export function isTemplateAllowedForRole(templateKey: string, role: UserRole): boolean {
  const t = getTemplateByKey(templateKey)
  if (!t) return false
  return t.role === role
}

export function sanitizeLayoutForTemplate(layout: unknown, templateKey: string): DashboardLayoutV1 {
  // Minimal validation/sanitization for v1.
  // We only accept known widgets/sizes and ensure order aligns with widget ids.
  const tpl = getTemplateByKey(templateKey)
  if (!tpl) return tplFallback(templateKey)

  if (!layout || typeof layout !== 'object') return tpl.defaultLayout
  const obj = layout as any
  if (obj.version !== 1) return tpl.defaultLayout

  const widgetsRaw = Array.isArray(obj.widgets) ? obj.widgets : []
  const widgets: DashboardLayoutV1['widgets'] = widgetsRaw
    .map((w: any) => ({
      id: typeof w?.id === 'string' ? w.id : null,
      type: typeof w?.type === 'string' ? w.type : null,
      size: typeof w?.size === 'string' ? w.size : null,
      hidden: typeof w?.hidden === 'boolean' ? w.hidden : undefined,
      settings: w?.settings && typeof w.settings === 'object' ? w.settings : undefined,
    }))
    .filter((w: any) => Boolean(w.id) && Boolean(w.type) && Boolean(w.size))
    .filter((w: any) => ['S', 'M', 'L'].includes(w.size))
    .filter((w: any) => ['kpis', 'quick_actions', 'recent_activity', 'subscription_status', 'admin_shortcuts', 'alerts', 'work_queue', 'document_pipeline', 'transaction_health', 'profit_loss_snapshot', 'external_import_schedule', 'next_steps', 'usage', 'reports_overview', 'trends'].includes(w.type))
    .map((w: any) => ({ id: w.id, type: w.type as DashboardWidgetType, size: w.size as WidgetSize, hidden: w.hidden, settings: w.settings }))

  const widgetIds = new Set(widgets.map(w => w.id))
  const orderRaw = Array.isArray(obj.order) ? obj.order : []
  const order = orderRaw.filter((id: any) => typeof id === 'string' && widgetIds.has(id))

  // Ensure order includes any missing widgets at the end.
  for (const w of widgets) {
    if (!order.includes(w.id)) order.push(w.id)
  }

  return {
    version: 1,
    templateKey,
    widgets,
    order,
  }
}

function tplFallback(templateKey: string): DashboardLayoutV1 {
  const tpl = getTemplateByKey(templateKey)
  return tpl?.defaultLayout || makeLayout(templateKey, [widget('w_kpis', 'kpis', 'L')])
}
