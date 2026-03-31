/**
 * Mail Stream Module - Webhook API Route
 *
 * Receives and stores webhook events from Resend.
 * This endpoint is PUBLIC (no auth required) but verifies signatures.
 *
 * Endpoint: POST /api/modules/mail-stream/webhook
 *
 * Security:
 * - Signature verification using Svix (Resend's webhook provider)
 * - Replay attack protection via timestamp validation
 * - Raw body parsing to ensure signature matches
 */

import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { withAdminDb } from '@/lib/db'
import { mailStreamEvents } from '@/lib/db/schema'
import type { ResendWebhookPayload, ResendEventType, EventCategory, EmailStatus } from '../../types'

/**
 * Get event category from event type
 */
function getEventCategory(eventType: string): EventCategory {
  if (eventType.startsWith('email.')) return 'email'
  if (eventType.startsWith('contact.')) return 'contact'
  if (eventType.startsWith('domain.')) return 'domain'
  return 'email'
}

/**
 * Get email status from event type
 */
function getEmailStatus(eventType: string): EmailStatus | null {
  if (!eventType.startsWith('email.')) return null
  return eventType.replace('email.', '') as EmailStatus
}

/**
 * POST Handler - Receive webhook from Resend
 *
 * This endpoint does NOT require authentication but DOES verify
 * the webhook signature using the RESEND_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  try {
    // Get the webhook secret from environment
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET

    if (!webhookSecret) {
      console.error('[Mail Stream Webhook] RESEND_WEBHOOK_SECRET not configured')
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      )
    }

    // Get the raw body as text (required for signature verification)
    const rawBody = await request.text()

    // Get Svix headers for signature verification
    const svixId = request.headers.get('svix-id')
    const svixTimestamp = request.headers.get('svix-timestamp')
    const svixSignature = request.headers.get('svix-signature')

    // Validate required headers are present
    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error('[Mail Stream Webhook] Missing Svix headers')
      return NextResponse.json(
        { error: 'Missing webhook signature headers' },
        { status: 400 }
      )
    }

    // Verify the webhook signature using Svix
    const wh = new Webhook(webhookSecret)
    let payload: ResendWebhookPayload

    try {
      payload = wh.verify(rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ResendWebhookPayload
    } catch (err) {
      console.error('[Mail Stream Webhook] Signature verification failed:', err)
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      )
    }

    // Extract event details
    const eventType = payload.type as ResendEventType
    const eventCategory = getEventCategory(eventType)
    const status = getEmailStatus(eventType)

    // Extract email-specific fields
    const emailData = payload.data || {}
    const toAddresses = emailData.to || null
    const bounceDetails = emailData.bounce || null
    const clickDetails = emailData.click || null

    // Store the event in database
    // Note: Using withAdminDb (not withRLS) since this is a global log
    await withAdminDb(async (db) => {
      await db.insert(mailStreamEvents).values({
        eventType,
        eventCategory,
        emailId: emailData.email_id || null,
        fromAddress: emailData.from || null,
        toAddresses,
        subject: emailData.subject || null,
        status,
        bounceDetails,
        clickDetails,
        rawPayload: payload,
        resendCreatedAt: payload.created_at,
      })
    })

    // Return success
    return NextResponse.json({ received: true })

  } catch (error: any) {
    console.error('[Mail Stream Webhook] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET Handler - Health check for the webhook endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/modules/mail-stream/webhook',
    method: 'POST',
    description: 'Resend webhook receiver for Mail Stream module'
  })
}
