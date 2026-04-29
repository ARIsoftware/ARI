import { redirect } from "next/navigation"
import { checkUsersExist } from "@/lib/auth-helpers"

export default async function SignInLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const check = await checkUsersExist()

  // Only redirect when env vars aren't configured yet.
  // "no-users" and "no-table" mean setup is done but bootstrap hasn't
  // created the admin account yet — the sign-in page handles that.
  if (check.status === "no-env" || check.status === "no-pool") {
    redirect("/welcome")
  }

  return <>{children}</>
}
