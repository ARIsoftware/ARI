import { CheckSquare, Plus, Archive, Dumbbell, Target, TrendingUp, Settings, BarChart3, Bot, Package, Grid3x3, Radar } from "lucide-react"

export interface MenuItem {
  title: string
  url: string
  icon: any
  isActive?: boolean
}

export interface MenuGroup {
  title: string
  url: string
  icon: any
  items: MenuItem[]
}

export const menuConfig: MenuGroup[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: BarChart3,
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: BarChart3,
      },
      {
        title: "HD Dashboard",
        url: "/hd-dashboard",
        icon: Grid3x3,
      },
    ],
  },
  {
    title: "Todo",
    url: "#",
    icon: CheckSquare,
    items: [
      {
        title: "All Tasks",
        url: "/tasks",
        icon: CheckSquare,
      },
      {
        title: "Add Task",
        url: "/add-task",
        icon: Plus,
      },
      {
        title: "Task Radar",
        url: "/radar",
        icon: Radar,
      },
      {
        title: "Completed",
        url: "#",
        icon: Archive,
        isActive: false,
      },
    ],
  },
  {
    title: "Settings",
    url: "#",
    icon: Settings,
    items: [
      {
        title: "Preferences",
        url: "/settings",
        icon: Settings,
      },
      {
        title: "Modules",
        url: "/modules",
        icon: Package,
      },
    ],
  },
]

// Extract all unique page URLs from menu config (excluding placeholders like '#')
export function getAllPageUrls(): string[] {
  const urls = new Set<string>()

  menuConfig.forEach(group => {
    group.items.forEach(item => {
      if (item.url && item.url !== '#' && !item.url.startsWith('#')) {
        urls.add(item.url)
      }
    })
  })

  return Array.from(urls)
}

// Generate feature name from URL
export function urlToFeatureName(url: string): string {
  return url.replace('/', '').replace(/\//g, '-') || 'home'
}

// Map URLs to feature names dynamically
export function getUrlToFeatureMap(): Record<string, string> {
  const map: Record<string, string> = {}
  const urls = getAllPageUrls()

  urls.forEach(url => {
    map[url] = urlToFeatureName(url)
  })

  return map
}

// Get all features with metadata for settings page
export interface FeatureInfo {
  name: string
  label: string
  url: string
  description: string
  canBeDisabled: boolean
}

export function getAllFeatures(): FeatureInfo[] {
  const features: FeatureInfo[] = []

  menuConfig.forEach(group => {
    group.items.forEach(item => {
      if (item.url && item.url !== '#' && !item.url.startsWith('#')) {
        const featureName = urlToFeatureName(item.url)
        // Settings page cannot be disabled
        const canBeDisabled = item.url !== '/settings'

        features.push({
          name: featureName,
          label: item.title,
          url: item.url,
          description: getFeatureDescription(item.title, item.url),
          canBeDisabled
        })
      }
    })
  })

  // Remove duplicates (keep first occurrence)
  const seen = new Set<string>()
  return features.filter(feature => {
    if (seen.has(feature.name)) return false
    seen.add(feature.name)
    return true
  })
}

function getFeatureDescription(title: string, url: string): string {
  const descriptions: Record<string, string> = {
    '/dashboard': 'Overview of your tasks, fitness, and goals',
    '/hd-dashboard': 'High-density dashboard view',
    '/tasks': 'Manage your todo list',
    '/add-task': 'Create new tasks',
    '/radar': 'Visualize task priorities',
    '/settings': 'Application settings and preferences',
    '/modules': 'Enable or disable installed modules to extend your app functionality',
  }

  return descriptions[url] || `Access ${title} features`
}
