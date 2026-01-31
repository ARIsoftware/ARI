/**
 * Mail Stream Module - Main Page
 *
 * Displays a table of all Resend webhook events with filtering and search.
 * Route: /mailstream
 */

'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Mail,
  Users,
  Globe,
  Search,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Inbox,
} from 'lucide-react'
import {
  useMailStreamEvents,
  useMailStreamSettings,
  useUpdateMailStreamSettings,
  useDeleteMailStreamEvent,
} from '../hooks/use-mail-stream'
import type {
  MailStreamEvent,
  MailStreamFilters,
  EventCategory,
  EmailStatus,
} from '../types'
import {
  STATUS_COLORS,
  CATEGORY_COLORS,
  RETENTION_OPTIONS,
} from '../types'

/**
 * Format relative time (e.g., "5 minutes ago")
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  return date.toLocaleDateString()
}

/**
 * Category filter tabs
 */
const CATEGORY_TABS = [
  { value: 'all', label: 'All', icon: null },
  { value: 'email', label: 'Emails', icon: Mail },
  { value: 'contact', label: 'Contacts', icon: Users },
  { value: 'domain', label: 'Domains', icon: Globe },
] as const

/**
 * Status filter options
 */
const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'opened', label: 'Opened' },
  { value: 'clicked', label: 'Clicked' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'failed', label: 'Failed' },
] as const

/**
 * Expandable row component for showing event details
 */
