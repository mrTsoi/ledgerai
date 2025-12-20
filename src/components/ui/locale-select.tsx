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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type LocaleOption = {
  value: string
  label: string
}

// NOTE: This list is intentionally broad for accounting/formatting purposes.
// It is not limited to the app's UI translation locales.
const BASE_LOCALE_OPTIONS: readonly LocaleOption[] = [
  // English
  { value: "en", label: "English" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-CA", label: "English (Canada)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "en-NZ", label: "English (New Zealand)" },
  { value: "en-IE", label: "English (Ireland)" },
  { value: "en-SG", label: "English (Singapore)" },
  { value: "en-IN", label: "English (India)" },
  { value: "en-ZA", label: "English (South Africa)" },

  // Chinese
  { value: "zh", label: "Chinese" },
  { value: "zh-CN", label: "Chinese (Simplified, China)" },
  { value: "zh-SG", label: "Chinese (Simplified, Singapore)" },
  { value: "zh-HK", label: "Chinese (Traditional, Hong Kong)" },
  { value: "zh-TW", label: "Chinese (Traditional, Taiwan)" },

  // Japanese / Korean
  { value: "ja-JP", label: "Japanese (Japan)" },
  { value: "ko-KR", label: "Korean (South Korea)" },

  // Major European
  { value: "fr-FR", label: "French (France)" },
  { value: "fr-CA", label: "French (Canada)" },
  { value: "fr-BE", label: "French (Belgium)" },
  { value: "fr-CH", label: "French (Switzerland)" },
  { value: "de-DE", label: "German (Germany)" },
  { value: "de-AT", label: "German (Austria)" },
  { value: "de-CH", label: "German (Switzerland)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "es-MX", label: "Spanish (Mexico)" },
  { value: "es-AR", label: "Spanish (Argentina)" },
  { value: "es-CL", label: "Spanish (Chile)" },
  { value: "es-CO", label: "Spanish (Colombia)" },
  { value: "es-PE", label: "Spanish (Peru)" },
  { value: "it-IT", label: "Italian (Italy)" },
  { value: "it-CH", label: "Italian (Switzerland)" },
  { value: "pt-PT", label: "Portuguese (Portugal)" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "nl-NL", label: "Dutch (Netherlands)" },
  { value: "nl-BE", label: "Dutch (Belgium)" },
  { value: "sv-SE", label: "Swedish (Sweden)" },
    { value: "nb-NO", label: "Norwegian Bokmål (Norway)" },
  { value: "da-DK", label: "Danish (Denmark)" },
  { value: "fi-FI", label: "Finnish (Finland)" },
  { value: "pl-PL", label: "Polish (Poland)" },
  { value: "cs-CZ", label: "Czech (Czechia)" },
  { value: "sk-SK", label: "Slovak (Slovakia)" },
  { value: "hu-HU", label: "Hungarian (Hungary)" },
  { value: "ro-RO", label: "Romanian (Romania)" },
  { value: "bg-BG", label: "Bulgarian (Bulgaria)" },
  { value: "el-GR", label: "Greek (Greece)" },
  { value: "uk-UA", label: "Ukrainian (Ukraine)" },
  { value: "ru-RU", label: "Russian (Russia)" },
  { value: "tr-TR", label: "Turkish (Turkey)" },

  // Balkans / Baltics
  { value: "hr-HR", label: "Croatian (Croatia)" },
  { value: "sr-RS", label: "Serbian (Serbia)" },
  { value: "sl-SI", label: "Slovenian (Slovenia)" },
  { value: "et-EE", label: "Estonian (Estonia)" },
  { value: "lv-LV", label: "Latvian (Latvia)" },
  { value: "lt-LT", label: "Lithuanian (Lithuania)" },

  // Middle East
  { value: "ar", label: "Arabic" },
  { value: "ar-SA", label: "Arabic (Saudi Arabia)" },
  { value: "ar-AE", label: "Arabic (United Arab Emirates)" },
  { value: "ar-EG", label: "Arabic (Egypt)" },
  { value: "he-IL", label: "Hebrew (Israel)" },
  { value: "fa-IR", label: "Persian (Iran)" },

  // South Asia
  { value: "hi-IN", label: "Hindi (India)" },
  { value: "bn-BD", label: "Bengali (Bangladesh)" },
  { value: "bn-IN", label: "Bengali (India)" },
  { value: "ta-IN", label: "Tamil (India)" },
  { value: "ta-LK", label: "Tamil (Sri Lanka)" },
  { value: "te-IN", label: "Telugu (India)" },
  { value: "mr-IN", label: "Marathi (India)" },
  { value: "gu-IN", label: "Gujarati (India)" },
  { value: "kn-IN", label: "Kannada (India)" },
  { value: "ml-IN", label: "Malayalam (India)" },
  { value: "pa-IN", label: "Punjabi (India)" },
  { value: "ur-PK", label: "Urdu (Pakistan)" },
  { value: "ne-NP", label: "Nepali (Nepal)" },
  { value: "si-LK", label: "Sinhala (Sri Lanka)" },

  // Southeast Asia
  { value: "th-TH", label: "Thai (Thailand)" },
  { value: "vi-VN", label: "Vietnamese (Vietnam)" },
  { value: "id-ID", label: "Indonesian (Indonesia)" },
  { value: "ms-MY", label: "Malay (Malaysia)" },
  { value: "fil-PH", label: "Filipino (Philippines)" },

  // Africa
  { value: "sw-KE", label: "Swahili (Kenya)" },
  { value: "sw-TZ", label: "Swahili (Tanzania)" },
  { value: "am-ET", label: "Amharic (Ethiopia)" },
  { value: "af-ZA", label: "Afrikaans (South Africa)" },

  // Americas
  { value: "es-US", label: "Spanish (United States)" },
  { value: "fr-HT", label: "French (Haiti)" },
]

function buildLocaleOptions(): LocaleOption[] {
  const options: LocaleOption[] = [...BASE_LOCALE_OPTIONS]

  // Add a full region list as `en-XX` so users can pick formatting by region
  // even if their preferred language isn't in the curated list.
  try {
    const supportedValuesOf = (Intl as any)?.supportedValuesOf as
      | undefined
      | ((key: string) => string[])

    if (supportedValuesOf) {
      const regionCodes = supportedValuesOf("region")
      const regionNames =
        typeof (Intl as any).DisplayNames === "function"
          ? new (Intl as any).DisplayNames(["en"], { type: "region" })
          : null

      for (const region of regionCodes) {
        const regionLabel = regionNames?.of?.(region) || region
        options.push({ value: `en-${region}`, label: `English (${regionLabel})` })
      }
    }
  } catch {
    // Best-effort only; fall back to curated list.
  }

  // De-dupe by value (curated list wins for nicer labels).
  const seen = new Set<string>()
  return options.filter((o) => {
    if (seen.has(o.value)) return false
    seen.add(o.value)
    return true
  })
}

interface LocaleSelectProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function LocaleSelect({
  value,
  onChange,
  placeholder = "Select locale...",
  className,
  disabled = false,
}: LocaleSelectProps) {
  const [open, setOpen] = React.useState(false)
  const lt = useLiterals()
  const options = React.useMemo(() => buildLocaleOptions(), [])

  const selectedLabel = React.useMemo(() => {
    const found = options.find((o) => o.value === value)
    return found ? `${found.label} — ${found.value}` : value
  }, [options, value])

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
          {value ? selectedLabel : lt(placeholder)}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={lt("Search locale/region...")} />
          <CommandList>
            <CommandEmpty>{lt("No locale found.")}</CommandEmpty>
            <CommandGroup heading={lt("Locales")}>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.value}`}
                  onSelect={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className="cursor-pointer data-[disabled]:opacity-100 data-[disabled]:pointer-events-auto"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opt.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {opt.label}
                  <span className="ml-2 text-xs text-muted-foreground">{opt.value}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
