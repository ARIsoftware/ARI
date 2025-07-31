import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, TrendingUp, TrendingDown } from "lucide-react"
import type { FitnessStats } from "@/lib/analytics"

interface FitnessStatsCardProps {
  stats: FitnessStats
}

export function FitnessStatsCard({ stats }: FitnessStatsCardProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Average Per Day */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Average Per Day</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.averagePerDay}</div>
          <p className="text-xs text-muted-foreground">Currently completed tasks</p>
        </CardContent>
      </Card>

      {/* Most Completed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Most Completed</CardTitle>
          <TrendingUp className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.mostCompleted.length > 0 ? (
              stats.mostCompleted.map((task, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm truncate">{task.name}</span>
                  <Badge variant="secondary" className="ml-2">
                    ✓
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No completed tasks</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Least Completed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Least Completed</CardTitle>
          <TrendingDown className="h-4 w-4 text-orange-600" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.leastCompleted.length > 0 ? (
              stats.leastCompleted.map((task, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm truncate">{task.name}</span>
                  <Badge variant="outline" className="ml-2">
                    ○
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">All tasks completed!</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
