export interface AuditIssue {
  transactionId: string
  description: string
  issueType: 'DUPLICATE' | 'MISSING_DATA' | 'WRONG_TENANT' | 'UNBALANCED' | 'SUSPICIOUS' | 'ANOMALY'
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  details?: string
}
