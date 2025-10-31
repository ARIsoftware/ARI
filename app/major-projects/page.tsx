'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/components/providers'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { TaskAnnouncement } from '@/components/task-announcement'
import { Loader2, Plus, Pencil, Trash2, Calendar, TrendingUp, Briefcase, Clock, Sparkles } from 'lucide-react'
import { getMajorProjects, createMajorProject, updateMajorProject, deleteMajorProject, type MajorProject } from '@/lib/major-projects'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

export default function MajorProjectsPage() {
  const { session } = useSupabase()
  const { toast } = useToast()
  const router = useRouter()
  const [projects, setProjects] = useState<MajorProject[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<MajorProject | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectDueDate, setProjectDueDate] = useState('')

  // Load projects
  useEffect(() => {
    async function loadProjects() {
      if (!session?.user?.id) {
        setLoading(false)
        return
      }

      try {
        const data = await getMajorProjects()
        setProjects(data)
      } catch (error: any) {
        console.error('Error loading projects:', error)
        toast({
          title: 'Error',
          description: error.message || 'Failed to load projects',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }

    if (session) {
      loadProjects()
    }
  }, [session, toast])

  const handleOpenDialog = (project?: MajorProject) => {
    if (project) {
      setEditingProject(project)
      setProjectName(project.project_name)
      setProjectDescription(project.project_description || '')
      setProjectDueDate(project.project_due_date || '')
    } else {
      setEditingProject(null)
      setProjectName('')
      setProjectDescription('')
      setProjectDueDate('')
    }
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingProject(null)
    setProjectName('')
    setProjectDescription('')
    setProjectDueDate('')
  }

  const handleSubmit = async () => {
    if (!projectName.trim()) {
      toast({
        title: 'Error',
        description: 'Project name is required',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      if (editingProject) {
        // Update existing project
        const updated = await updateMajorProject(
          editingProject.id,
          projectName.trim(),
          projectDescription.trim() || null,
          projectDueDate || null
        )
        setProjects(projects.map(p => (p.id === updated.id ? updated : p)))
        toast({
          title: 'Success',
          description: 'Project updated successfully',
        })
      } else {
        // Create new project
        const newProject = await createMajorProject(
          projectName.trim(),
          projectDescription.trim() || null,
          projectDueDate || null
        )
        setProjects([...projects, newProject])
        toast({
          title: 'Success',
          description: 'Project created successfully',
        })
      }
      handleCloseDialog()
    } catch (error: any) {
      console.error('Error saving project:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to save project',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) {
      return
    }

    try {
      await deleteMajorProject(id)
      setProjects(projects.filter(p => p.id !== id))
      toast({
        title: 'Success',
        description: 'Project deleted successfully',
      })
    } catch (error: any) {
      console.error('Error deleting project:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete project',
        variant: 'destructive',
      })
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No due date'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getDaysUntilDue = (dateString: string | null) => {
    if (!dateString) return null
    const now = new Date()
    const due = new Date(dateString)
    const diffTime = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const getStatusColor = (dateString: string | null) => {
    const days = getDaysUntilDue(dateString)
    if (days === null) return 'text-gray-500'
    if (days < 0) return 'text-red-500'
    if (days <= 7) return 'text-orange-500'
    if (days <= 30) return 'text-yellow-600'
    return 'text-green-600'
  }

  const getStatusIcon = (dateString: string | null) => {
    const days = getDaysUntilDue(dateString)
    if (days === null) return null
    if (days < 0) return '⚠️'
    if (days <= 7) return '🔥'
    if (days <= 30) return '⏰'
    return '✨'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <TaskAnnouncement />
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <div className="flex items-center justify-center h-96">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <TaskAnnouncement />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Major Projects</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-8 p-8">
            <div className="max-w-7xl mx-auto w-full">
              {/* Header */}
              <div className="flex justify-between items-start mb-12">
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-black flex items-center justify-center shadow-lg">
                      <Briefcase className="h-7 w-7 text-white" />
                    </div>
                    <div>
                      <h1 className="text-4xl font-bold tracking-tight text-black mb-1">
                        Major Projects
                      </h1>
                      <p className="text-base text-muted-foreground font-medium">Track and deliver on your most important initiatives</p>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => handleOpenDialog()}
                  size="lg"
                  className="shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 px-6 h-12 font-semibold"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  New Project
                </Button>
              </div>

              {/* Stats Row */}
              {projects.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                  <Card className="relative overflow-hidden shadow-md hover:shadow-xl transition-all duration-300">
                    <div className="absolute top-0 left-0 w-1 h-full bg-black" />
                    <CardContent className="pt-6 pb-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Projects</p>
                          <p className="text-4xl font-bold tracking-tight">{projects.length}</p>
                        </div>
                        <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center">
                          <Briefcase className="h-6 w-6 text-gray-700" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="relative overflow-hidden shadow-md hover:shadow-xl transition-all duration-300">
                    <div className="absolute top-0 left-0 w-1 h-full bg-gray-700" />
                    <CardContent className="pt-6 pb-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Due Soon</p>
                          <p className="text-4xl font-bold tracking-tight">
                            {projects.filter(p => {
                              const days = getDaysUntilDue(p.project_due_date)
                              return days !== null && days >= 0 && days <= 7
                            }).length}
                          </p>
                        </div>
                        <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center">
                          <Clock className="h-6 w-6 text-gray-700" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="relative overflow-hidden shadow-md hover:shadow-xl transition-all duration-300">
                    <div className="absolute top-0 left-0 w-1 h-full bg-gray-400" />
                    <CardContent className="pt-6 pb-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">On Track</p>
                          <p className="text-4xl font-bold tracking-tight">
                            {projects.filter(p => {
                              const days = getDaysUntilDue(p.project_due_date)
                              return days !== null && days > 7
                            }).length}
                          </p>
                        </div>
                        <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center">
                          <Sparkles className="h-6 w-6 text-gray-700" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Projects Grid */}
              {projects.length === 0 ? (
                <Card className="border-2 border-dashed border-gray-300 shadow-sm hover:shadow-md transition-all duration-300">
                  <CardContent className="flex flex-col items-center justify-center py-20 px-6">
                    <div className="h-24 w-24 rounded-3xl bg-gray-100 flex items-center justify-center mb-8">
                      <Briefcase className="h-12 w-12 text-gray-600" />
                    </div>
                    <h3 className="text-3xl font-bold mb-3 text-gray-900 tracking-tight">No projects yet</h3>
                    <p className="text-muted-foreground mb-8 text-center max-w-md text-lg leading-relaxed">
                      Start tracking your major initiatives and keep your most important work organized in one place
                    </p>
                    <Button
                      onClick={() => handleOpenDialog()}
                      size="lg"
                      className="shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 px-8 h-12 font-semibold"
                    >
                      <Plus className="mr-2 h-5 w-5" />
                      Create Your First Project
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.map(project => {
                    const days = getDaysUntilDue(project.project_due_date)
                    const statusIcon = getStatusIcon(project.project_due_date)

                    // Determine border weight and badge
                    let borderWeight = 'h-0.5'
                    let badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline'
                    let badgeText = 'Active'

                    if (days !== null) {
                      if (days < 0) {
                        borderWeight = 'h-1'
                        badgeVariant = 'default'
                        badgeText = 'Overdue'
                      } else if (days <= 7) {
                        borderWeight = 'h-1'
                        badgeVariant = 'secondary'
                        badgeText = 'Due Soon'
                      } else if (days <= 30) {
                        borderWeight = 'h-0.5'
                        badgeVariant = 'secondary'
                        badgeText = 'Upcoming'
                      } else {
                        borderWeight = 'h-0.5'
                        badgeVariant = 'outline'
                        badgeText = 'Active'
                      }
                    }

                    return (
                      <Card
                        key={project.id}
                        className="relative shadow-md hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 group overflow-hidden"
                      >
                        {/* Top border */}
                        <div className={`absolute top-0 left-0 right-0 ${borderWeight} bg-black`} />

                        {/* Background on hover */}
                        <div className="absolute inset-0 bg-gray-50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                        <CardHeader className="pb-4 relative z-10 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <Badge variant={badgeVariant} className="font-semibold text-xs px-3 py-1">
                              {badgeText}
                            </Badge>
                            {statusIcon && (
                              <span className="text-2xl group-hover:scale-110 transition-transform duration-300">{statusIcon}</span>
                            )}
                          </div>
                          <CardTitle className="text-xl font-bold line-clamp-2 leading-tight transition-colors duration-300">
                            {project.project_name}
                          </CardTitle>
                        </CardHeader>

                        <CardContent className="relative z-10 space-y-5">
                          {project.project_description ? (
                            <CardDescription className="line-clamp-3 min-h-[4.5rem] text-sm leading-relaxed">
                              {project.project_description}
                            </CardDescription>
                          ) : (
                            <div className="min-h-[4.5rem] flex items-center">
                              <p className="text-sm text-muted-foreground italic">No description provided</p>
                            </div>
                          )}

                          <div className="space-y-3 pt-2">
                            <div className="flex items-center gap-3 text-sm font-semibold bg-gray-50 rounded-xl p-3 group-hover:bg-white transition-colors">
                              <div className="h-8 w-8 rounded-lg bg-white shadow-sm flex items-center justify-center border">
                                <Calendar className="h-4 w-4" />
                              </div>
                              <span>{formatDate(project.project_due_date)}</span>
                            </div>

                            <Button
                              variant="outline"
                              onClick={() => router.push(`/tasks?filter=${project.id}`)}
                              className="w-full text-sm font-bold text-center py-3 bg-white rounded-xl border-2 shadow-sm hover:bg-gray-50 hover:shadow-md transition-all duration-300 h-auto"
                            >
                              View Tasks
                            </Button>
                          </div>

                          <div className="flex gap-3 pt-5 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDialog(project)}
                              className="flex-1 transition-all duration-300 font-medium shadow-sm"
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(project.id)}
                              className="transition-all duration-300 shadow-sm"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b bg-gray-50">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-black flex items-center justify-center shadow-lg">
                <Briefcase className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold tracking-tight">
                  {editingProject ? 'Edit Project' : 'Create New Project'}
                </DialogTitle>
                <DialogDescription className="text-sm mt-1">
                  {editingProject
                    ? 'Update the details of your project'
                    : 'Add a new major project to track and manage'}
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Form content */}
          <div className="p-6 space-y-6">
            <div className="space-y-2.5">
              <Label htmlFor="name" className="text-sm font-bold flex items-center gap-2">
                Project Name <span className="text-gray-500 text-xs">*</span>
              </Label>
              <Input
                id="name"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="e.g., Website Redesign, Product Launch"
                className="h-11"
              />
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="description" className="text-sm font-bold">
                Description
              </Label>
              <Textarea
                id="description"
                value={projectDescription}
                onChange={e => setProjectDescription(e.target.value)}
                placeholder="Describe your project goals, key deliverables, and success metrics..."
                rows={5}
                className="resize-none"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Optional but recommended for clarity
                </p>
                <p className="text-xs text-muted-foreground font-medium">
                  {projectDescription.length}/2000
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="dueDate" className="text-sm font-bold flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Due Date
              </Label>
              <Input
                id="dueDate"
                type="date"
                value={projectDueDate}
                onChange={e => setProjectDueDate(e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Set a target completion date to track progress
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 p-6 bg-gray-50 border-t">
            <Button
              variant="outline"
              onClick={handleCloseDialog}
              disabled={submitting}
              className="flex-1 h-11 font-medium"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 h-11 shadow-lg hover:shadow-xl transition-all duration-300 font-semibold"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Saving...
                </>
              ) : editingProject ? (
                <>
                  <Pencil className="mr-2 h-5 w-5" />
                  Update Project
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-5 w-5" />
                  Create Project
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
