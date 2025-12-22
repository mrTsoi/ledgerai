import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const currencies = [
  // Fiat Currencies
  { value: "USD", label: "USD - United States Dollar", type: "fiat" },
  { value: "EUR", label: "EUR - Euro", type: "fiat" },
  { value: "GBP", label: "GBP - British Pound Sterling", type: "fiat" },
  { value: "JPY", label: "JPY - Japanese Yen", type: "fiat" },
  { value: "AUD", label: "AUD - Australian Dollar", type: "fiat" },
  { value: "CAD", label: "CAD - Canadian Dollar", type: "fiat" },
  { value: "CHF", label: "CHF - Swiss Franc", type: "fiat" },
  { value: "CNY", label: "CNY - Chinese Yuan", type: "fiat" },
  { value: "HKD", label: "HKD - Hong Kong Dollar", type: "fiat" },
  { value: "NZD", label: "NZD - New Zealand Dollar", type: "fiat" },
  { value: "SEK", label: "SEK - Swedish Krona", type: "fiat" },
  { value: "KRW", label: "KRW - South Korean Won", type: "fiat" },
  { value: "SGD", label: "SGD - Singapore Dollar", type: "fiat" },
  { value: "NOK", label: "NOK - Norwegian Krone", type: "fiat" },
  { value: "MXN", label: "MXN - Mexican Peso", type: "fiat" },
  { value: "INR", label: "INR - Indian Rupee", type: "fiat" },
  { value: "RUB", label: "RUB - Russian Ruble", type: "fiat" },
  { value: "ZAR", label: "ZAR - South African Rand", type: "fiat" },
  { value: "TRY", label: "TRY - Turkish Lira", type: "fiat" },
  { value: "BRL", label: "BRL - Brazilian Real", type: "fiat" },
  { value: "TWD", label: "TWD - New Taiwan Dollar", type: "fiat" },
  { value: "DKK", label: "DKK - Danish Krone", type: "fiat" },
  { value: "PLN", label: "PLN - Polish Zloty", type: "fiat" },
  { value: "THB", label: "THB - Thai Baht", type: "fiat" },
  { value: "IDR", label: "IDR - Indonesian Rupiah", type: "fiat" },
  { value: "HUF", label: "HUF - Hungarian Forint", type: "fiat" },
  { value: "CZK", label: "CZK - Czech Koruna", type: "fiat" },
  { value: "ILS", label: "ILS - Israeli New Shekel", type: "fiat" },
  { value: "CLP", label: "CLP - Chilean Peso", type: "fiat" },
  { value: "PHP", label: "PHP - Philippine Peso", type: "fiat" },
  { value: "AED", label: "AED - UAE Dirham", type: "fiat" },
  { value: "COP", label: "COP - Colombian Peso", type: "fiat" },
  { value: "SAR", label: "SAR - Saudi Riyal", type: "fiat" },
  { value: "MYR", label: "MYR - Malaysian Ringgit", type: "fiat" },
  { value: "RON", label: "RON - Romanian Leu", type: "fiat" },
  // Cryptocurrencies
  { value: "BTC", label: "BTC - Bitcoin", type: "crypto" },
  { value: "ETH", label: "ETH - Ethereum", type: "crypto" },
  { value: "USDT", label: "USDT - Tether", type: "crypto" },
  { value: "BNB", label: "BNB - Binance Coin", type: "crypto" },
  { value: "USDC", label: "USDC - USD Coin", type: "crypto" },
  { value: "XRP", label: "XRP - XRP", type: "crypto" },
  { value: "ADA", label: "ADA - Cardano", type: "crypto" },
  { value: "DOGE", label: "DOGE - Dogecoin", type: "crypto" },
  { value: "SOL", label: "SOL - Solana", type: "crypto" },
  { value: "TRX", label: "TRX - TRON", type: "crypto" },
  { value: "DOT", label: "DOT - Polkadot", type: "crypto" },
  { value: "MATIC", label: "MATIC - Polygon", type: "crypto" },
  { value: "LTC", label: "LTC - Litecoin", type: "crypto" },
  { value: "SHIB", label: "SHIB - Shiba Inu", type: "crypto" },
  { value: "AVAX", label: "AVAX - Avalanche", type: "crypto" },
  { value: "DAI", label: "DAI - Dai", type: "crypto" },
  { value: "LINK", label: "LINK - Chainlink", type: "crypto" },
  { value: "ATOM", label: "ATOM - Cosmos", type: "crypto" },
  { value: "UNI", label: "UNI - Uniswap", type: "crypto" },
]

function literalKeyFromText(text) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  const hex = crypto.createHash('sha1').update(normalized, 'utf8').digest('hex').slice(0, 12)
  return `literal.${hex}`
}

async function upsertEnglishBase(supabase, texts) {
  const rows = Array.from(new Set(texts))
    .map((t) => String(t ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((text) => ({
      locale: 'en',
      namespace: 'literals',
      key: literalKeyFromText(text),
      value: text,
    }))

  const batchSize = 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from('app_translations').upsert(batch, { onConflict: 'locale,namespace,key' })
    if (error) throw error
  }

  return rows.length
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in environment.')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const texts = currencies.map(c => c.label)
  const unique = Array.from(new Set(texts.map((t) => String(t ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)))
  console.log(`Found ${unique.length} unique currency strings (labels).`)

  if (unique.length === 0) {
    console.log('Nothing to import.')
    process.exit(0)
  }

  const inserted = await upsertEnglishBase(supabase, unique)
  console.log(`Upserted ${inserted} English base currency strings into app_translations (namespace=literals).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
