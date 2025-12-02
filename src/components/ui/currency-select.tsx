"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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

interface CurrencySelectProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function CurrencySelect({ 
  value, 
  onChange, 
  placeholder = "Select currency...",
  className,
  disabled = false
}: CurrencySelectProps) {
  const [open, setOpen] = React.useState(false)
  
  // console.log('DEBUG: CurrencySelect disabled:', disabled)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
          type="button"
        >
          {value
            ? currencies.find((currency) => currency.value === value)?.label
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search currency..." />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup heading="Fiat Currencies">
              {currencies
                .filter(c => c.type === 'fiat')
                .map((currency) => (
                  <CommandItem
                    key={currency.value}
                    value={currency.label}
                    onSelect={() => {
                      onChange(currency.value)
                      setOpen(false)
                    }}
                    className="cursor-pointer data-[disabled]:opacity-100 data-[disabled]:pointer-events-auto"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === currency.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {currency.label}
                  </CommandItem>
                ))}
            </CommandGroup>
            <CommandGroup heading="Cryptocurrencies">
              {currencies
                .filter(c => c.type === 'crypto')
                .map((currency) => (
                  <CommandItem
                    key={currency.value}
                    value={currency.label}
                    onSelect={() => {
                      onChange(currency.value)
                      setOpen(false)
                    }}
                    className="cursor-pointer data-[disabled]:opacity-100 data-[disabled]:pointer-events-auto"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === currency.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {currency.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
