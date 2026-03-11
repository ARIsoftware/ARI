/**
 * Mail Stream Module - Type Definitions
 *
 * Types for Resend webhook events and module data structures.
 */

/**
 * All possible Resend webhook event types
 */
export type ResendEventType =
  // Email events
  | 'email.sent'
  | 'email.delivered'
  | 'email.opened'
  | 'email.clicked'
  | 'email.bounced'
  | 'email.complained'
  | 'email.delivery_delayed'
  | 'email.failed'
  | 'email.received'
  | 'email.scheduled'
  | 'email.suppressed'
  // Contact events
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted'
  // Domain events
  | 'domain.created'
  | 'domain.updated'
  | 'domain.deleted'

/**
 * Event category derived from event type
 */
export type EventCategory = 'email' | 'contact' | 'domain'

/**
 * Status for filtering (derived from email event types)
 */
export type EmailStatus =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'delivery_delayed'
  | 'failed'
  | 'received'
  | 'scheduled'
  | 'suppressed'

/**
 * Bounce details from Resend webhook
 */
export interface BounceDetails {
  message: string
  type?: string
  subType?: string
}

/**
 * Click details from Resend webhook
 */
export interface ClickDetails {
  link?: string
  userAgent?: string
  ipAddress?: string
}

/**
 * Raw webhook payload from Resend
 */
export interface ResendWebhookPayload {
  type: ResendEventType
  created_at: string
  data: {
    // Email-specific fields
    email_id?: string
    from?: string
    to?: string[]
    subject?: string
    broadcast_id?: string
    template_id?: string
    tags?: Record<string, string>
    bounce?: BounceDetails
    click?: ClickDetails
    // Contact-specific fields
    contact_id?: string
    email?: string
    first_name?: string
    last_name?: string
    audience_id?: string
    // Domain-specific fields
    domain_id?: string
    name?: string
    status?: string
    region?: string
    // Common fields
    created_at?: string
  }
}

/**
 * Mail Stream Event stored in database
 */
export interface MailStreamEvent {
  id: string
  event_type: ResendEventType
  event_category: EventCategory
  email_id: string | null
  from_address: string | null
  to_addresses: string[] | null
  subject: string | null
  status: EmailStatus | null
  bounce_details: BounceDetails | null
  click_details: ClickDetails | null
  raw_payload: ResendWebhookPayload
  resend_created_at: string
  created_at: string
}

/**
 * Mail Stream Settings
 */
export interface MailStreamSettings {
  retention_days: 7 | 30 | 90 | 360 | -1  // -1 means indefinitely
  setup_complete: boolean
}

/**
 * Default settings
 */
export const DEFAULT_MAIL_STREAM_SETTINGS: MailStreamSettings = {
  retention_days: -1,
  setup_complete: false
}

/**
 * Retention options for UI
 */
export const RETENTION_OPTIONS = [
  { value: 7, label: '7 Days' },
  { value: 30, label: '30 Days' },
  { value: 90, label: '90 Days' },
  { value: 360, label: '360 Days' },
  { value: -1, label: 'Indefinitely' }
] as const

/**
 * API Response types
 */
export interface GetEventsResponse {
  events: MailStreamEvent[]
  count: number
}

export interface GetSettingsResponse {
  settings: MailStreamSettings
}

export interface UpdateSettingsResponse {
  success: boolean
  message: string
}

/**
 * Filter state for the UI
 */
export interface MailStreamFilters {
  category: 'all' | EventCategory
  status: 'all' | EmailStatus
  search: string
}

/**
 * Helper to get category from event type
 */
export function getEventCategory(eventType: ResendEventType): EventCategory {
  if (eventType.startsWith('email.')) return 'email'
  if (eventType.startsWith('contact.')) return 'contact'
  if (eventType.startsWith('domain.')) return 'domain'
  return 'email' // fallback
}

/**
 * Helper to get status from email event type
 */
export function getEmailStatus(eventType: ResendEventType): EmailStatus | null {
  if (!eventType.startsWith('email.')) return null
  return eventType.replace('email.', '') as EmailStatus
}

/**
 * Status color mapping for badges
 */
export const STATUS_COLORS: Record<EmailStatus, string> = {
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  opened: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  clicked: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  bounced: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  complained: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  delivery_delayed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  received: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  scheduled: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  suppressed: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
}

/**
 * Event category colors
 */
export const CATEGORY_COLORS: Record<EventCategory, string> = {
  email: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  contact: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  domain: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
}
