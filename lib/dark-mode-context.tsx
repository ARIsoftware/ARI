"use client"

import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'blue'

type DarkModeContext = {
  theme: Theme
  isDarkMode: boolean // Keep for backward compatibility
  toggleTheme: () => void
  toggleDarkMode: () => void // Keep for backward compatibility
}

const Context = createContext<DarkModeContext | undefined>(undefined)

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    // Load theme preference from localStorage
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored && ['light', 'dark', 'blue'].includes(stored)) {
      setTheme(stored)
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
    document.documentElement.classList.remove('dark', 'blue')

    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (theme === 'blue') {
      document.documentElement.classList.add('blue')
    }

    // Save preference
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'dark'
      if (prev === 'dark') return 'blue'
      return 'light'
    })
  }

  // Backward compatibility
  const toggleDarkMode = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
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
