import { CheckSquare, Plus, Archive, Dumbbell, Target, TrendingUp, Users, UserPlus, Settings, BarChart3, Compass, Bot, Package, Sparkles, Grid3x3, Radar } from "lucide-react"

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
      {
        title: "HD2 Dashboard",
        url: "/hd2-dashboard",
        icon: Grid3x3,
      },
    ],
  },
  {
    title: "Assist",
    url: "/assist",
    icon: Bot,
    items: [
      {
        title: "Assist",
        url: "/assist",
        icon: Bot,
      },
    ],
  },
  {
    title: "Northstar",
    url: "/northstar",
    icon: Compass,
    items: [
      {
        title: "Northstar",
        url: "/northstar",
        icon: Compass,
      },
    ],
  },
  {
    title: "Motivation",
    url: "/motivation",
    icon: Sparkles,
    items: [
      {
        title: "Motivation",
        url: "/motivation",
        icon: Sparkles,
      },
    ],
  },
  {
    title: "Fitness First",
    url: "#",
    icon: Dumbbell,
    items: [
      {
        title: "Hyrox",
        url: "/hyrox",
        icon: Target,
      },
      {
        title: "Daily Fitness",
        url: "/daily-fitness",
        icon: Dumbbell,
      },
      {
        title: "Goals",
        url: "#",
        icon: Target,
      },
      {
        title: "Progress",
        url: "#",
        icon: TrendingUp,
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
    title: "People",
    url: "#",
    icon: Users,
    items: [
      {
        title: "All Contacts",
        url: "/contacts",
        icon: Users,
      },
      {
        title: "Add Contact",
        url: "#",
        icon: UserPlus,
      },
    ],
  },
  {
    title: "Shipments",
    url: "/shipments",
    icon: Package,
    items: [
      {
        title: "All Shipments",
        url: "/shipments",
        icon: Package,
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
    '/hd2-dashboard': 'High-density dashboard with blueprint theme',
    '/assist': 'AI-powered assistant',
    '/northstar': 'Track your goals and milestones',
    '/motivation': 'Inspirational content and quotes',
    '/hyrox': 'HYROX training workouts',
    '/daily-fitness': 'Daily fitness tracking',
    '/tasks': 'Manage your todo list',
    '/add-task': 'Create new tasks',
    '/radar': 'Visualize task priorities',
    '/contacts': 'People and contacts management',
    '/shipments': 'Track shipments and deliveries',
    '/settings': 'Application settings and preferences',
  }

  return descriptions[url] || `Access ${title} features`
}
