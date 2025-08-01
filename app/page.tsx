import { redirect } from "next/navigation"

export default function Page() {
  // Redirect to dashboard as the default page
  redirect("/dashboard")
}
