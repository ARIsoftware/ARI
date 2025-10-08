"use client"

import { createContext, useContext, useEffect, useState } from 'react'

type DarkModeContext = {
  isDarkMode: boolean
  toggleDarkMode: () => void
}

const Context = createContext<DarkModeContext | undefined>(undefined)

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    // Load dark mode preference from localStorage
    const stored = localStorage.getItem('darkMode')
    if (stored === 'true') {
      setIsDarkMode(true)
    }
  }, [])

  useEffect(() => {
    // Apply dark mode class to document
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    // Save preference
    localStorage.setItem('darkMode', String(isDarkMode))
  }, [isDarkMode])

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev)
  }

  return (
    <Context.Provider value={{ isDarkMode, toggleDarkMode }}>
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
