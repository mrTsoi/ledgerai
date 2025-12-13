import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

function getPlaidEnv() {
  const env = (process.env.PLAID_ENV || 'sandbox').toLowerCase()
  if (env === 'production') return PlaidEnvironments.production
  if (env === 'development') return PlaidEnvironments.development
  return PlaidEnvironments.sandbox
}

export function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET

  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID/PLAID_SECRET are not set')
  }

  const configuration = new Configuration({
    basePath: getPlaidEnv(),
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })

  return new PlaidApi(configuration)
}
