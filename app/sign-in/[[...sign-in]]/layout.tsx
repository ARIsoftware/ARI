import { redirect } from "next/navigation"
import { checkUsersExist } from "@/lib/auth-helpers"

export default async function SignInLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const check = await checkUsersExist()

  if (check.status === "has-users" || check.status === "db-error") {
    return <>{children}</>
  }

  // No users yet. If the welcome wizard has set admin credentials,
  // let the sign-in page render so bootstrap can create the account.
  // Otherwise, redirect to /welcome.
  const hasAdminCreds = !!process.env.ARI_FIRST_RUN_ADMIN_EMAIL
    && !!process.env.ARI_FIRST_RUN_ADMIN_PASSWORD
  if (!hasAdminCreds) {
    redirect("/welcome")
  }

  return <>{children}</>
}
