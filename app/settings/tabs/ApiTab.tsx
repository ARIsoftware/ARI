"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
  Lock,
  Globe,
  AlertTriangle,
} from "lucide-react"
import type { ApiKey, ApiKeyUsageLog, ApiKeyCreateResponse } from "../types"

interface EndpointData {
  coreEndpoints: Array<{ path: string; fullPath: string; methods: string[] }>
  moduleEndpoints: Array<{ path: string; fullPath: string; moduleId: string; methods: string[] }>
  publicEndpoints: Array<{
    path: string; fullPath: string; moduleId: string; methods: string[]
    securityType?: string; hasRateLimit?: boolean; description?: string
  }>
  summary: { totalCore: number; totalModule: number; totalPublic: number }
}

export function ApiTab(): React.ReactElement {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState("")
  const [expiry, setExpiry] = useState("never")
  const [showKeyDialog, setShowKeyDialog] = useState(false)
  const [newRawKey, setNewRawKey] = useState("")
  const [copied, setCopied] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, ApiKeyUsageLog[]>>({})
  const [logsLoading, setLogsLoading] = useState<string | null>(null)
  const [endpointsData, setEndpointsData] = useState<EndpointData | null>(null)
  const [endpointsLoading, setEndpointsLoading] = useState(false)

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/api-keys")
      if (res.ok) {
        const data = await res.json()
        setKeys(data)
      }
    } catch (err) {
      console.error("Failed to fetch API keys:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchEndpoints = useCallback(async () => {
    setEndpointsLoading(true)
    try {
      const res = await fetch("/api/debug/endpoints")
      if (res.ok) {
        setEndpointsData(await res.json())
      }
    } catch (err) {
      console.error("Failed to fetch endpoints:", err)
    } finally {
      setEndpointsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKeys()
    fetchEndpoints()
  }, [fetchKeys, fetchEndpoints])

  async function fetchLogs(keyId: string) {
    setLogsLoading(keyId)
    try {
      const res = await fetch(`/api/api-keys/${keyId}/logs?limit=20`)
      if (res.ok) {
        const data = await res.json()
        setLogs(prev => ({ ...prev, [keyId]: data }))
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err)
    } finally {
      setLogsLoading(null)
    }
  }

  function toggleExpand(keyId: string) {
    if (expandedKey === keyId) {
      setExpandedKey(null)
    } else {
      setExpandedKey(keyId)
      if (!logs[keyId]) {
        fetchLogs(keyId)
      }
    }
  }

  async function handleCreate() {
    if (!label.trim()) return
    setCreating(true)

    let expiresAt: string | null = null
    if (expiry !== "never") {
      const days = parseInt(expiry, 10)
      const d = new Date()
      d.setDate(d.getDate() + days)
      expiresAt = d.toISOString()
    }

    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), expiresAt }),
      })

      if (res.ok) {
        const data: ApiKeyCreateResponse = await res.json()
        setNewRawKey(data.raw_key)
        setShowKeyDialog(true)
        setLabel("")
        setExpiry("never")
        await fetchKeys()
      }
    } catch (err) {
      console.error("Failed to create API key:", err)
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(keyId: string) {
    try {
      await fetch(`/api/api-keys/${keyId}`, { method: "DELETE" })
      await fetchKeys()
    } catch (err) {
      console.error("Failed to revoke API key:", err)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Never"
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  function formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }


  return (
    <div className="space-y-6">
      {/* Section 1: API Keys Management */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys
              </CardTitle>
              <CardDescription className="mt-1">
                Generate API keys to let external applications securely access your data.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-end gap-3 pt-2">
            <div className="flex-1">
              <Label htmlFor="key-label" className="text-xs text-muted-foreground">Label</Label>
              <Input
                id="key-label"
                placeholder="e.g. Todoist Integration"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="w-[140px]">
              <Label className="text-xs text-muted-foreground">Expires</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={creating || !label.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              {creating ? "Generating..." : "Generate Key"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading keys...</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet. Generate one above to get started.</p>
          ) : (
            <div className="space-y-2">
              {keys.map((key) => (
                <div key={key.id} className="rounded-lg border">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleExpand(key.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{key.label}</span>
                          <code className="text-xs text-muted-foreground">{key.key_prefix}...</code>
                          {isExpired(key.expires_at) && (
                            <Badge variant="destructive" className="text-xs">Expired</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-0.5">
                          <span>Created {formatDate(key.created_at)}</span>
                          <span>Last used {formatDate(key.last_used_at)}</span>
                          <span>{key.request_count} requests</span>
                          {key.expires_at && !isExpired(key.expires_at) && (
                            <span>Expires {formatDate(key.expires_at)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete &quot;{key.label}&quot;. Any applications using this key will lose access. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRevoke(key.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      {expandedKey === key.id ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded logs */}
                  {expandedKey === key.id && (
                    <div className="border-t px-3 py-3 bg-muted/20">
                      <p className="text-xs font-medium text-muted-foreground mb-3">Last 20 Requests</p>
                      {logsLoading === key.id ? (
                        <p className="text-xs text-muted-foreground">Loading logs...</p>
                      ) : !logs[key.id] || logs[key.id].length === 0 ? (
                        <p className="text-xs text-muted-foreground">No usage recorded yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="text-left py-1.5 pr-3 font-medium">Time</th>
                                <th className="text-left py-1.5 pr-3 font-medium">Method</th>
                                <th className="text-left py-1.5 pr-3 font-medium">Endpoint</th>
                                <th className="text-left py-1.5 pr-3 font-medium">Status</th>
                                <th className="text-left py-1.5 pr-3 font-medium">IP Address</th>
                                <th className="text-left py-1.5 font-medium">User Agent</th>
                              </tr>
                            </thead>
                            <tbody>
                              {logs[key.id].map((log) => (
                                <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30">
                                  <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                                  <td className="py-1.5 pr-3">
                                    <Badge variant="secondary" className="text-xs font-mono">{log.method}</Badge>
                                  </td>
                                  <td className="py-1.5 pr-3">
                                    <code className="text-xs">{log.endpoint}</code>
                                  </td>
                                  <td className="py-1.5 pr-3">
                                    <Badge
                                      variant={log.status_code < 400 ? "secondary" : "destructive"}
                                      className="text-xs"
                                    >
                                      {log.status_code}
                                    </Badge>
                                  </td>
                                  <td className="py-1.5 pr-3 text-muted-foreground">{log.ip_address || "-"}</td>
                                  <td className="py-1.5 text-muted-foreground max-w-[200px] truncate" title={log.user_agent || undefined}>
                                    {log.user_agent || "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </CardContent>
      </Card>

      {/* Section 2: Available API Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Available API Endpoints
          </CardTitle>
          <CardDescription>
            These are the endpoints you can call with your API key.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {endpointsLoading ? (
            <p className="text-sm text-muted-foreground">Loading endpoints...</p>
          ) : !endpointsData ? (
            <p className="text-sm text-muted-foreground">Failed to load endpoints.</p>
          ) : (
            <div className="space-y-6">
              {/* Module API Routes */}
              {endpointsData.moduleEndpoints.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-green-500" />
                    Module API Routes ({endpointsData.moduleEndpoints.length})
                  </p>
                  <div className="space-y-2">
                    {endpointsData.moduleEndpoints.map((endpoint, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/30 border border-green-500/20">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/50 text-xs">
                            {endpoint.moduleId}
                          </Badge>
                          <code className="text-xs font-mono">{endpoint.fullPath}</code>
                        </div>
                        <div className="flex items-center gap-1">
                          {endpoint.methods.map(method => (
                            <Badge key={method} variant="secondary" className="text-xs">{method}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Core API Routes */}
              {endpointsData.coreEndpoints.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-blue-500" />
                    Core API Routes ({endpointsData.coreEndpoints.length})
                  </p>
                  <div className="space-y-2">
                    {endpointsData.coreEndpoints.map((endpoint, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/30 border border-blue-500/20">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-blue-500/20 text-blue-500 border-blue-500/50 text-xs">
                            Core
                          </Badge>
                          <code className="text-xs font-mono">{endpoint.fullPath}</code>
                        </div>
                        <div className="flex items-center gap-1">
                          {endpoint.methods.map(method => (
                            <Badge key={method} variant="secondary" className="text-xs">{method}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key Created Dialog */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Copy your API key now. You won&apos;t be able to see it again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-muted p-3 rounded-lg font-mono break-all select-all">
                {newRawKey}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(newRawKey)}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-900 dark:text-amber-200">
                Store this key securely. It will not be shown again. If you lose it, you&apos;ll need to generate a new one.
              </p>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Use it in your requests:</p>
              <code className="block bg-muted p-2 rounded text-xs break-all">
                curl -H &quot;x-api-key: {newRawKey}&quot; http://localhost:3000/api/modules/tasks
              </code>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
