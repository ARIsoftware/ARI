'use client'

import { MapPin, Home, Calendar, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Activity } from '../types'

interface ActivityListProps {
  activities: Activity[]
  onEdit: (activity: Activity) => void
  onDelete: (id: string) => void
}

function openInGoogleMaps(address: string) {
  const encoded = encodeURIComponent(address)
  window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank')
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate)
  const end = new Date(endDate)

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  const startDay = start.getDate()
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
  const endDay = end.getDate()

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`
}

export default function ActivityList({ activities, onEdit, onDelete }: ActivityListProps) {
  // Sort by start_date chronologically
  const sortedActivities = [...activities].sort((a, b) =>
    new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  )

  const stayColor = '#3382cd' // Blue for stays
  const eventColor = '#22c55e' // Green for events

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: stayColor }} />
        <h2 className="text-lg sm:text-xl font-medium">Activities</h2>
      </div>

      <div className="relative">
        {sortedActivities.length === 0 ? (
          <p className="text-center text-muted-foreground py-4 text-sm">
            No activities yet. Click "Add" to create one.
          </p>
        ) : (
          sortedActivities.map((activity, index) => {
            const isStay = activity.activity_type === 'stay'
            const color = isStay ? stayColor : eventColor
            const Icon = isStay ? Home : MapPin

            return (
              <div key={activity.id} className="flex gap-3 sm:gap-4 pb-6 sm:pb-8 last:pb-0 group">
                {/* Timeline line and dot */}
                <div className="flex flex-col items-center shrink-0">
                  <button
                    onClick={() => openInGoogleMaps(activity.address)}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer z-10"
                    style={{ backgroundColor: color }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    title="Open in Google Maps"
                  >
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  {index < sortedActivities.length - 1 && (
                    <div className="w-0.5 flex-1 bg-gray-300 mt-2" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pt-0.5 sm:pt-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">
                        {formatDateRange(activity.start_date, activity.end_date)}
                      </p>
                      <h3 className="font-medium text-sm sm:text-base truncate">{activity.title}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2">
                        {activity.address}
                      </p>
                      <span
                        className="inline-block mt-1.5 sm:mt-2 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: isStay ? '#e0f2fe' : '#dcfce7',
                          color: isStay ? '#0369a1' : '#15803d'
                        }}
                      >
                        {isStay ? 'Stay' : 'Event'}
                      </span>
                    </div>
                    <div className="flex gap-0.5 sm:gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(activity)}
                        className="shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted h-7 w-7 sm:h-9 sm:w-9"
                      >
                        <Pencil className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(activity.id)}
                        className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-7 w-7 sm:h-9 sm:w-9"
                      >
                        <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Legend */}
      {sortedActivities.length > 0 && (
        <div className="flex items-center gap-3 sm:gap-4 pt-3 sm:pt-4 border-t text-xs sm:text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ backgroundColor: stayColor }} />
            <span>Stay</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ backgroundColor: eventColor }} />
            <span>Event</span>
          </div>
        </div>
      )}
    </div>
  )
}
