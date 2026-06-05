/**
 * YouTube URL parsing + oEmbed metadata fetch.
 * Server-side only — never trust client-provided titles/channels.
 */

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
])

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/

/**
 * Extract the 11-char YouTube video ID from a URL string.
 * Returns null if the URL is not a recognized YouTube URL.
 *
 * Accepted shapes:
 *   - youtu.be/<id>
 *   - youtube.com/watch?v=<id>
 *   - youtube.com/shorts/<id>
 *   - youtube.com/embed/<id>
 *   - youtube.com/v/<id>
 *   - youtube.com/live/<id>
 */
export function extractYouTubeId(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null

  // youtu.be/<id>
  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id && VIDEO_ID_RE.test(id) ? id : null
  }

  // youtube.com/watch?v=<id>
  const vParam = url.searchParams.get('v')
  if (vParam && VIDEO_ID_RE.test(vParam)) return vParam

  // youtube.com/{shorts,embed,v,live}/<id>
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length >= 2) {
    const [prefix, candidate] = segments
    if (['shorts', 'embed', 'v', 'live'].includes(prefix.toLowerCase()) && VIDEO_ID_RE.test(candidate)) {
      return candidate
    }
  }

  return null
}

export interface YouTubeMetadata {
  title: string | null
  channel: string | null
}

const OEMBED_TIMEOUT_MS = 5000

/**
 * Fetch title + channel via YouTube's public oEmbed endpoint.
 * Returns nulls if the fetch fails — the video is still saved with
 * just the ID, so a flaky oEmbed call doesn't break add.
 */
export async function fetchYouTubeMetadata(youtubeId: string): Promise<YouTubeMetadata> {
  if (!VIDEO_ID_RE.test(youtubeId)) {
    return { title: null, channel: null }
  }

  const target = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${youtubeId}`,
  )}&format=json`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS)

  try {
    const res = await fetch(target, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) return { title: null, channel: null }
    const data = (await res.json()) as { title?: unknown; author_name?: unknown }
    return {
      title: typeof data.title === 'string' ? data.title.slice(0, 300) : null,
      channel: typeof data.author_name === 'string' ? data.author_name.slice(0, 200) : null,
    }
  } catch {
    return { title: null, channel: null }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Compose the best-quality public thumbnail URL for a video.
 * The grid will try this first, then fall back to hqdefault if it 404s.
 */
export function thumbnailFor(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`
}

/**
 * Canonical watch URL built server-side from the extracted ID. We persist
 * this instead of the raw user-supplied URL so the stored value can never
 * carry attacker-controlled query params or surprise schemes.
 */
export function canonicalYouTubeUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`
}

/**
 * Fallback URL — hqdefault always exists for any public video.
 */
export function fallbackThumbnailFor(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
}
