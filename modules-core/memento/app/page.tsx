'use client'

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Grid3X3, Calendar, Sparkles, Clock, Plus, Trash2, Edit2, Shuffle, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  useMementoSettings,
  useSaveMementoSettings,
  useMementoMilestones,
  useCreateMementoMilestone,
  useDeleteMementoMilestone,
  useMementoEras,
  useCreateMementoEra,
  useUpdateMementoEra,
  useDeleteMementoEra
} from '@/lib/hooks/use-memento'
import {
  generateWeekData,
  calculateLifeStats,
  getOnThisWeekMilestones,
  getRandomMilestone,
  formatDateRange,
  formatWeekAsYearWeek,
  getYearForWeek,
  getWeekStartDate
} from '../lib/utils'
import type { MementoMilestone, MementoEra, WeekData } from '../types'
import { MILESTONE_CATEGORIES, ERA_COLORS } from '../types'

export default function MementoPage() {
  const { toast } = useToast()

  // Data fetching
  const { data: settings, isLoading: settingsLoading } = useMementoSettings()
  const { data: milestones = [], isLoading: milestonesLoading } = useMementoMilestones()
  const { data: eras = [], isLoading: erasLoading } = useMementoEras()

  // Mutations
  const saveSettings = useSaveMementoSettings()
  const createMilestone = useCreateMementoMilestone()
  const deleteMilestone = useDeleteMementoMilestone()
  const createEra = useCreateMementoEra()
  const updateEra = useUpdateMementoEra()
  const deleteEra = useDeleteMementoEra()

  // UI State
  const [setupBirthdate, setSetupBirthdate] = useState('')
  const [setupLifespan, setSetupLifespan] = useState('80')
  const [selectedWeek, setSelectedWeek] = useState<WeekData | null>(null)
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false)
  const [eraModalOpen, setEraModalOpen] = useState(false)
  const [editingEra, setEditingEra] = useState<MementoEra | null>(null)
  const [viewYear, setViewYear] = useState<number | null>(null) // null = overview
  const [randomMilestone, setRandomMilestone] = useState<MementoMilestone | null>(null)

  // Milestone form state
  const [milestoneTitle, setMilestoneTitle] = useState('')
  const [milestoneDescription, setMilestoneDescription] = useState('')
  const [milestoneCategory, setMilestoneCategory] = useState('')
  const [milestoneMood, setMilestoneMood] = useState('')

  // Era form state
  const [eraName, setEraName] = useState('')
  const [eraStartDate, setEraStartDate] = useState('')
  const [eraEndDate, setEraEndDate] = useState('')
  const [eraColor, setEraColor] = useState(ERA_COLORS[0])

  const isLoading = settingsLoading || milestonesLoading || erasLoading

  // Computed data
  const weekData = useMemo(() => {
    if (!settings?.birthdate) return []
    const birthDate = new Date(settings.birthdate)
    return generateWeekData(birthDate, settings.target_lifespan, milestones, eras)
  }, [settings, milestones, eras])

  const lifeStats = useMemo(() => {
    if (!settings?.birthdate) return null
    const birthDate = new Date(settings.birthdate)
    return calculateLifeStats(birthDate, settings.target_lifespan, milestones, eras)
  }, [settings, milestones, eras])

  const onThisWeekMilestones = useMemo(() => {
    if (!settings?.birthdate) return []
    const birthDate = new Date(settings.birthdate)
    return getOnThisWeekMilestones(birthDate, milestones)
  }, [settings, milestones])

  const currentWeekNumber = useMemo(() => {
    if (!settings?.birthdate) return 0
    const birthDate = new Date(settings.birthdate)
    const now = new Date()
    const msPerWeek = 7 * 24 * 60 * 60 * 1000
    return Math.floor((now.getTime() - birthDate.getTime()) / msPerWeek)
  }, [settings])

  const currentYear = useMemo(() => getYearForWeek(currentWeekNumber), [currentWeekNumber])

  // Handlers
  const handleSetup = async () => {
    if (!setupBirthdate) {
      toast({ variant: 'destructive', title: 'Please enter your birthdate' })
      return
    }

    saveSettings.mutate(
      { birthdate: setupBirthdate, target_lifespan: parseInt(setupLifespan) },
      {
        onError: () => toast({ variant: 'destructive', title: 'Failed to save settings' })
      }
    )
  }

  const handleWeekClick = useCallback((week: WeekData) => {
    setSelectedWeek(week)
    if (week.milestone) {
      setMilestoneTitle(week.milestone.title)
      setMilestoneDescription(week.milestone.description || '')
      setMilestoneCategory(week.milestone.category || '')
      setMilestoneMood(week.milestone.mood?.toString() || '')
    } else {
      setMilestoneTitle('')
      setMilestoneDescription('')
      setMilestoneCategory('')
      setMilestoneMood('')
    }
    setMilestoneModalOpen(true)
  }, [])

  const handleSaveMilestone = () => {
    if (!selectedWeek || !milestoneTitle.trim()) {
      toast({ variant: 'destructive', title: 'Please enter a title' })
      return
    }

    setMilestoneModalOpen(false)

    createMilestone.mutate(
      {
        week_number: selectedWeek.weekNumber,
        title: milestoneTitle.trim(),
        description: milestoneDescription.trim() || undefined,
        category: milestoneCategory || undefined,
        mood: milestoneMood ? parseInt(milestoneMood) : undefined
      },
      {
        onError: () => toast({ variant: 'destructive', title: 'Failed to save milestone' })
      }
    )
  }

  const handleDeleteMilestone = () => {
    if (!selectedWeek?.milestone) return

    setMilestoneModalOpen(false)

    deleteMilestone.mutate(selectedWeek.milestone.id, {
      onError: () => toast({ variant: 'destructive', title: 'Failed to delete milestone' })
    })
  }

  const handleOpenEraModal = (era?: MementoEra) => {
    if (era) {
      setEditingEra(era)
      setEraName(era.name)
      setEraStartDate(era.start_date)
      setEraEndDate(era.end_date)
      setEraColor(era.color)
    } else {
      setEditingEra(null)
      setEraName('')
      setEraStartDate('')
      setEraEndDate('')
      setEraColor(ERA_COLORS[0])
    }
    setEraModalOpen(true)
  }

  const handleSaveEra = () => {
    if (!eraName.trim() || !eraStartDate || !eraEndDate) {
      toast({ variant: 'destructive', title: 'Please fill all required fields' })
      return
    }

    setEraModalOpen(false)

    if (editingEra) {
      updateEra.mutate(
        { id: editingEra.id, name: eraName.trim(), start_date: eraStartDate, end_date: eraEndDate, color: eraColor },
        { onError: () => toast({ variant: 'destructive', title: 'Failed to update era' }) }
      )
    } else {
      createEra.mutate(
        { name: eraName.trim(), start_date: eraStartDate, end_date: eraEndDate, color: eraColor },
        { onError: () => toast({ variant: 'destructive', title: 'Failed to create era' }) }
      )
    }
  }

  const handleDeleteEra = (id: string) => {
    deleteEra.mutate(id, {
      onError: () => toast({ variant: 'destructive', title: 'Failed to delete era' })
    })
  }

  const handleRandomMilestone = () => {
    const random = getRandomMilestone(milestones)
    setRandomMilestone(random || null)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Setup screen (no settings yet)
  if (!settings) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Grid3X3 className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Welcome to Memento</CardTitle>
            <CardDescription>
              Visualize your life as a grid of weeks. Each box represents one week of your life.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="birthdate">Your Birthdate</Label>
              <Input
                id="birthdate"
                type="date"
                value={setupBirthdate}
                onChange={(e) => setSetupBirthdate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lifespan">Target Lifespan (years)</Label>
              <Select value={setupLifespan} onValueChange={setSetupLifespan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[70, 75, 80, 85, 90, 95, 100].map(age => (
                    <SelectItem key={age} value={age.toString()}>{age} years</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={handleSetup}
              disabled={saveSettings.isPending}
            >
              {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Start My Life Grid
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Main view
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-medium">Life Grid</h1>
          <p className="text-muted-foreground mt-1">
            {lifeStats && `${lifeStats.weeksLived.toLocaleString()} weeks lived, ${lifeStats.weeksRemaining.toLocaleString()} to go`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRandomMilestone}>
            <Shuffle className="w-4 h-4 mr-2" />
            Random Memory
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleOpenEraModal()}>
            <Plus className="w-4 h-4 mr-2" />
            Add Era
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {lifeStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{lifeStats.percentageLived.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Life Lived</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{lifeStats.weeksLived.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Weeks Lived</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{lifeStats.milestonesCount}</div>
              <p className="text-xs text-muted-foreground">Milestones</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{lifeStats.erasCount}</div>
              <p className="text-xs text-muted-foreground">Life Eras</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="grid" className="space-y-4">
        <TabsList>
          <TabsTrigger value="grid">Life Grid</TabsTrigger>
          <TabsTrigger value="eras">Eras</TabsTrigger>
          <TabsTrigger value="reflections">Reflections</TabsTrigger>
        </TabsList>

        {/* Life Grid Tab */}
        <TabsContent value="grid" className="space-y-4">
          {/* Navigation for zoomed view */}
          {viewYear !== null && (
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setViewYear(null)}>
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back to Overview
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewYear(Math.max(0, viewYear - 1))}
                  disabled={viewYear === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="font-medium">Year {viewYear}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewYear(viewYear + 1)}
                  disabled={viewYear >= (settings.target_lifespan - 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <Button variant="outline" onClick={() => setViewYear(currentYear)}>
                <Clock className="w-4 h-4 mr-2" />
                Current Year
              </Button>
            </div>
          )}

          {/* Grid Display */}
          <Card>
            <CardContent className="pt-6">
              {viewYear === null ? (
                // Overview mode - compact grid showing all years
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    Each row is one year (52 weeks). Click a year to zoom in.
                  </p>
                  <div className="space-y-1">
                    {Array.from({ length: settings.target_lifespan }).map((_, yearIndex) => {
                      const yearWeeks = weekData.slice(yearIndex * 52, (yearIndex + 1) * 52)
                      const isCurrentYear = yearIndex === currentYear

                      return (
                        <div
                          key={yearIndex}
                          className={`flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded p-1 ${isCurrentYear ? 'bg-primary/5' : ''}`}
                          onClick={() => setViewYear(yearIndex)}
                        >
                          <span className="text-xs text-muted-foreground w-8">{yearIndex}</span>
                          <div className="flex gap-px flex-1">
                            {yearWeeks.map((week) => (
                              <div
                                key={week.weekNumber}
                                className={`h-2 flex-1 rounded-sm transition-colors ${
                                  week.isCurrent
                                    ? 'bg-primary ring-1 ring-primary ring-offset-1'
                                    : week.milestone
                                    ? 'bg-yellow-500'
                                    : week.era
                                    ? ''
                                    : week.isLived
                                    ? 'bg-foreground/20'
                                    : 'bg-muted'
                                }`}
                                style={week.era && !week.milestone && !week.isCurrent ? { backgroundColor: week.era.color + '40' } : undefined}
                                title={`Week ${week.weekNumber}: ${formatDateRange(week.startDate, week.endDate)}`}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-4">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-sm bg-foreground/20" />
                      <span>Lived</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-sm bg-muted" />
                      <span>Future</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-sm bg-primary" />
                      <span>Current</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-sm bg-yellow-500" />
                      <span>Milestone</span>
                    </div>
                  </div>
                </div>
              ) : (
                // Zoomed year view - larger interactive grid
                <div className="space-y-4">
                  <div className="grid grid-cols-13 gap-1">
                    {/* Header row with week numbers */}
                    <div className="text-xs text-muted-foreground text-center">Week</div>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="text-xs text-muted-foreground text-center">{i * 4 + 1}-{Math.min((i + 1) * 4, 52)}</div>
                    ))}
                    {/* Weeks grid - 4 rows of 13 columns */}
                    {Array.from({ length: 4 }).map((_, rowIndex) => (
                      <>
                        <div key={`label-${rowIndex}`} className="text-xs text-muted-foreground flex items-center">
                          {rowIndex === 0 ? 'Q1' : rowIndex === 1 ? 'Q2' : rowIndex === 2 ? 'Q3' : 'Q4'}
                        </div>
                        {Array.from({ length: 13 }).map((_, colIndex) => {
                          const weekIndex = viewYear * 52 + rowIndex * 13 + colIndex
                          const week = weekData[weekIndex]
                          if (!week) return <div key={colIndex} />

                          return (
                            <div
                              key={colIndex}
                              className={`aspect-square rounded cursor-pointer transition-all hover:scale-110 hover:ring-2 hover:ring-primary ${
                                week.isCurrent
                                  ? 'bg-primary animate-pulse'
                                  : week.milestone
                                  ? 'bg-yellow-500'
                                  : week.era
                                  ? ''
                                  : week.isLived
                                  ? 'bg-foreground/30'
                                  : 'bg-muted'
                              }`}
                              style={week.era && !week.milestone && !week.isCurrent ? { backgroundColor: week.era.color } : undefined}
                              onClick={() => handleWeekClick(week)}
                              title={`${formatWeekAsYearWeek(week.weekNumber)}\n${formatDateRange(week.startDate, week.endDate)}${week.milestone ? '\n' + week.milestone.title : ''}`}
                            />
                          )
                        })}
                      </>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Eras Tab */}
        <TabsContent value="eras" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Life Eras</CardTitle>
              <CardDescription>Define chapters of your life to color-code your grid</CardDescription>
            </CardHeader>
            <CardContent>
              {eras.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No eras defined yet.</p>
                  <Button variant="outline" className="mt-4" onClick={() => handleOpenEraModal()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Era
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {eras.map(era => (
                    <div key={era.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: era.color }} />
                        <div>
                          <p className="font-medium">{era.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(era.start_date).toLocaleDateString()} - {new Date(era.end_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenEraModal(era)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteEra(era.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reflections Tab */}
        <TabsContent value="reflections" className="space-y-4">
          {/* Weekly Prompt */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                This Week&apos;s Reflection
              </CardTitle>
              <CardDescription>What made this week meaningful?</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const currentWeek = weekData.find(w => w.isCurrent)
                if (currentWeek?.milestone) {
                  return (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="font-medium">{currentWeek.milestone.title}</p>
                      {currentWeek.milestone.description && (
                        <p className="text-sm text-muted-foreground mt-1">{currentWeek.milestone.description}</p>
                      )}
                      <Button variant="link" className="p-0 h-auto mt-2" onClick={() => handleWeekClick(currentWeek)}>
                        Edit this week&apos;s entry
                      </Button>
                    </div>
                  )
                }
                return (
                  <Button variant="outline" onClick={() => {
                    const currentWeek = weekData.find(w => w.isCurrent)
                    if (currentWeek) handleWeekClick(currentWeek)
                  }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add This Week&apos;s Milestone
                  </Button>
                )
              })()}
            </CardContent>
          </Card>

          {/* On This Week */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                On This Week (Previous Years)
              </CardTitle>
              <CardDescription>What were you doing during this week in past years?</CardDescription>
            </CardHeader>
            <CardContent>
              {onThisWeekMilestones.length === 0 ? (
                <p className="text-muted-foreground">No milestones from this week in previous years.</p>
              ) : (
                <div className="space-y-2">
                  {onThisWeekMilestones.map(m => (
                    <div key={m.id} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{formatWeekAsYearWeek(m.week_number)}</span>
                        {m.category && <span className="text-xs bg-background px-2 py-0.5 rounded">{m.category}</span>}
                      </div>
                      <p className="font-medium mt-1">{m.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Random Milestone */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shuffle className="w-5 h-5" />
                Random Memory
              </CardTitle>
              <CardDescription>Resurface a memory from your past</CardDescription>
            </CardHeader>
            <CardContent>
              {randomMilestone ? (
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{formatWeekAsYearWeek(randomMilestone.week_number)}</span>
                    {randomMilestone.category && <span className="text-xs bg-background px-2 py-0.5 rounded">{randomMilestone.category}</span>}
                  </div>
                  <p className="font-medium">{randomMilestone.title}</p>
                  {randomMilestone.description && (
                    <p className="text-sm text-muted-foreground mt-1">{randomMilestone.description}</p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Click &quot;Random Memory&quot; to resurface a past milestone.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Milestone Modal */}
      <Dialog open={milestoneModalOpen} onOpenChange={setMilestoneModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedWeek?.milestone ? 'Edit Milestone' : 'Add Milestone'}
            </DialogTitle>
            <DialogDescription>
              {selectedWeek && `${formatWeekAsYearWeek(selectedWeek.weekNumber)} (${formatDateRange(selectedWeek.startDate, selectedWeek.endDate)})`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={milestoneTitle}
                onChange={(e) => setMilestoneTitle(e.target.value)}
                placeholder="What made this week memorable?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={milestoneDescription}
                onChange={(e) => setMilestoneDescription(e.target.value)}
                placeholder="Optional details..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={milestoneCategory} onValueChange={setMilestoneCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MILESTONE_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mood">Mood (1-5)</Label>
                <Select value={milestoneMood} onValueChange={setMilestoneMood}>
                  <SelectTrigger>
                    <SelectValue placeholder="Rate..." />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(m => (
                      <SelectItem key={m} value={m.toString()}>{m} - {m === 1 ? 'Difficult' : m === 3 ? 'Neutral' : m === 5 ? 'Amazing' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            {selectedWeek?.milestone && (
              <Button variant="destructive" onClick={handleDeleteMilestone}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
            <Button onClick={handleSaveMilestone} disabled={!milestoneTitle.trim()}>
              Save Milestone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Era Modal */}
      <Dialog open={eraModalOpen} onOpenChange={setEraModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEra ? 'Edit Era' : 'Add Era'}</DialogTitle>
            <DialogDescription>Define a chapter of your life</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="eraName">Era Name *</Label>
              <Input
                id="eraName"
                value={eraName}
                onChange={(e) => setEraName(e.target.value)}
                placeholder="e.g., University Years"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={eraStartDate}
                  onChange={(e) => setEraStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={eraEndDate}
                  onChange={(e) => setEraEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {ERA_COLORS.map(color => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full transition-transform ${eraColor === color ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setEraColor(color)}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveEra} disabled={!eraName.trim() || !eraStartDate || !eraEndDate}>
              {editingEra ? 'Update Era' : 'Create Era'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
