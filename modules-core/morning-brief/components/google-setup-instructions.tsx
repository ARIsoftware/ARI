'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Copy, ExternalLink } from 'lucide-react'

/**
 * Step-by-step guide for creating the Google OAuth credentials this module needs.
 * Shown inside the Morning Brief settings panel.
 */
export function GoogleSetupInstructions() {
  const [redirectUri, setRedirectUri] = useState('https://your-ari-domain.com/api/modules/morning-brief/google/callback')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    // The redirect URI must match what's registered on the Google OAuth client.
    setRedirectUri(`${window.location.origin}/api/modules/morning-brief/google/callback`)
  }, [])

  const copy = (value: string, key: string) => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const CopyField = ({ value, label }: { value: string; label: string }) => (
    <div className="mt-1 flex items-center gap-2">
      <code className="flex-1 overflow-x-auto rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-foreground">
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 flex-shrink-0 px-2"
        onClick={() => copy(value, label)}
        aria-label={copied === label ? 'Copied' : 'Copy to clipboard'}
      >
        {copied === label ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  )

  return (
    <div className="space-y-4 text-sm">
      <ol className="list-decimal space-y-3 pl-5 text-muted-foreground marker:font-medium marker:text-foreground">
        <li>
          Open the{' '}
          <a
            href="https://console.cloud.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"
          >
            Google Cloud Console <ExternalLink className="h-3 w-3" />
          </a>{' '}
          and create a project (or pick an existing one).
        </li>
        <li>
          In <span className="text-foreground">APIs &amp; Services → Library</span>, search for{' '}
          <span className="text-foreground">&ldquo;Google Calendar API&rdquo;</span> and click{' '}
          <span className="text-foreground">Enable</span>.
        </li>
        <li>
          Configure the <span className="text-foreground">OAuth consent screen</span>: choose{' '}
          <span className="text-foreground">External</span>, add an app name and your email, and add your own
          Google account under <span className="text-foreground">Test users</span>. Leave the app in{' '}
          <span className="text-foreground">Testing</span> — that&apos;s all you need for personal use.
        </li>
        <li>
          When asked for <span className="text-foreground">scopes</span>, add only this one:
          <CopyField value="https://www.googleapis.com/auth/calendar.readonly" label="scope" />
          <span className="mt-1 block text-xs">
            It shows up under <span className="text-foreground">&ldquo;sensitive scopes&rdquo;</span> — that&apos;s
            expected. Read-only is all Morning Brief needs; don&apos;t add the read/write{' '}
            <code className="rounded bg-muted px-1 py-0.5">calendar</code> scope.
          </span>
        </li>
        <li>
          Go to <span className="text-foreground">APIs &amp; Services → Credentials → Create credentials → OAuth
          client ID</span>. If a wizard asks{' '}
          <span className="text-foreground">&ldquo;What data will you be accessing?&rdquo;</span>, pick{' '}
          <span className="text-foreground">User data</span> (this creates an OAuth client —{' '}
          <span className="text-foreground">not</span> &ldquo;Application data&rdquo;, which makes a service
          account that won&apos;t work).
        </li>
        <li>
          Set <span className="text-foreground">Application type</span> to{' '}
          <span className="text-foreground">Web application</span>. Leave{' '}
          <span className="text-foreground">Authorized JavaScript origins</span> empty, and under{' '}
          <span className="text-foreground">Authorized redirect URIs</span> add exactly this URL (no trailing
          slash):
          <CopyField value={redirectUri} label="redirect" />
        </li>
        <li>
          Click <span className="text-foreground">Create</span> and copy the{' '}
          <span className="text-foreground">Client ID</span> and{' '}
          <span className="text-foreground">Client Secret</span>.
        </li>
        <li>
          Add them to your <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code> and restart ARI:
          <CopyField value="MORNING_BRIEF_GOOGLE_CLIENT_ID=your-client-id" label="env-id" />
          <CopyField value="MORNING_BRIEF_GOOGLE_CLIENT_SECRET=your-client-secret" label="env-secret" />
        </li>
        <li>
          Back on this page, click{' '}
          <span className="text-foreground">Connect Google Calendar</span> and approve the read-only access.
        </li>
      </ol>
      <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Tip: if your ARI URL differs from the one shown above (for example in production), set{' '}
        <code className="rounded bg-muted px-1 py-0.5">MORNING_BRIEF_GOOGLE_REDIRECT_URI</code> to the exact
        callback URL you registered, and use that same value as the redirect URI in the Google Console.
      </p>
    </div>
  )
}
