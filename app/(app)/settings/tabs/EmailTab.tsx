"use client"

import { Mail } from "lucide-react"
import {
  ApiKeyProvidersSection,
  type ProviderConfig,
} from "./ApiKeyProvidersSection"

const providers: ProviderConfig[] = [
  {
    id: "resend",
    name: "Resend",
    description: "Transactional email API for notifications.",
    envKey: "RESEND_API_KEY",
    placeholder: "",
    extraFields: [
      {
        envKey: "RESEND_WEBHOOK_SECRET",
        placeholder: "",
        label: "Webhook Secret",
        optional: true,
      },
    ],
  },
]

const envSnippet = `RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=`

export function EmailTab(): React.ReactElement {
  return (
    <ApiKeyProvidersSection
      title="Email"
      icon={<Mail className="h-5 w-5 text-indigo-500" />}
      providers={providers}
      envSnippet={envSnippet}
    />
  )
}
