"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"


import { cn } from "@/lib/utils"
import { useLiterals } from "@/hooks/use-literals"

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
import { LapTimerIcon } from "@radix-ui/react-icons"

// currencies array moved inside CurrencySelect

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
  const lt = useLiterals()

  const currencies = [
    // Fiat Currencies
    { value: "USD", label: lt("USD - United States Dollar", { type: "fiat" }), type: "fiat" },
    { value: "EUR", label: lt("EUR - Euro", { type: "fiat" }), type: "fiat" },
    { value: "GBP", label: lt("GBP - British Pound Sterling", { type: "fiat" }), type: "fiat" },
    { value: "JPY", label: lt("JPY - Japanese Yen", { type: "fiat" }), type: "fiat" },
    { value: "AUD", label: lt("AUD - Australian Dollar", { type: "fiat" }), type: "fiat" },
    { value: "CAD", label: lt("CAD - Canadian Dollar", { type: "fiat" }), type: "fiat" },
    { value: "CHF", label: lt("CHF - Swiss Franc", { type: "fiat" }), type: "fiat" },
    { value: "CNY", label: lt("CNY - Chinese Yuan", { type: "fiat" }), type: "fiat" },
    { value: "HKD", label: lt("HKD - Hong Kong Dollar", { type: "fiat" }), type: "fiat" },
    { value: "NZD", label: lt("NZD - New Zealand Dollar", { type: "fiat" }), type: "fiat" },
    { value: "SEK", label: lt("SEK - Swedish Krona", { type: "fiat" }), type: "fiat" },
    { value: "KRW", label: lt("KRW - South Korean Won", { type: "fiat" }), type: "fiat" },
    { value: "SGD", label: lt("SGD - Singapore Dollar", { type: "fiat" }), type: "fiat" },
    { value: "NOK", label: lt("NOK - Norwegian Krone", { type: "fiat" }), type: "fiat" },
    { value: "MXN", label: lt("MXN - Mexican Peso", { type: "fiat" }), type: "fiat" },
    { value: "INR", label: lt("INR - Indian Rupee", { type: "fiat" }), type: "fiat" },
    { value: "RUB", label: lt("RUB - Russian Ruble", { type: "fiat" }), type: "fiat" },
    { value: "ZAR", label: lt("ZAR - South African Rand", { type: "fiat" }), type: "fiat" },
    { value: "TRY", label: lt("TRY - Turkish Lira", { type: "fiat" }), type: "fiat" },
    { value: "BRL", label: lt("BRL - Brazilian Real", { type: "fiat" }), type: "fiat" },
    { value: "TWD", label: lt("TWD - New Taiwan Dollar", { type: "fiat" }), type: "fiat" },
    { value: "DKK", label: lt("DKK - Danish Krone", { type: "fiat" }), type: "fiat" },
    { value: "PLN", label: lt("PLN - Polish Zloty", { type: "fiat" }), type: "fiat" },
    { value: "THB", label: lt("THB - Thai Baht", { type: "fiat" }), type: "fiat" },
    { value: "IDR", label: lt("IDR - Indonesian Rupiah", { type: "fiat" }), type: "fiat" },
    { value: "HUF", label: lt("HUF - Hungarian Forint", { type: "fiat" }), type: "fiat" },
    { value: "CZK", label: lt("CZK - Czech Koruna", { type: "fiat" }), type: "fiat" },
    { value: "ILS", label: lt("ILS - Israeli New Shekel", { type: "fiat" }), type: "fiat" },
    { value: "CLP", label: lt("CLP - Chilean Peso", { type: "fiat" }), type: "fiat" },
    { value: "PHP", label: lt("PHP - Philippine Peso", { type: "fiat" }), type: "fiat" },
    { value: "AED", label: lt("AED - UAE Dirham", { type: "fiat" }), type: "fiat" },
    { value: "COP", label: lt("COP - Colombian Peso", { type: "fiat" }), type: "fiat" },
    { value: "SAR", label: lt("SAR - Saudi Riyal", { type: "fiat" }), type: "fiat" },
    { value: "MYR", label: lt("MYR - Malaysian Ringgit", { type: "fiat" }), type: "fiat" },
    { value: "RON", label: lt("RON - Romanian Leu", { type: "fiat" }), type: "fiat" },

    // Cryptocurrencies
    { value: "BTC", label: lt("BTC - Bitcoin", { type: "crypto" }), type: "crypto" },
    { value: "ETH", label: lt("ETH - Ethereum", { type: "crypto" }), type: "crypto" },
    { value: "USDT", label: lt("USDT - Tether", { type: "crypto" }), type: "crypto" },
    { value: "BNB", label: lt("BNB - Binance Coin", { type: "crypto" }), type: "crypto" },
    { value: "USDC", label: lt("USDC - USD Coin", { type: "crypto" }), type: "crypto" },
    { value: "XRP", label: lt("XRP - XRP", { type: "crypto" }), type: "crypto" },
    { value: "ADA", label: lt("ADA - Cardano", { type: "crypto" }), type: "crypto" },
    { value: "DOGE", label: lt("DOGE - Dogecoin", { type: "crypto" }), type: "crypto" },
    { value: "SOL", label: lt("SOL - Solana", { type: "crypto" }), type: "crypto" },
    { value: "TRX", label: lt("TRX - TRON", { type: "crypto" }), type: "crypto" },
    { value: "DOT", label: lt("DOT - Polkadot", { type: "crypto" }), type: "crypto" },
    { value: "MATIC", label: lt("MATIC - Polygon", { type: "crypto" }), type: "crypto" },
    { value: "LTC", label: lt("LTC - Litecoin", { type: "crypto" }), type: "crypto" },
    { value: "SHIB", label: lt("SHIB - Shiba Inu", { type: "crypto" }), type: "crypto" },
    { value: "AVAX", label: lt("AVAX - Avalanche", { type: "crypto" }), type: "crypto" },
    { value: "DAI", label: lt("DAI - Dai", { type: "crypto" }), type: "crypto" },
    { value: "LINK", label: lt("LINK - Chainlink", { type: "crypto" }), type: "crypto" },
    { value: "ATOM", label: lt("ATOM - Cosmos", { type: "crypto" }), type: "crypto" },
    { value: "UNI", label: lt("UNI - Uniswap", { type: "crypto" }), type: "crypto" },
  ]

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
            : lt(placeholder)}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder={lt('Search currency...')} />
          <CommandList>
            <CommandEmpty>{lt('No currency found.')}</CommandEmpty>
            <CommandGroup heading={lt('Fiat Currencies')}>
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
            <CommandGroup heading={lt('Cryptocurrencies')}>
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
