"use client"

import { WorkspaceIdentitySection } from "./WorkspaceIdentitySection"

interface GeneralTabProps {
  themePreference: string
  onThemeChange: (value: string) => void
  workspaceName: string
  onWorkspaceNameChange: (value: string) => void
  workspaceTagline: string
  onWorkspaceTaglineChange: (value: string) => void
  landingView: string
  onLandingViewChange: (value: string) => void
}

export function GeneralTab({
}: GeneralTabProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <WorkspaceIdentitySection />
    </div>
  )
}
