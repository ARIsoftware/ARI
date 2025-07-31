import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { getFitnessTasks } from "@/lib/fitness"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"
import Link from "next/link"

async function FitnessContent() {
  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  const tasks = await getFitnessTasks()

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Daily Fitness</h2>
        <Button asChild>
          <Link href="/add-fitness">
            <Plus className="mr-2 h-4 w-4" />
            Add Fitness Task
          </Link>
        </Button>
      </div>

      <div className="grid gap-4">
        {tasks.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No fitness tasks yet</CardTitle>
              <CardDescription>Get started by creating your first fitness task.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/add-fitness">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Fitness Task
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          tasks.map((task) => (
            <Card key={task.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{task.title}</CardTitle>
                  <Badge variant={task.completed ? "default" : "outline"}>
                    {task.completed ? "Completed" : "Pending"}
                  </Badge>
                </div>
                {task.description && <CardDescription>{task.description}</CardDescription>}
              </CardHeader>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

export default function DailyFitnessPage() {
  return (
    <Suspense fallback={<div>Loading fitness tasks...</div>}>
      <FitnessContent />
    </Suspense>
  )
}
