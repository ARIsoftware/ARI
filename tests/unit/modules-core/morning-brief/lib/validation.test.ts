import { describe, it, expect } from 'vitest'
import {
  MorningBriefSettingsSchema,
  SettingsSavedSchema,
  greetingQuerySchema,
  GreetingResponseSchema,
  BriefMeetingSchema,
  CalendarResponseSchema,
  WeatherResponseSchema,
  TtsRequestSchema,
  ElevenLabsVoiceSchema,
  VoicesResponseSchema,
  IcalSubscribeSchema,
  IcalStatusResponseSchema,
  GoogleStatusResponseSchema,
  GoogleDisconnectResponseSchema,
} from '@/modules-core/morning-brief/lib/validation'
import { AI_PROVIDER_IDS } from '@/lib/ai-providers'

// ─── MorningBriefSettingsSchema ───────────────────────────────────────────────

describe('MorningBriefSettingsSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(MorningBriefSettingsSchema.safeParse({}).success).toBe(true)
  })

  it('accepts null selectedAiProvider', () => {
    expect(MorningBriefSettingsSchema.safeParse({ selectedAiProvider: null }).success).toBe(true)
  })

  it('accepts valid AI provider', () => {
    expect(MorningBriefSettingsSchema.safeParse({ selectedAiProvider: 'claude' }).success).toBe(true)
  })

  it('rejects invalid AI provider for selectedAiProvider', () => {
    expect(MorningBriefSettingsSchema.safeParse({ selectedAiProvider: 'unknown-ai' }).success).toBe(false)
  })

  it('accepts all AI_PROVIDER_IDS for selectedAiProvider', () => {
    for (const id of AI_PROVIDER_IDS) {
      expect(MorningBriefSettingsSchema.safeParse({ selectedAiProvider: id }).success).toBe(true)
    }
  })

  it('accepts null selectedVoiceProvider', () => {
    expect(MorningBriefSettingsSchema.safeParse({ selectedVoiceProvider: null }).success).toBe(true)
  })

  it('accepts valid voice provider', () => {
    expect(MorningBriefSettingsSchema.safeParse({ selectedVoiceProvider: 'elevenlabs' }).success).toBe(true)
  })

  it('rejects invalid voice provider', () => {
    expect(MorningBriefSettingsSchema.safeParse({ selectedVoiceProvider: 'unknown' }).success).toBe(false)
  })

  it('accepts null elevenLabsVoiceId', () => {
    expect(MorningBriefSettingsSchema.safeParse({ elevenLabsVoiceId: null }).success).toBe(true)
  })

  it('accepts valid elevenLabsVoiceId within 100 chars', () => {
    expect(MorningBriefSettingsSchema.safeParse({ elevenLabsVoiceId: 'voice-abc-123' }).success).toBe(true)
  })

  it('rejects elevenLabsVoiceId exceeding 100 chars', () => {
    expect(MorningBriefSettingsSchema.safeParse({ elevenLabsVoiceId: 'a'.repeat(101) }).success).toBe(false)
  })

  it('accepts aiProviderModels map', () => {
    expect(MorningBriefSettingsSchema.safeParse({ aiProviderModels: { claude: 'claude-3-opus' } }).success).toBe(true)
  })

  it('rejects provider id exceeding 64 chars in aiProviderModels', () => {
    const longKey = 'a'.repeat(65)
    expect(MorningBriefSettingsSchema.safeParse({ aiProviderModels: { [longKey]: 'model' } }).success).toBe(false)
  })

  it('rejects model id exceeding MODEL_ID_MAX_LENGTH (200)', () => {
    expect(MorningBriefSettingsSchema.safeParse({ aiProviderModels: { openai: 'x'.repeat(201) } }).success).toBe(false)
  })

  it('rejects unknown extra keys (strict)', () => {
    expect(MorningBriefSettingsSchema.safeParse({ unknownField: true }).success).toBe(false)
  })
})

