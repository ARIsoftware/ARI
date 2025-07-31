import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Calendar, Target } from "lucide-react"
import type { TodoStats } from "@/lib/analytics"

interface TodoStatsCardProps {
  stats: TodoStats
}

export function TodoStatsCard({ stats }: TodoStatsCardProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Completed This Week */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Completed This Week</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.completedThisWeek}</div>
          <p className="text-xs text-muted-foreground">Tasks finished in last 7 days</p>
        </CardContent>
      </Card>

      {/* Total Tasks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalTasks}</div>
          <p className="text-xs text-muted-foreground">All tasks in your system</p>
        </CardContent>
      </Card>

      {/* Completion Rate */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{stats.completionRate}%</span>
              <Badge
                variant={stats.completionRate >= 70 ? "default" : stats.completionRate >= 40 ? "secondary" : "outline"}
              >
                {stats.completionRate >= 70 ? "Great!" : stats.completionRate >= 40 ? "Good" : "Keep going!"}
              </Badge>
            </div>
            <Progress value={stats.completionRate} className="h-2" />
            <p className="text-xs text-muted-foreground">Overall completion progress</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
