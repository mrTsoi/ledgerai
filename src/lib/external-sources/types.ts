export type ExternalSourceProvider = 'SFTP' | 'FTPS' | 'GOOGLE_DRIVE' | 'ONEDRIVE'

export type ExternalSourceConfig = {
  // Common
  remote_path?: string
  file_glob?: string
  document_type?: 'invoice' | 'receipt' | 'bank_statement' | 'other' | null
  bank_account_id?: string | null

  // SFTP/FTPS
  host?: string
  port?: number

  // Cloud drives
  folder_id?: string
}

export type ExternalSourceSecrets = {
  // SFTP
  username?: string
  password?: string
  private_key_pem?: string
  passphrase?: string
  host_key?: string

  // FTPS mTLS
  client_cert_pem?: string
  client_key_pem?: string
  ca_cert_pem?: string

  // Cloud (OAuth)
  refresh_token?: string
  access_token?: string
  expires_at?: string
}

export type ExternalSourceRow = {
  id: string
  tenant_id: string
  name: string
  provider: ExternalSourceProvider
  enabled: boolean
  schedule_minutes: number
  last_run_at: string | null
  config: ExternalSourceConfig
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ExternalSourceItemIdentity = {
  remote_id?: string
  remote_path?: string
  modified_at?: string
  size?: number
}

export type ExternalFetchedFile = {
  identity: ExternalSourceItemIdentity
  filename: string
  mimeType: string
  bytes: Uint8Array
}
