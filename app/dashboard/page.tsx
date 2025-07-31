import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { getFitnessStats, getTodoStats } from "@/lib/analytics"
import { FitnessStatsCard } from "@/components/fitness-stats-card"
import { TodoStatsCard } from "@/components/todo-stats-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, Dumbbell } from "lucide-react"
import Link from "next/link"

async function DashboardContent() {
  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  const [fitnessStats, todoStats] = await Promise.all([getFitnessStats(), getTodoStats()])

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex items-center space-x-2">
          <Button asChild>
            <Link href="/add-task">
              <Plus className="mr-2 h-4 w-4" />
              Add Task
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/add-fitness">
              <Dumbbell className="mr-2 h-4 w-4" />
              Add Fitness
            </Link>
          </Button>
        </div>
      </div>

      {/* Daily Fitness Stats */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Daily Fitness Stats</h3>
          <p className="text-sm text-muted-foreground">Track your fitness task completion patterns</p>
        </div>
        <FitnessStatsCard stats={fitnessStats} />
      </div>

      {/* Todo Tasks */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Todo Tasks</h3>
          <p className="text-sm text-muted-foreground">Your task completion overview</p>
        </div>
        <TodoStatsCard stats={todoStats} />
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <Skeleton className="h-9 w-48" />
        <div className="flex items-center space-x-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}
