import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { checkUsersExist } from "@/lib/auth-helpers"
import { LightLayoutShell } from "@/lib/theme/light-layout"

export const metadata: Metadata = {
  title: "Welcome",
}

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
    <LightLayoutShell>
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
    </LightLayoutShell>
  )
}
