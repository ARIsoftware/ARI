// API route helpers for validation and error handling
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Validates request JSON body against a Zod schema
 */
export async function validateRequestBody<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  try {
    const body = await request.json()
    const validatedData = schema.parse(body)
    return { success: true, data: validatedData }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        received: err.received
      }))
      
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'Validation failed',
            details: errorMessages
          },
          { status: 400 }
        )
      }
    }
    
    // Handle JSON parsing errors
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
  }
}

/**
 * Validates URL path parameters against a Zod schema
 */
export function validatePathParams<T>(
  params: Record<string, string | string[]>,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; response: NextResponse } {
  try {
    const validatedData = schema.parse(params)
    return { success: true, data: validatedData }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        received: err.received
      }))
      
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'Invalid path parameters',
            details: errorMessages
          },
          { status: 400 }
        )
      }
    }
    
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Invalid path parameters' },
        { status: 400 }
      )
    }
  }
}

/**
 * Validates URL query parameters against a Zod schema
 */
export function validateQueryParams<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; response: NextResponse } {
  try {
    const queryObject = Object.fromEntries(searchParams.entries())
    const validatedData = schema.parse(queryObject)
    return { success: true, data: validatedData }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        received: err.received
      }))
      
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'Invalid query parameters',
            details: errorMessages
          },
          { status: 400 }
        )
      }
    }
    
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      )
    }
  }
}

/**
 * Generic error response helper
 */
export function createErrorResponse(
  message: string,
  status: number = 500,
  details?: Record<string, unknown>
): NextResponse {
  const body: Record<string, unknown> = { error: message }
  if (details) {
    body.details = details
  }
  
  return NextResponse.json(body, { status })
}

/**
 * Success response helper
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200
): NextResponse {
  return NextResponse.json(data, { status })
}

/**
 * Converts a camelCase string to snake_case
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
}

/**
 * Recursively transforms an object's keys from camelCase to snake_case
 * Used to maintain backward compatibility with frontend that expects snake_case
 * after migrating from Supabase (snake_case) to Drizzle (camelCase)
 */
export function toSnakeCase<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => toSnakeCase(item)) as T
  }

  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const snakeKey = camelToSnake(key)
      result[snakeKey] = toSnakeCase(value)
    }
    return result as T
  }

  return obj
}