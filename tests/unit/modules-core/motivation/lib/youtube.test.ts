import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  extractYouTubeId,
  fetchYouTubeMetadata,
  thumbnailFor,
  canonicalYouTubeUrl,
  fallbackThumbnailFor,
} from '@/modules-core/motivation/lib/youtube'

const VALID_ID = 'dQw4w9WgXcQ'

describe('extractYouTubeId', () => {
  // Valid URLs
  it('parses youtu.be short URL', () => {
    expect(extractYouTubeId(`https://youtu.be/${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses www.youtu.be short URL', () => {
    expect(extractYouTubeId(`https://www.youtu.be/${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses youtube.com/watch?v= URL', () => {
    expect(extractYouTubeId(`https://www.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses youtube.com/shorts/ URL', () => {
    expect(extractYouTubeId(`https://www.youtube.com/shorts/${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses youtube.com/embed/ URL', () => {
    expect(extractYouTubeId(`https://www.youtube.com/embed/${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses youtube.com/v/ URL', () => {
    expect(extractYouTubeId(`https://www.youtube.com/v/${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses youtube.com/live/ URL', () => {
    expect(extractYouTubeId(`https://www.youtube.com/live/${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses m.youtube.com/watch?v= URL', () => {
    expect(extractYouTubeId(`https://m.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses music.youtube.com/watch?v= URL', () => {
    expect(extractYouTubeId(`https://music.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID)
  })

  it('accepts http:// protocol', () => {
    expect(extractYouTubeId(`http://www.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID)
  })

  it('handles trailing whitespace/newlines', () => {
    expect(extractYouTubeId(`  https://youtu.be/${VALID_ID}  `)).toBe(VALID_ID)
  })

  // Invalid URLs
  it('returns null for empty string', () => {
    expect(extractYouTubeId('')).toBeNull()
  })

  it('returns null for non-youtube domain', () => {
    expect(extractYouTubeId('https://vimeo.com/123456')).toBeNull()
  })

  it('returns null for non-url string', () => {
    expect(extractYouTubeId('not a url')).toBeNull()
  })

  it('returns null for ftp:// protocol', () => {
    expect(extractYouTubeId(`ftp://www.youtube.com/watch?v=${VALID_ID}`)).toBeNull()
  })

  it('returns null when video id is too short', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=short')).toBeNull()
  })

  it('returns null when video id is too long', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=toolongidthatfails')).toBeNull()
  })

  it('returns null for youtu.be with invalid id', () => {
    expect(extractYouTubeId('https://youtu.be/bad')).toBeNull()
  })

  it('returns null for youtube.com/watch with no v param', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch')).toBeNull()
  })

  it('returns null for youtube.com/shorts with invalid id', () => {
    expect(extractYouTubeId('https://www.youtube.com/shorts/bad')).toBeNull()
  })

  it('returns null for youtube.com/channel/ (not a video path)', () => {
    // channel is not in the allowed prefix list
    expect(extractYouTubeId('https://www.youtube.com/channel/UCtest')).toBeNull()
  })

  it('returns null for youtube.com root', () => {
    expect(extractYouTubeId('https://www.youtube.com/')).toBeNull()
  })
})

describe('thumbnailFor', () => {
  it('builds maxresdefault URL', () => {
    expect(thumbnailFor(VALID_ID)).toBe(`https://i.ytimg.com/vi/${VALID_ID}/maxresdefault.jpg`)
  })
})

describe('canonicalYouTubeUrl', () => {
  it('builds canonical watch URL', () => {
    expect(canonicalYouTubeUrl(VALID_ID)).toBe(`https://www.youtube.com/watch?v=${VALID_ID}`)
  })
})

describe('fallbackThumbnailFor', () => {
  it('builds hqdefault URL', () => {
    expect(fallbackThumbnailFor(VALID_ID)).toBe(`https://i.ytimg.com/vi/${VALID_ID}/hqdefault.jpg`)
  })
})

describe('fetchYouTubeMetadata', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns nulls for invalid video id', async () => {
    const result = await fetchYouTubeMetadata('bad')
    expect(result).toEqual({ title: null, channel: null })
    // Should not have called fetch
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('returns title and channel on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: 'My Video', author_name: 'My Channel' }),
    } as Response)
    const result = await fetchYouTubeMetadata(VALID_ID)
    expect(result).toEqual({ title: 'My Video', channel: 'My Channel' })
  })

  it('returns nulls when fetch response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as Response)
    const result = await fetchYouTubeMetadata(VALID_ID)
    expect(result).toEqual({ title: null, channel: null })
  })

  it('returns nulls when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))
    const result = await fetchYouTubeMetadata(VALID_ID)
    expect(result).toEqual({ title: null, channel: null })
  })

  it('truncates title to 300 chars', async () => {
    const longTitle = 'A'.repeat(400)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: longTitle, author_name: 'Channel' }),
    } as Response)
    const result = await fetchYouTubeMetadata(VALID_ID)
    expect(result.title?.length).toBe(300)
  })

  it('truncates channel to 200 chars', async () => {
    const longChannel = 'C'.repeat(300)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: 'Title', author_name: longChannel }),
    } as Response)
    const result = await fetchYouTubeMetadata(VALID_ID)
    expect(result.channel?.length).toBe(200)
  })

  it('returns null title when title is not a string', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: 123, author_name: 'Channel' }),
    } as Response)
    const result = await fetchYouTubeMetadata(VALID_ID)
    expect(result.title).toBeNull()
  })

  it('returns null channel when author_name is not a string', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: 'Title', author_name: null }),
    } as Response)
    const result = await fetchYouTubeMetadata(VALID_ID)
    expect(result.channel).toBeNull()
  })
})
