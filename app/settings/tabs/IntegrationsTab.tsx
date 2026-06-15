"use client"

import { Plug } from "lucide-react"
import { AI_PROVIDERS } from "@/lib/ai-providers"
import {
  ApiKeyProvidersSection,
  type ProviderConfig,
} from "./ApiKeyProvidersSection"

const providers: ProviderConfig[] = AI_PROVIDERS.map((p) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  envKey: p.primaryEnvKey,
  placeholder: p.primaryPlaceholder,
  keyIsPlaintext: p.keyIsPlaintext,
  modelField: { envKey: p.modelEnvKey, placeholder: p.modelPlaceholder },
}))

const envSnippet = AI_PROVIDERS
  .flatMap((p) => [`${p.primaryEnvKey}=`, `${p.modelEnvKey}=`])
  .join("\n")

export function IntegrationsTab(): React.ReactElement {
  return (
    <ApiKeyProvidersSection
      title="AI Providers"
      icon={<Plug className="h-5 w-5 text-indigo-500" />}
      providers={providers}
      envSnippet={envSnippet}
    />
  )
}