// ─── SettingsSavedSchema ──────────────────────────────────────────────────────

describe('SettingsSavedSchema', () => {
  it('accepts { success: true }', () => {
    expect(SettingsSavedSchema.safeParse({ success: true }).success).toBe(true)
  })

  it('rejects { success: false }', () => {
    expect(SettingsSavedSchema.safeParse({ success: false }).success).toBe(false)
  })
})

// ─── greetingQuerySchema ──────────────────────────────────────────────────────

describe('greetingQuerySchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(greetingQuerySchema.safeParse({}).success).toBe(true)
  })

  it('coerces string taskCount to number', () => {
    const result = greetingQuerySchema.parse({ taskCount: '5' })
    expect(result.taskCount).toBe(5)
  })

  it('accepts taskCount 0', () => {
    expect(greetingQuerySchema.safeParse({ taskCount: 0 }).success).toBe(true)
  })

  it('rejects negative taskCount', () => {
    expect(greetingQuerySchema.safeParse({ taskCount: -1 }).success).toBe(false)
  })

  it('accepts taskCount at max 10000', () => {
    expect(greetingQuerySchema.safeParse({ taskCount: 10000 }).success).toBe(true)
  })

  it('rejects taskCount exceeding 10000', () => {
    expect(greetingQuerySchema.safeParse({ taskCount: 10001 }).success).toBe(false)
  })

  it('coerces string meetingCount to number', () => {
    const result = greetingQuerySchema.parse({ meetingCount: '3' })
    expect(result.meetingCount).toBe(3)
  })

  it('accepts meetingCount 0', () => {
    expect(greetingQuerySchema.safeParse({ meetingCount: 0 }).success).toBe(true)
  })

  it('rejects negative meetingCount', () => {
    expect(greetingQuerySchema.safeParse({ meetingCount: -1 }).success).toBe(false)
  })

  it('accepts meetingCount at max 10000', () => {
    expect(greetingQuerySchema.safeParse({ meetingCount: 10000 }).success).toBe(true)
  })

  it('rejects meetingCount exceeding 10000', () => {
    expect(greetingQuerySchema.safeParse({ meetingCount: 10001 }).success).toBe(false)
  })

  it('rejects non-integer taskCount', () => {
    expect(greetingQuerySchema.safeParse({ taskCount: 1.5 }).success).toBe(false)
  })
})

// ─── GreetingResponseSchema ───────────────────────────────────────────────────

