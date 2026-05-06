import type { Metadata } from "next"
import { LightLayoutShell } from "@/lib/theme/light-layout"

export const metadata: Metadata = {
  title: "Setup error",
}

export default function SetupErrorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <LightLayoutShell>{children}</LightLayoutShell>
}
