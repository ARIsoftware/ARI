import { DM_Sans } from "next/font/google"
import NorthstarClient from "@/components/northstar-client"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { getRandomQuote } from "@/lib/quotes-server"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export default async function NorthstarPage() {
  // Fetch quote server-side
  const { user } = await getAuthenticatedUser()
  const quote = user ? await getRandomQuote(user.id) : null

  return <NorthstarClient initialQuote={quote} />
}
