"use client"

import { Moon, Sun, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDarkMode } from "@/lib/dark-mode-context"

export function DarkModeToggle() {
  const { theme, toggleTheme } = useDarkMode()

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <Moon className="h-4 w-4" />
      case 'dark':
        return <Building2 className="h-4 w-4" />
      case 'blue':
        return <Sun className="h-4 w-4" />
      default:
        return <Moon className="h-4 w-4" />
    }
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className="h-8 w-8"
    >
      {getIcon()}
    </Button>
  )
}
