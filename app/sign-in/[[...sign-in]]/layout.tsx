// Passthrough on purpose: the sign-in page must never server-redirect, since
// pairing this layout with /welcome's redirect can produce a loop. First-run
// "no users" handling lives in components/auth/auth-form.tsx (client-side
// bootstrap → /welcome on no_users).
export default function SignInLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
