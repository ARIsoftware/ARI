import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Parse user agent string to extract device and browser information
 */
export function parseUserAgent(userAgent: string | null | undefined): { device: string; browser: string } {
  if (!userAgent) {
    return { device: "Unknown device", browser: "Unknown browser" }
  }

  let device = "Desktop"
  if (userAgent.includes("iPhone")) {
    device = "iPhone"
  } else if (userAgent.includes("iPad")) {
    device = "iPad"
  } else if (userAgent.includes("Android")) {
    device = "Android"
  } else if (userAgent.includes("Macintosh")) {
    device = "Mac"
  } else if (userAgent.includes("Windows")) {
    device = "Windows"
  } else if (userAgent.includes("Linux")) {
    device = "Linux"
  }

  let browser = "Unknown"
  if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) {
    browser = "Chrome"
  } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
    browser = "Safari"
  } else if (userAgent.includes("Firefox")) {
    browser = "Firefox"
  } else if (userAgent.includes("Edg")) {
    browser = "Edge"
  }

  return { device, browser }
}

/**
 * Format a date as a relative time string (e.g., "5m ago", "2h ago", "3d ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - new Date(date).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) {
    return "Just now"
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`
  }
  return new Date(date).toLocaleDateString()
}
