"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { GitBranch } from "lucide-react"
import { CodeBlock } from "@/app/welcome/components/code-block"

export function GitTab(): React.ReactElement {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasToken, setHasToken] = useState(false)
  const [githubToken, setGithubToken] = useState("")
  const [githubRepoOwner, setGithubRepoOwner] = useState("")
  const [githubRepoName, setGithubRepoName] = useState("")
  const [clearTokenOnSave, setClearTokenOnSave] = useState(false)
  const [tokenDirty, setTokenDirty] = useState(false)

  const TOKEN_MASK = "••••••••••••••"

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/github")
      if (res.ok) {
        const data = await res.json()
        setHasToken(!!data.hasToken)
        setGithubRepoOwner(data.repoOwner ?? "")
        setGithubRepoName(data.repoName ?? "")
      }
    } catch (err) {
      console.error("Failed to load GitHub config:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  function handleClear(): void {
    setGithubToken("")
    setGithubRepoOwner("")
    setGithubRepoName("")
    setClearTokenOnSave(true)
    setTokenDirty(true)
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubToken,
          githubRepoOwner,
          githubRepoName,
          clearToken: clearTokenOnSave,
        }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || "Failed to save")
      }

      // Clear the token field after successful save so it isn't retained in memory
      setGithubToken("")
      // If a new token was submitted, mark as set
      if (githubToken.trim() !== "") {
        setHasToken(true)
      } else if (clearTokenOnSave) {
        setHasToken(false)
      }
      setClearTokenOnSave(false)
      setTokenDirty(false)

      toast({
        title: "GitHub Sync saved",
        description: "Settings have been written to .env.local.",
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save GitHub settings"
      toast({ variant: "destructive", title: "Save failed", description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Create Your Private Repository instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Create Your Private Repository
          </CardTitle>
          <CardDescription>
            Set up your own private GitHub repository. Your code pushes here, while you can still pull updates from the official ARI repo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Authenticate */}
          <div className="rounded-xl border p-4 space-y-3">
            <p className="text-sm font-semibold">1. Authenticate with GitHub</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              If you haven&apos;t already, log in to GitHub via the CLI:
            </p>
            <CodeBlock language="bash" code="gh auth login" hideHeader />
          </div>

          {/* Step 2: Create private repo */}
          <div className="rounded-xl border p-4 space-y-3">
            <p className="text-sm font-semibold">2. Create your private repository</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              From your ARI project folder, run:
            </p>
            <CodeBlock
              language="bash"
              code="gh repo create my-ari --private --source=. --remote=origin --push"
              hideHeader
            />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Replace{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">my-ari</code>{" "}
              with whatever you&apos;d like to name your repo.
            </p>
          </div>

          {/* Step 3: Verify */}
          <div className="rounded-xl border p-4 space-y-3">
            <p className="text-sm font-semibold">3. Verify your setup</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Check that both remotes are configured:
            </p>
            <CodeBlock language="bash" code="git remote -v" hideHeader />
            <p className="text-sm text-muted-foreground leading-relaxed">
              You should see both remotes:
            </p>
            <CodeBlock
              language="text"
              code={`origin    https://github.com/you/my-ari.git (fetch)
origin    https://github.com/you/my-ari.git (push)
upstream  https://github.com/ARIsoftware/ARI.git (fetch)
upstream  https://github.com/ARIsoftware/ARI.git (push)`}
              hideHeader
            />
            <ul className="space-y-1.5 text-sm text-muted-foreground leading-relaxed pt-1">
              <li>
                <strong className="text-foreground">origin</strong> = your private repo (your changes go here)
              </li>
              <li>
                <strong className="text-foreground">upstream</strong> = official ARI repo (pull updates from here with{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/ari-update</code>)
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Enable GitHub Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Enable GitHub Sync <span className="text-sm font-normal text-muted-foreground">(optional)</span>
          </CardTitle>
          <CardDescription>
            When you install new modules from the Module Library, ARI can automatically commit them to your repo so they persist across rebuilds. To enable this, create a Personal Access Token and paste it below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* How to create the token */}
          <div className="rounded-xl border p-4 space-y-3">
            <p className="text-sm font-semibold">How to create the token:</p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground leading-relaxed">
              <li>
                Go to{" "}
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  github.com/settings/tokens
                </a>{" "}
                and click <strong className="text-foreground">Generate new token</strong>
              </li>
              <li>
                Set <strong className="text-foreground">Token name</strong> to something like{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">ARI Module Sync</code>
              </li>
              <li>
                Set <strong className="text-foreground">Expiration</strong> to your preference (or no expiration)
              </li>
              <li>
                Under <strong className="text-foreground">Repository access</strong>, select{" "}
                <strong className="text-foreground">Only select repositories</strong> and choose your ARI repo
              </li>
              <li>
                Click <strong className="text-foreground">Repository permissions</strong>, find{" "}
                <strong className="text-foreground">Contents</strong>, and set it to{" "}
                <strong className="text-foreground">Read and write</strong>
              </li>
              <li>
                Click <strong className="text-foreground">Generate token</strong> and copy it
              </li>
            </ol>
          </div>

          {/* Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="githubToken" className="text-sm font-medium">
                Personal Access Token
              </Label>
              <Input
                id="githubToken"
                type={hasToken && !tokenDirty ? "text" : "password"}
                value={hasToken && !tokenDirty ? TOKEN_MASK : githubToken}
                onChange={(e) => {
                  // First edit while showing the mask: discard the mask entirely
                  // and start from whatever the user actually typed/kept.
                  let next = e.target.value
                  if (hasToken && !tokenDirty) {
                    next = next.replace(/•/g, "")
                  }
                  setTokenDirty(true)
                  setGithubToken(next)
                  if (next !== "") setClearTokenOnSave(false)
                }}
                placeholder={hasToken ? "" : "github_pat_xxxxxxxxxxxx"}
                className="font-mono text-sm"
                disabled={loading}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="githubRepoOwner" className="text-sm font-medium">
                Repository Owner
              </Label>
              <Input
                id="githubRepoOwner"
                value={githubRepoOwner}
                onChange={(e) => setGithubRepoOwner(e.target.value)}
                placeholder="your-github-username"
                className="font-mono text-sm"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="githubRepoName" className="text-sm font-medium">
                Repository Name
              </Label>
              <Input
                id="githubRepoName"
                value={githubRepoName}
                onChange={(e) => setGithubRepoName(e.target.value)}
                placeholder="my-ari"
                className="font-mono text-sm"
                disabled={loading}
              />
            </div>

            <p className="text-sm text-red-600">
              Values entered here will be saved to your <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.env.local</code> file.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={saving || loading}
            >
              Clear
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
