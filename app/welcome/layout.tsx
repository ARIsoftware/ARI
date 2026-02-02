import type { Metadata } from "next"
import { Geist } from 'next/font/google'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: "Welcome",
}

// Light theme CSS variable values (from lib/theme/presets.ts "light" theme)
const lightThemeStyles = {
  '--background': '210 40% 99%',
  '--foreground': '222 47% 11%',
  '--card': '0 0% 100%',
  '--card-foreground': '222 47% 11%',
  '--popover': '0 0% 100%',
  '--popover-foreground': '222 47% 11%',
  '--primary': '222 70% 45%',
  '--primary-foreground': '0 0% 100%',
  '--secondary': '210 40% 96%',
  '--secondary-foreground': '222 47% 11%',
  '--muted': '210 40% 96%',
  '--muted-foreground': '215 16% 47%',
  '--accent': '222 70% 45%',
  '--accent-foreground': '0 0% 100%',
  '--destructive': '0 84.2% 60.2%',
  '--destructive-foreground': '0 0% 98%',
  '--border': '214 32% 91%',
  '--input': '214 32% 91%',
  '--ring': '222 70% 45%',
  '--radius': '0.375rem',
} as React.CSSProperties

export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={lightThemeStyles} className={`light ${geist.className}`}>
      {children}
    </div>
  )
}