function EventRow({
  event,
  onDelete,
  isDeleting,
}: {
  event: MailStreamEvent
  onDelete: (id: string) => void
  isDeleting: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)

  const statusLabel = event.status
    ? event.status.replace('_', ' ')
    : event.event_type.split('.')[1]

  const categoryColor = CATEGORY_COLORS[event.event_category as EventCategory]
  const statusColor = event.status
    ? STATUS_COLORS[event.status as EmailStatus]
    : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <TableCell className="p-2 w-10">
          <Button variant="ghost" size="sm" className="p-0 h-auto">
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
        <TableCell className="p-2">
          <Badge variant="outline" className={categoryColor}>
            {event.event_category}
          </Badge>
        </TableCell>
        <TableCell className="p-2">
          <Badge className={statusColor}>
            {statusLabel}
          </Badge>
        </TableCell>
        <TableCell className="p-2 max-w-[150px] truncate">
          {event.to_addresses?.join(', ') || '-'}
        </TableCell>
        <TableCell className="p-2 max-w-[200px] truncate">
          {event.subject || '-'}
        </TableCell>
        <TableCell className="p-2 max-w-[180px] text-muted-foreground truncate">
          {event.from_address || '-'}
        </TableCell>
        <TableCell className="p-2 text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(event.created_at)}
        </TableCell>
        <TableCell className="p-2 w-12">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(event.id)
            }}
            disabled={isDeleting}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={8} className="p-4">
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Event Type:</span>
                  <p className="font-mono">{event.event_type}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Email ID:</span>
                  <p className="font-mono text-xs">{event.email_id || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Resend Timestamp:</span>
                  <p>{new Date(event.resend_created_at).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Received:</span>
                  <p>{new Date(event.created_at).toLocaleString()}</p>
                </div>
              </div>

              {event.bounce_details && (
                <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                  <span className="text-sm font-medium text-red-800 dark:text-red-200">
                    Bounce Details:
                  </span>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    {(event.bounce_details as any).message}
                  </p>
                  {(event.bounce_details as any).type && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Type: {(event.bounce_details as any).type} / {(event.bounce_details as any).subType}
                    </p>
                  )}
                </div>
              )}

              {event.click_details && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Click Details:
                  </span>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1 break-all">
                    Link: {(event.click_details as any).link}
                  </p>
                </div>
              )}

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  View Raw Payload
                </summary>
                <pre className="mt-2 p-3 bg-muted rounded-lg overflow-auto max-h-64">
                  {JSON.stringify(event.raw_payload, null, 2)}
                </pre>
              </details>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export default function MailStreamPage() {
  const { toast } = useToast()

  // Settings and setup state
  const { data: settings, isLoading: settingsLoading } = useMailStreamSettings()
  const updateSettings = useUpdateMailStreamSettings()
  const [setupRetention, setSetupRetention] = useState<7 | 30 | 90 | 360 | -1>(-1)

  // Filter state
  const [filters, setFilters] = useState<MailStreamFilters>({
    category: 'all',
    status: 'all',
    search: '',
  })
  const [searchInput, setSearchInput] = useState('')

  // Data fetching
  const { data, isLoading, refetch, isRefetching } = useMailStreamEvents(filters)
  const deleteEvent = useDeleteMailStreamEvent()

  const events = data?.events || []
  const totalCount = data?.total || 0

  // Handle setup completion
  const handleCompleteSetup = () => {
    updateSettings.mutate(
      { retention_days: setupRetention, setup_complete: true },
      {
        onSuccess: () => {
          toast({
            title: 'Setup complete',
            description: 'Mail Stream is ready to receive webhook events.',
          })
        },
        onError: () => {
          toast({
            variant: 'destructive',
            title: 'Setup failed',
            description: 'Please try again.',
          })
        },
      }
    )
  }

  // Show loading while fetching settings
  if (settingsLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  // Show setup screen if not completed
  if (!settings?.setup_complete) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Inbox className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Welcome to Mail Stream</CardTitle>
            <CardDescription>
              Configure your webhook settings to start receiving email events from Resend.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Webhook Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Webhook Configuration</h3>
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <div className="p-3 bg-muted rounded-lg font-mono text-sm break-all">
                  https://YOUR-DOMAIN/api/modules/mail-stream/webhook
                </div>
                <p className="text-sm text-muted-foreground">
                  Add this URL in your Resend dashboard under Webhooks
                </p>
              </div>

              <div className="space-y-2">
                <Label>Environment Variable</Label>
                <div className="p-3 bg-muted rounded-lg font-mono text-sm">
                  RESEND_WEBHOOK_SECRET=whsec_your_secret_here
                </div>
                <p className="text-sm text-muted-foreground">
                  Copy the signing secret from Resend and add it to your local .env.local and/or Vercel environment variables.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Event Types</Label>
                <p className="text-sm text-muted-foreground">
                  Select &quot;All Events&quot; in Resend to capture all email, contact, and domain events.
                </p>
              </div>
            </div>

            {/* Data Retention */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-medium">Data Retention</h3>
              <div className="space-y-2">
                <Label htmlFor="setup-retention">Retention Period</Label>
                <Select
                  value={setupRetention.toString()}
                  onValueChange={(value) => setSetupRetention(parseInt(value) as 7 | 30 | 90 | 360 | -1)}
                >
                  <SelectTrigger id="setup-retention" className="w-[200px]">
                    <SelectValue placeholder="Select retention" />
                  </SelectTrigger>
                  <SelectContent>
                    {RETENTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {setupRetention === -1
                    ? 'Events will be kept forever. You can change this in settings later.'
                    : `Events older than ${setupRetention} days will be automatically deleted.`}
                </p>
              </div>
            </div>

            {/* Done Button */}
            <div className="pt-4">
              <Button
                onClick={handleCompleteSetup}
                disabled={updateSettings.isPending}
                className="w-full"
                size="lg"
              >
                {updateSettings.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Done'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setFilters((f) => ({ ...f, search: searchInput }))
  }

  // Handle delete
  const handleDelete = (id: string) => {
    deleteEvent.mutate(id, {
      onError: () => {
        toast({
          variant: 'destructive',
          title: 'Failed to delete event',
          description: 'Please try again.',
        })
      },
    })
  }

  return (
    <div className="p-6 space-y-6 overflow-hidden">
      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-background/50 flex items-center justify-center z-50">
          <div className="flex items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Loading events...</span>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-medium">Mail Stream</h1>
          <p className="text-muted-foreground mt-1">
            {totalCount} event{totalCount !== 1 ? 's' : ''} logged
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[300px]">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by recipient, subject, or sender..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {filters.search && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearchInput('')
                setFilters((f) => ({ ...f, search: '' }))
              }}
            >
              Clear
            </Button>
          )}
        </form>

        {/* Filters */}
        <div className="flex items-center gap-4">
          {/* Category filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">View:</span>
            <Select
              value={filters.category}
              onValueChange={(value) => setFilters((f) => ({ ...f, category: value as any }))}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_TABS.map((tab) => (
                  <SelectItem key={tab.value} value={tab.value}>
                    <div className="flex items-center gap-2">
                      {tab.icon && <tab.icon className="w-4 h-4" />}
                      {tab.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status filter (only show for email category) */}
          {(filters.category === 'all' || filters.category === 'email') && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters((f) => ({ ...f, status: value as any }))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_TABS.map((tab) => (
                    <SelectItem key={tab.value} value={tab.value}>
                      {tab.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Events Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 p-2"></TableHead>
              <TableHead className="p-2">Category</TableHead>
              <TableHead className="p-2">Status</TableHead>
              <TableHead className="p-2">To</TableHead>
              <TableHead className="p-2">Subject</TableHead>
              <TableHead className="p-2">From</TableHead>
              <TableHead className="p-2">Age</TableHead>
              <TableHead className="w-12 p-2"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-muted-foreground">
                    {filters.search || filters.category !== 'all' || filters.status !== 'all'
                      ? 'No events match your filters'
                      : 'No webhook events yet'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Events will appear here when Resend sends webhooks
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  onDelete={handleDelete}
                  isDeleting={deleteEvent.isPending}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination info */}
      {events.length > 0 && (
        <div className="text-sm text-muted-foreground">
          Showing {events.length} of {totalCount} events
        </div>
      )}
    </div>
  )
}
