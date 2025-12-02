'use client'

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Settings2 } from "lucide-react"

interface DashboardCustomizerProps {
  visibleCards: Record<string, boolean>
  onToggle: (key: string, value: boolean) => void
}

export function DashboardCustomizer({ visibleCards, onToggle }: DashboardCustomizerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto">
          <Settings2 className="mr-2 h-4 w-4" />
          Customize View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Visible Metrics</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(visibleCards).map(([key, isVisible]) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={isVisible}
            onCheckedChange={(checked) => onToggle(key, checked)}
          >
            {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
