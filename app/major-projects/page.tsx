'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/components/providers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { TaskAnnouncement } from '@/components/task-announcement'
import { Loader2, Plus, Pencil, Trash2, Calendar, TrendingUp } from 'lucide-react'
import { getMajorProjects, createMajorProject, updateMajorProject, deleteMajorProject, type MajorProject } from '@/lib/major-projects'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export default function MajorProjectsPage() {
  const { session } = useSupabase()
  const { toast } = useToast()
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

          <div className="flex flex-1 flex-col gap-6 p-6">
            <div className="max-w-7xl mx-auto w-full">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h1 className="text-3xl font-bold mb-1">Major Projects</h1>
                  <p className="text-muted-foreground">Track and manage your most important projects</p>
                </div>
                <Button onClick={() => handleOpenDialog()} size="lg">
                  <Plus className="mr-2 h-4 w-4" />
                  New Project
                </Button>
              </div>

              {/* Projects Grid */}
              {projects.length === 0 ? (
                <Card className="p-12">
                  <div className="text-center">
                    <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
                    <p className="text-muted-foreground mb-4">Create your first major project to get started</p>
                    <Button onClick={() => handleOpenDialog()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Project
                    </Button>
                  </div>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {projects.map(project => {
                    const days = getDaysUntilDue(project.project_due_date)
                    const statusIcon = getStatusIcon(project.project_due_date)
                    const statusColor = getStatusColor(project.project_due_date)

                    return (
                      <Card key={project.id} className="relative hover:shadow-lg transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-lg line-clamp-2">{project.project_name}</CardTitle>
                            {statusIcon && <span className="text-xl">{statusIcon}</span>}
                          </div>
                        </CardHeader>
                        <CardContent>
                          {project.project_description && (
                            <CardDescription className="mb-3 line-clamp-3 min-h-[3.5rem]">
                              {project.project_description}
                            </CardDescription>
                          )}

                          <div className={`flex items-center gap-2 text-sm font-medium ${statusColor} mb-4`}>
                            <Calendar className="h-4 w-4" />
                            <span>{formatDate(project.project_due_date)}</span>
                          </div>

                          {days !== null && (
                            <div className={`text-sm ${statusColor} font-semibold mb-4`}>
                              {days < 0
                                ? `${Math.abs(days)} days overdue`
                                : days === 0
                                ? 'Due today'
                                : `${days} days remaining`}
                            </div>
                          )}

                          <div className="flex gap-2 pt-3 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDialog(project)}
                              className="flex-1"
                            >
                              <Pencil className="mr-2 h-3 w-3" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(project.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Edit Project' : 'Create New Project'}</DialogTitle>
            <DialogDescription>
              {editingProject
                ? 'Update the details of your project'
                : 'Add a new major project to track'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="Enter project name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={projectDescription}
                onChange={e => setProjectDescription(e.target.value)}
                placeholder="Enter project description"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={projectDueDate}
                onChange={e => setProjectDueDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingProject ? (
                'Update Project'
              ) : (
                'Create Project'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
