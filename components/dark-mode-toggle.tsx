"use client"

import { Moon, Sun, Building2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDarkMode } from "@/lib/dark-mode-context"

export function DarkModeToggle() {
  const { theme, toggleTheme } = useDarkMode()

  const getIcon = () => {
    switch (theme) {
      case 'pastel':
        return <Moon className="h-4 w-4" />
      case 'dark':
        return <Building2 className="h-4 w-4" />
      case 'blueprint':
        return <Sparkles className="h-4 w-4" />
      case 'light':
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
