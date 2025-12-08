/**
 * Gratitude Module - Type Definitions
 *
 * This file contains TypeScript type definitions for the module.
 */

/**
 * GratitudeEntry
 *
 * Represents a row in the gratitude_entries table
 * Maps directly to database schema
 */
export interface GratitudeEntry {
  id: string              // UUID primary key
  user_id: string         // Foreign key to auth.users
  entry_date: string      // Date string (YYYY-MM-DD)
  question1: string | null // What is one small moment from today that made you smile?
  question2: string | null // Who supported you recently in a way you genuinely appreciated?
  question3: string | null // What is something in your life that feels stable and comforting right now?
  question4: string | null // What is one thing your health and body allowed you to do today that you're grateful for?
  question5: string | null // What is something you're looking forward to that brings a sense of hope or ease?
  created_at: string      // ISO timestamp
  updated_at?: string     // Optional ISO timestamp
}

/**
 * SaveEntryRequest
 *
 * Request body for POST/PUT /api/modules/gratitude/entries
 */
export interface SaveEntryRequest {
  entry_date: string
  question1?: string | null
  question2?: string | null
  question3?: string | null
  question4?: string | null
  question5?: string | null
}

/**
 * GetEntryResponse
 *
 * Response from GET /api/modules/gratitude/entries
 */
export interface GetEntryResponse {
  entry: GratitudeEntry | null
}

/**
 * SaveEntryResponse
 *
 * Response from POST /api/modules/gratitude/entries
 */
export interface SaveEntryResponse {
  entry: GratitudeEntry
}

/**
 * API Error Response
 *
 * Standard error response format for all module APIs
 */
export interface ApiErrorResponse {
  error: string
  details?: unknown
}

/**
 * Question definition for rendering the form
 */
export interface GratitudeQuestion {
  id: keyof Pick<GratitudeEntry, 'question1' | 'question2' | 'question3' | 'question4' | 'question5'>
  text: string
}

/**
 * The 5 gratitude questions
 * These can be updated without changing the database schema
 */
export const GRATITUDE_QUESTIONS: GratitudeQuestion[] = [
  {
    id: 'question1',
    text: 'What is one small moment from today that made you smile?'
  },
  {
    id: 'question2',
    text: 'Who supported you recently in a way you genuinely appreciated?'
  },
  {
    id: 'question3',
    text: 'What is something in your life that feels stable and comforting right now?'
  },
  {
    id: 'question4',
    text: 'What is one thing your health and body allowed you to do today that you\'re grateful for?'
  },
  {
    id: 'question5',
    text: 'What is something you\'re looking forward to that brings a sense of hope or ease?'
  }
]
