import { redirect } from "next/navigation"
import { checkUsersExist } from "@/lib/auth-helpers"

export default async function SignInLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const check = await checkUsersExist()

  if (check.status !== "has-users" && check.status !== "db-error") {
    redirect("/welcome")
  }

  return <>{children}</>
}
