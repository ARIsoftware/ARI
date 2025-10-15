// Shipment Module - Validation Schemas
import { z } from 'zod'

const nonEmptyString = z.string().min(1, 'Cannot be empty')

// Shipment status enum
export const ShipmentStatus = z.enum(['pending', 'in_transit', 'out_for_delivery', 'delivered', 'delayed', 'returned'], {
  errorMap: () => ({ message: 'Invalid shipment status' })
})

// Create shipment schema
export const createShipmentSchema = z.object({
  shipment: z.object({
    name: nonEmptyString.max(255, 'Name too long'),
    tracking_code: z.string().max(100, 'Tracking code too long').nullable().optional(),
    tracking_link: z.string().url('Invalid URL format').max(500, 'URL too long').nullable().optional(),
    carrier: z.string().max(100, 'Carrier name too long').nullable().optional(),
    status: ShipmentStatus.default('pending'),
    expected_delivery: z.union([
      z.string().datetime(),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
      z.null()
    ]).optional(),
    notes: z.string().max(2000, 'Notes too long').nullable().optional()
  })
})

// Update shipment schema
export const updateShipmentSchema = z.object({
  name: nonEmptyString.max(255, 'Name too long').optional(),
  tracking_code: z.string().max(100, 'Tracking code too long').nullable().optional(),
  tracking_link: z.string().url('Invalid URL format').max(500, 'URL too long').nullable().optional(),
  carrier: z.string().max(100, 'Carrier name too long').nullable().optional(),
  status: ShipmentStatus.optional(),
  expected_delivery: z.union([
    z.string().datetime(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    z.null()
  ]).optional(),
  notes: z.string().max(2000, 'Notes too long').nullable().optional()
})
