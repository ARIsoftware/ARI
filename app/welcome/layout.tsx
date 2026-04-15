import type { Metadata } from "next"
import { Montserrat } from 'next/font/google'
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { checkUsersExist } from "@/lib/auth-helpers"

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
})

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

async function checkWelcomeAccess(): Promise<"allow" | "redirect-signin" | "db-error"> {
  const check = await checkUsersExist()

  if (check.status === "db-error") return "db-error"
  if (check.status !== "has-users") return "allow"

  // Users exist → require authentication
  const session = await auth.api.getSession({ headers: await headers() })
  return session ? "allow" : "redirect-signin"
}

export default async function WelcomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const access = await checkWelcomeAccess()

  if (access === "redirect-signin") {
    redirect("/sign-in")
  }

  return (
    <div style={lightThemeStyles} className={`light ${montserrat.className}`}>
      {access === "db-error" && (
        <div className="mx-auto max-w-2xl mt-6 px-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">Unable to reach the database</p>
            <p>
              Check that your database is running and your connection settings
              are correct. You can update your configuration below.
            </p>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