describe('GreetingResponseSchema', () => {
  const valid = {
    greeting: 'Good morning!',
    message: 'You have 3 tasks today.',
    brief_date: '2024-01-01',
    cached: false,
    provider: null,
    model: null,
  }

  it('accepts valid greeting response', () => {
    expect(GreetingResponseSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts string provider and model', () => {
    expect(GreetingResponseSchema.safeParse({ ...valid, provider: 'claude', model: 'claude-3' }).success).toBe(true)
  })

  it('rejects missing greeting', () => {
    const { greeting: _, ...noGreeting } = valid
    expect(GreetingResponseSchema.safeParse(noGreeting).success).toBe(false)
  })

  it('rejects missing cached', () => {
    const { cached: _, ...noCached } = valid
    expect(GreetingResponseSchema.safeParse(noCached).success).toBe(false)
  })
})

// ─── BriefMeetingSchema ───────────────────────────────────────────────────────

describe('BriefMeetingSchema', () => {
  const valid = {
    id: 'event-1',
    title: 'Team Standup',
    startLabel: '9:00 AM',
    endLabel: '9:30 AM',
    allDay: false,
    location: null,
    start: '2024-01-01T09:00:00Z',
  }

  it('accepts valid meeting', () => {
    expect(BriefMeetingSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts null endLabel', () => {
    expect(BriefMeetingSchema.safeParse({ ...valid, endLabel: null }).success).toBe(true)
  })

  it('accepts null start', () => {
    expect(BriefMeetingSchema.safeParse({ ...valid, start: null }).success).toBe(true)
  })

  it('accepts string location', () => {
    expect(BriefMeetingSchema.safeParse({ ...valid, location: 'Zoom' }).success).toBe(true)
  })

  it('accepts allDay: true', () => {
    expect(BriefMeetingSchema.safeParse({ ...valid, allDay: true }).success).toBe(true)
  })

  it('rejects missing id', () => {
    const { id: _, ...noId } = valid
    expect(BriefMeetingSchema.safeParse(noId).success).toBe(false)
  })
})

// ─── CalendarResponseSchema ───────────────────────────────────────────────────

describe('CalendarResponseSchema', () => {
  it('accepts valid calendar response', () => {
    expect(CalendarResponseSchema.safeParse({ connected: true, events: [], timezone: 'UTC' }).success).toBe(true)
  })

  it('accepts disconnected calendar', () => {
    expect(CalendarResponseSchema.safeParse({ connected: false, events: [], timezone: 'America/New_York' }).success).toBe(true)
  })

  it('rejects missing timezone', () => {
    expect(CalendarResponseSchema.safeParse({ connected: false, events: [] }).success).toBe(false)
  })
})

// ─── WeatherResponseSchema ────────────────────────────────────────────────────

describe('WeatherResponseSchema', () => {
  const valid = {
    available: true,
    city: 'New York',
    high: 25,
    low: 15,
    unit: 'C' as const,
    code: 800,
    description: 'Clear sky',
  }

  it('accepts valid weather with C unit', () => {
    expect(WeatherResponseSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts F unit', () => {
    expect(WeatherResponseSchema.safeParse({ ...valid, unit: 'F' }).success).toBe(true)
  })

  it('rejects invalid unit', () => {
    expect(WeatherResponseSchema.safeParse({ ...valid, unit: 'K' }).success).toBe(false)
  })

  it('accepts null city', () => {
    expect(WeatherResponseSchema.safeParse({ ...valid, city: null }).success).toBe(true)
  })

  it('accepts null high/low/code/description when unavailable', () => {
    const unavailable = { available: false, city: null, high: null, low: null, unit: 'C' as const, code: null, description: null }
    expect(WeatherResponseSchema.safeParse(unavailable).success).toBe(true)
  })
})

// ─── TtsRequestSchema ─────────────────────────────────────────────────────────

describe('TtsRequestSchema', () => {
  it('accepts valid text', () => {
    expect(TtsRequestSchema.safeParse({ text: 'Good morning!' }).success).toBe(true)
  })

  it('rejects empty text', () => {
    expect(TtsRequestSchema.safeParse({ text: '' }).success).toBe(false)
  })

  it('rejects text exceeding 5000 chars', () => {
    expect(TtsRequestSchema.safeParse({ text: 'x'.repeat(5001) }).success).toBe(false)
  })

  it('accepts text at exactly 5000 chars', () => {
    expect(TtsRequestSchema.safeParse({ text: 'x'.repeat(5000) }).success).toBe(true)
  })

  it('rejects missing text', () => {
    expect(TtsRequestSchema.safeParse({}).success).toBe(false)
  })

  it('rejects unknown extra keys (strict)', () => {
    expect(TtsRequestSchema.safeParse({ text: 'Hi', extra: true }).success).toBe(false)
  })
})

// ─── ElevenLabsVoiceSchema ────────────────────────────────────────────────────

describe('ElevenLabsVoiceSchema', () => {
  const valid = {
    voiceId: 'voice-abc-123',
    name: 'Rachel',
    category: null,
    previewUrl: null,
    labels: null,
  }

  it('accepts valid voice', () => {
    expect(ElevenLabsVoiceSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts string category', () => {
    expect(ElevenLabsVoiceSchema.safeParse({ ...valid, category: 'premade' }).success).toBe(true)
  })

  it('accepts string previewUrl', () => {
    expect(ElevenLabsVoiceSchema.safeParse({ ...valid, previewUrl: 'https://cdn.example.com/preview.mp3' }).success).toBe(true)
  })

  it('accepts labels record', () => {
    expect(ElevenLabsVoiceSchema.safeParse({ ...valid, labels: { accent: 'American', gender: 'Female' } }).success).toBe(true)
  })

  it('rejects missing voiceId', () => {
    const { voiceId: _, ...noVoiceId } = valid
    expect(ElevenLabsVoiceSchema.safeParse(noVoiceId).success).toBe(false)
  })
})

// ─── VoicesResponseSchema ─────────────────────────────────────────────────────

describe('VoicesResponseSchema', () => {
  it('accepts valid response with empty voices', () => {
    expect(VoicesResponseSchema.safeParse({ configured: true, voices: [] }).success).toBe(true)
  })

  it('accepts unconfigured response', () => {
    expect(VoicesResponseSchema.safeParse({ configured: false, voices: [] }).success).toBe(true)
  })

  it('rejects missing configured', () => {
    expect(VoicesResponseSchema.safeParse({ voices: [] }).success).toBe(false)
  })
})

// ─── IcalSubscribeSchema ──────────────────────────────────────────────────────

describe('IcalSubscribeSchema', () => {
  it('accepts valid calendar URL', () => {
    expect(IcalSubscribeSchema.safeParse({ url: 'https://calendar.google.com/calendar/ical/example.ics' }).success).toBe(true)
  })

  it('rejects invalid URL', () => {
    expect(IcalSubscribeSchema.safeParse({ url: 'not-a-url' }).success).toBe(false)
  })

  it('rejects URL exceeding 2000 chars', () => {
    expect(IcalSubscribeSchema.safeParse({ url: 'https://example.com/' + 'a'.repeat(1985) }).success).toBe(false)
  })

  it('rejects unknown extra keys (strict)', () => {
    expect(IcalSubscribeSchema.safeParse({ url: 'https://example.com/cal.ics', extra: true }).success).toBe(false)
  })

  it('rejects missing url', () => {
    expect(IcalSubscribeSchema.safeParse({}).success).toBe(false)
  })
})

// ─── IcalStatusResponseSchema ─────────────────────────────────────────────────

describe('IcalStatusResponseSchema', () => {
  it('accepts subscribed with host', () => {
    expect(IcalStatusResponseSchema.safeParse({ subscribed: true, host: 'calendar.google.com' }).success).toBe(true)
  })

  it('accepts not subscribed with null host', () => {
    expect(IcalStatusResponseSchema.safeParse({ subscribed: false, host: null }).success).toBe(true)
  })

  it('rejects missing subscribed', () => {
    expect(IcalStatusResponseSchema.safeParse({ host: null }).success).toBe(false)
  })
})

// ─── GoogleStatusResponseSchema ───────────────────────────────────────────────

describe('GoogleStatusResponseSchema', () => {
  it('accepts connected status with email', () => {
    expect(GoogleStatusResponseSchema.safeParse({ connected: true, configured: true, email: 'user@gmail.com' }).success).toBe(true)
  })

  it('accepts disconnected with null email', () => {
    expect(GoogleStatusResponseSchema.safeParse({ connected: false, configured: false, email: null }).success).toBe(true)
  })

  it('rejects missing connected', () => {
    expect(GoogleStatusResponseSchema.safeParse({ configured: true, email: null }).success).toBe(false)
  })
})

// ─── GoogleDisconnectResponseSchema ──────────────────────────────────────────

describe('GoogleDisconnectResponseSchema', () => {
  it('accepts { success: true }', () => {
    expect(GoogleDisconnectResponseSchema.safeParse({ success: true }).success).toBe(true)
  })

  it('rejects { success: false }', () => {
    expect(GoogleDisconnectResponseSchema.safeParse({ success: false }).success).toBe(false)
  })
})
