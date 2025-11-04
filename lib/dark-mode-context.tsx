"use client"

import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'pastel' | 'dark' | 'blueprint' | 'light'

type DarkModeContext = {
  theme: Theme
  isDarkMode: boolean // Keep for backward compatibility
  toggleTheme: () => void
  toggleDarkMode: () => void // Keep for backward compatibility
}

const Context = createContext<DarkModeContext | undefined>(undefined)

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('pastel')

  useEffect(() => {
    // Load theme preference from localStorage
    const stored = localStorage.getItem('theme') as string | null

    // Migrate old theme names to new names
    let migratedTheme: Theme | null = null
    if (stored === 'light') migratedTheme = 'pastel'
    else if (stored === 'clean') migratedTheme = 'light'
    else if (stored === 'blue') migratedTheme = 'blueprint'
    else if (stored === 'dark') migratedTheme = 'dark'
    else if (['pastel', 'dark', 'blueprint', 'light'].includes(stored || '')) {
      migratedTheme = stored as Theme
    }

    if (migratedTheme) {
      setTheme(migratedTheme)
    } else {
      // Migrate old darkMode setting
      const oldDarkMode = localStorage.getItem('darkMode')
      if (oldDarkMode === 'true') {
        setTheme('dark')
      }
    }
  }, [])

  useEffect(() => {
    // Apply theme class to document
    document.documentElement.classList.remove('dark', 'blueprint', 'light')

    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (theme === 'blueprint') {
      document.documentElement.classList.add('blueprint')
    } else if (theme === 'light') {
      document.documentElement.classList.add('light')
    }

    // Save preference
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'pastel') return 'dark'
      if (prev === 'dark') return 'blueprint'
      if (prev === 'blueprint') return 'light'
      return 'pastel'
    })
  }

  // Backward compatibility
  const toggleDarkMode = () => {
    setTheme(prev => prev === 'dark' ? 'pastel' : 'dark')
  }

  return (
    <Context.Provider value={{
      theme,
      isDarkMode: theme === 'dark',
      toggleTheme,
      toggleDarkMode
    }}>
      {children}
    </Context.Provider>
  )
}

export const useDarkMode = () => {
  const context = useContext(Context)
  if (context === undefined) {
    throw new Error('useDarkMode must be used inside DarkModeProvider')
  }
  return context
}
