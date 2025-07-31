import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { getTasks } from "@/lib/tasks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"
import Link from "next/link"

async function TasksContent() {
  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  const tasks = await getTasks()

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Tasks</h2>
        <Button asChild>
          <Link href="/add-task">
            <Plus className="mr-2 h-4 w-4" />
            Add Task
          </Link>
        </Button>
      </div>

      <div className="grid gap-4">
        {tasks.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No tasks yet</CardTitle>
              <CardDescription>Get started by creating your first task.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/add-task">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Task
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
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        task.status === "Completed"
                          ? "default"
                          : task.status === "In Progress"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {task.status}
                    </Badge>
                    <Badge
                      variant={
                        task.priority === "High" ? "destructive" : task.priority === "Medium" ? "secondary" : "outline"
                      }
                    >
                      {task.priority}
                    </Badge>
                  </div>
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

export default function TasksPage() {
  return (
    <Suspense fallback={<div>Loading tasks...</div>}>
      <TasksContent />
    </Suspense>
  )
}
