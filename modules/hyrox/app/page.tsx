"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useSupabase } from "@/components/providers"
import { DM_Sans } from "next/font/google"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trophy, Target, TrendingUp, Clock, Activity, Play, Pause, SkipForward, CheckCircle, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { YouTubeModal } from "@/components/youtube-modal"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import {
  getHyroxStationRecords,
  getHyroxWorkoutHistory,
  createHyroxWorkout,
  addWorkoutStation,
  updateStationRecord,
  completeHyroxWorkout,
  calculateProgress,
  formatTime as formatTimeUtil,
  getTimeDifference,
  type HyroxStationRecord,
  type HyroxWorkout,
} from "@/modules/hyrox/lib/hyrox-client"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})


// Hyrox workout structure
const workoutStations = [
  { type: "exercise", name: "Running", target: "8000m", order: 1 },
  { type: "run", name: "1km Run", target: "1000m", order: 2 },
  { type: "exercise", name: "SkiErg", target: "1000m", order: 3 },
  { type: "run", name: "1km Run", target: "1000m", order: 4 },
  { type: "exercise", name: "Sled Push", target: "50m", order: 5 },
  { type: "run", name: "1km Run", target: "1000m", order: 6 },
  { type: "exercise", name: "Sled Pull", target: "50m", order: 7 },
  { type: "run", name: "1km Run", target: "1000m", order: 8 },
  { type: "exercise", name: "Burpee Broad Jump", target: "80m", order: 9 },
  { type: "run", name: "1km Run", target: "1000m", order: 10 },
  { type: "exercise", name: "Rowing", target: "1000m", order: 11 },
  { type: "run", name: "1km Run", target: "1000m", order: 12 },
  { type: "exercise", name: "Farmers Carry", target: "200m", order: 13 },
  { type: "run", name: "1km Run", target: "1000m", order: 14 },
  { type: "exercise", name: "Sandbag Lunges", target: "100m", order: 15 },
  { type: "run", name: "1km Run", target: "1000m", order: 16 },
  { type: "exercise", name: "Wall Balls", target: "100 reps", order: 17 },
]

export default function HyroxPage() {
  const { session, supabase } = useSupabase()
  const user = session?.user
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("station-records")
  const [workoutActive, setWorkoutActive] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [currentStation, setCurrentStation] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [stationStartTime, setStationStartTime] = useState(0)
  const [stationTimes, setStationTimes] = useState<Array<{ name: string; time: number }>>([])
  const [stationRecords, setStationRecords] = useState<HyroxStationRecord[]>([])
  const [currentWorkout, setCurrentWorkout] = useState<HyroxWorkout | null>(null)
  const [lastWorkout, setLastWorkout] = useState<HyroxWorkout | null>(null)
  const [loading, setLoading] = useState(true)
  const [videoModalOpen, setVideoModalOpen] = useState(false)
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string>("")
  const [selectedVideoTitle, setSelectedVideoTitle] = useState<string>("")
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Load station records from Supabase
  useEffect(() => {
    if (user?.id) {
      loadStationRecords()
      setupRealtimeSubscription()
    }
  }, [user])

  const loadStationRecords = async () => {
    if (!user?.id) return
    
    try {
      setLoading(true)
      const [records, workoutHistory] = await Promise.all([
        getHyroxStationRecords(user.id),
        getHyroxWorkoutHistory(user.id, 1) // Get last workout
      ])
      console.log('Loaded station records:', records)
      
      // Ensure records have valid best_time values
      const validRecords = records.map(record => ({
        ...record,
        best_time: record.best_time || 0,
        goal_time: record.goal_time || 0
      }))
      
      setStationRecords(validRecords)
      setLastWorkout(workoutHistory[0] || null)
    } catch (error) {
      console.error('Error loading data:', error)
      toast({
        title: "Error",
        description: "Failed to load station records",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const setupRealtimeSubscription = () => {
    if (!user?.id) return

    const channel = supabase
      .channel('hyrox-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hyrox_station_records',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Station record update:', payload)
          loadStationRecords()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  // Calculate metrics from station records
  const calculateMetrics = () => {
    if (!stationRecords || stationRecords.length === 0) {
      return {
        bestImprovement: null,
        mostConsistent: null,
        nextTarget: null,
        goalProgress: []
      }
    }

    const exerciseRecords = stationRecords.filter(r => r.station_type === 'exercise')

    const bestImprovement = exerciseRecords.reduce((best, record) => {
      const timeDiff = Math.abs(record.best_time - record.goal_time) / 1000
      const bestDiff = best ? Math.abs(best.best_time - best.goal_time) / 1000 : 0
      return timeDiff > bestDiff ? record : best
    }, exerciseRecords[0])

    const mostConsistent = exerciseRecords.reduce((most, record) => {
      const progress = calculateProgress(record.best_time, record.goal_time)
      const mostProgress = most ? calculateProgress(most.best_time, most.goal_time) : 0
      return progress > mostProgress ? record : most
    }, exerciseRecords[0])

    const nextTarget = exerciseRecords.reduce((next, record) => {
      const timeDiff = Math.abs(record.best_time - record.goal_time) / 1000
      const nextDiff = next ? Math.abs(next.best_time - next.goal_time) / 1000 : Infinity
      return timeDiff < nextDiff ? record : next
    }, exerciseRecords[0])

    const orderedRecords = exerciseRecords.sort((a, b) => {
      const order = ['Running', 'SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Rowing', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls']
      return order.indexOf(a.station_name) - order.indexOf(b.station_name)
    })

    const goalProgress = orderedRecords.slice(0, 4).map(record => ({
      name: record.station_name,
      percentage: calculateProgress(record.best_time, record.goal_time)
    }))

    return { bestImprovement, mostConsistent, nextTarget, goalProgress }
  }

  const { bestImprovement, mostConsistent, nextTarget, goalProgress } = calculateMetrics()

  // Timer effect
  useEffect(() => {
    if (workoutActive && !isPaused) {
      intervalRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1000)
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [workoutActive, isPaused])

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const ms = Math.floor((milliseconds % 1000) / 10)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const formatTimeWithMs = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const startWorkout = async () => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "Please sign in to start a workout",
        variant: "destructive",
      })
      return
    }

    try {
      const workout = await createHyroxWorkout(user.id)
      if (workout) {
        setCurrentWorkout(workout)
        setWorkoutActive(true)
        setCurrentStation(0)
        setElapsedTime(0)
        setStationStartTime(0)
        setStationTimes([])
        setIsPaused(false)
      }
    } catch (error) {
      console.error('Error starting workout:', error)
      toast({
        title: "Error",
        description: "Failed to start workout",
        variant: "destructive",
      })
    }
  }

  const pauseWorkout = () => {
    setIsPaused(!isPaused)
  }

  const completeStation = async () => {
    const stationTime = elapsedTime - stationStartTime
    const currentStationData = workoutStations[currentStation]
    const newStationTime = {
      name: currentStationData.name,
      time: stationTime
    }
    setStationTimes([...stationTimes, newStationTime])
    
    // Save station time to database
    if (currentWorkout && user?.id) {
      const stationResult = await addWorkoutStation(
        currentWorkout.id,
        currentStationData.name,
        currentStationData.order,
        stationTime,
        true
      )

      if (!stationResult) {
        console.error('Failed to save station time for:', currentStationData.name)
        toast({
          title: "Warning",
          description: "Station time might not have been saved. Please check your connection.",
          variant: "destructive",
        })
      }

      // Update personal best if applicable
      const recordResult = await updateStationRecord(user.id, currentStationData.name, stationTime)
      if (!recordResult) {
        console.error('Failed to update station record for:', currentStationData.name)
      } else {
        console.log('Successfully updated station record:', currentStationData.name, 'with time:', stationTime)
        // Reload station records to reflect the update
        loadStationRecords()
      }
    }
    
    if (currentStation < workoutStations.length - 1) {
      setCurrentStation(currentStation + 1)
      setStationStartTime(elapsedTime)
    } else {
      // Workout complete
      if (currentWorkout) {
        await completeHyroxWorkout(currentWorkout.id, elapsedTime)
        toast({
          title: "Workout Complete!",
          description: `Total time: ${formatTime(elapsedTime)}`,
        })
      }
      setWorkoutActive(false)
      setIsPaused(false)
      // Reload station records and workout history to show any updates
      loadStationRecords()
    }
  }

  const skipStation = async () => {
    const currentStationData = workoutStations[currentStation]
    
    // Save skipped station to database
    if (currentWorkout && user?.id) {
      const result = await addWorkoutStation(
        currentWorkout.id,
        currentStationData.name,
        currentStationData.order,
        null,
        false
      )
      
      if (!result) {
        console.error('Failed to save skipped station:', currentStationData.name)
        toast({
          title: "Warning",
          description: "Skipped station might not have been saved.",
          variant: "destructive",
        })
      }
    }
    
    if (currentStation < workoutStations.length - 1) {
      setCurrentStation(currentStation + 1)
      setStationStartTime(elapsedTime)
    }
  }

  const progress = ((currentStation) / workoutStations.length) * 100

  const runDatabaseTest = async () => {
    console.log('Running database diagnostics...')
    try {
      const response = await fetch('/api/modules/hyrox/test-database')
      const result = await response.json()
      console.log('Database test result:', result)
      
      if (!result.success) {
        toast({
          title: "Database Connection Failed",
          description: result.error,
          variant: "destructive",
        })
      } else {
        const missingTables = Object.entries(result.tables)
          .filter(([table, exists]) => !exists)
          .map(([table]) => table)
      
        if (missingTables.length > 0) {
          toast({
            title: "Missing Tables",
            description: `Missing: ${missingTables.join(', ')}`,
            variant: "destructive",
          })
        } else {
          toast({
            title: "Database OK",
            description: "All tables exist and are accessible",
          })
        }
      }
    } catch (error) {
      console.error('Error testing database:', error)
      toast({
        title: "Error",
        description: "Failed to test database connection",
        variant: "destructive",
      })
    }
  }

  const resetStationRecords = async () => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "Please sign in to reset records",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch('/api/modules/hyrox/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to reset records')
      }

      toast({
        title: "Records Reset",
        description: "Station records have been reset. Reload the page to see changes.",
      })
      
      // Reload the records
      loadStationRecords()
    } catch (error) {
      console.error('Error resetting records:', error)
      toast({
        title: "Error",
        description: "Failed to reset station records",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-medium">Hyrox Training</h1>
                {user && (
                  <p className="text-sm text-muted-foreground mt-1">Track your Hyrox performance</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetStationRecords}
                  className="text-xs"
                >
                  Reset Records
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full max-w-[800px] grid-cols-4">
                <TabsTrigger value="station-records">Station Records</TabsTrigger>
                <TabsTrigger value="progress-tracking">Progress Tracking</TabsTrigger>
                <TabsTrigger value="race-simulation">Race Simulation</TabsTrigger>
                <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
              </TabsList>

              {/* Station Records Tab */}
              <TabsContent value="station-records" className="mt-6">
                {loading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {stationRecords
                      .filter(record => record.station_type === 'exercise')
                      .sort((a, b) => {
                        const order = ['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Rowing', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls']
                        return order.indexOf(a.station_name) - order.indexOf(b.station_name)
                      })
                      .map((station) => {
                        const progress = calculateProgress(station.best_time, station.goal_time)
                        const timeDiff = Math.abs(station.best_time - station.goal_time) / 1000
                        
                        return (
                          <Card key={`${station.id}-${station.station_name}`} className="relative overflow-hidden">
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between">
                                <div>
                                  <CardTitle className="text-lg font-semibold">{station.station_name}</CardTitle>
                                  <CardDescription className="text-xs mt-1">{station.distance}</CardDescription>
                                </div>
                                {station.station_name === "Running" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-400 hover:text-green-600 hover:bg-green-50"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedVideoUrl("https://www.youtube.com/watch?v=9fWTShnmWV0")
                                      setSelectedVideoTitle("Running Tutorial")
                                      setVideoModalOpen(true)
                                    }}
                                  >
                                    <Play className="w-4 h-4" />
                                  </Button>
                                )}
                                {station.station_name === "SkiErg" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-400 hover:text-green-600 hover:bg-green-50"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedVideoUrl("https://www.youtube.com/watch?v=gwjlC9Yn2DQ")
                                      setSelectedVideoTitle("SkiErg Tutorial")
                                      setVideoModalOpen(true)
                                    }}
                                  >
                                    <Play className="w-4 h-4" />
                                  </Button>
                                )}
                                {station.station_name === "Sled Push" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-400 hover:text-green-600 hover:bg-green-50"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedVideoUrl("https://www.youtube.com/watch?v=yKAxMSmHrd0")
                                      setSelectedVideoTitle("Sled Push Tutorial")
                                      setVideoModalOpen(true)
                                    }}
                                  >
                                    <Play className="w-4 h-4" />
                                  </Button>
                                )}
                                {station.station_name === "Sled Pull" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-400 hover:text-green-600 hover:bg-green-50"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedVideoUrl("https://www.youtube.com/watch?v=ZBqWXVjdTls")
                                      setSelectedVideoTitle("Sled Pull Tutorial")
                                      setVideoModalOpen(true)
                                    }}
                                  >
                                    <Play className="w-4 h-4" />
                                  </Button>
                                )}
                                {station.station_name === "Rowing" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-400 hover:text-green-600 hover:bg-green-50"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedVideoUrl("https://www.youtube.com/watch?v=tcIpMJy6e-U")
                                      setSelectedVideoTitle("Rowing Tutorial")
                                      setVideoModalOpen(true)
                                    }}
                                  >
                                    <Play className="w-4 h-4" />
                                  </Button>
                                )}
                                {station.station_name === "Farmers Carry" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-400 hover:text-green-600 hover:bg-green-50"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedVideoUrl("https://www.youtube.com/watch?v=3LHtCDBJPeM")
                                      setSelectedVideoTitle("Farmers Carry Tutorial")
                                      setVideoModalOpen(true)
                                    }}
                                  >
                                    <Play className="w-4 h-4" />
                                  </Button>
                                )}
                                {station.station_name === "Sandbag Lunges" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-400 hover:text-green-600 hover:bg-green-50"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedVideoUrl("https://www.youtube.com/watch?v=29lLj4p6Slo")
                                      setSelectedVideoTitle("Sandbag Lunges Tutorial")
                                      setVideoModalOpen(true)
                                    }}
                                  >
                                    <Play className="w-4 h-4" />
                                  </Button>
                                )}
                                {station.station_name === "Wall Balls" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-400 hover:text-green-600 hover:bg-green-50"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedVideoUrl("https://www.youtube.com/watch?v=bm7QLEOx26c")
                                      setSelectedVideoTitle("Wall Balls Tutorial")
                                      setVideoModalOpen(true)
                                    }}
                                  >
                                    <Play className="w-4 h-4" />
                                  </Button>
                                )}
                                {station.station_name === "Burpee Broad Jump" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-400 hover:text-green-600 hover:bg-green-50"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedVideoUrl("https://www.youtube.com/watch?v=UTO-GzRXF-Q")
                                      setSelectedVideoTitle("Burpee Broad Jump Tutorial")
                                      setVideoModalOpen(true)
                                    }}
                                  >
                                    <Play className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="text-center">
                                <div className="text-3xl font-bold text-blue-600">
                                  {formatTimeUtil(station.best_time)}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">Current Best</div>
                              </div>
                              
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                  <span>Goal: {formatTimeUtil(station.goal_time)}</span>
                                  <span className={`font-medium ${station.best_time > station.goal_time ? 'text-orange-600' : 'text-green-600'}`}>
                                    {getTimeDifference(station.best_time, station.goal_time)}
                                  </span>
                                </div>
                                <Progress value={progress} className="h-2" />
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                  </div>
                )}
              </TabsContent>

              {/* Progress Tracking Tab */}
              <TabsContent value="progress-tracking" className="mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Goal Progress Card */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-green-600" />
                        <CardTitle>Goal Progress</CardTitle>
                      </div>
                      <CardDescription>How close you are to achieving your target times</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {goalProgress.map((item) => (
                        <div key={item.name} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{item.name}</span>
                            <span className="text-muted-foreground">{item.percentage}%</span>
                          </div>
                          <Progress value={item.percentage} className="h-2" />
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Last Training Card */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-blue-600" />
                        <CardTitle>Last Training</CardTitle>
                      </div>
                      <CardDescription>Your most recent workout performance</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="text-center py-4">
                        <div className="text-4xl font-bold text-blue-600">
                          {lastWorkout ? formatTimeUtil(lastWorkout.total_time) : '--:--'}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">Total Time</div>
                        {lastWorkout && (
                          <div className="text-xs text-muted-foreground mt-2">
                            {new Date(lastWorkout.completed_at!).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-3 pt-4 border-t">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Best Improvement</span>
                          <span className="font-medium">
                            {bestImprovement ? `${bestImprovement.station_name} (${getTimeDifference(bestImprovement.best_time, bestImprovement.goal_time)})` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Most Consistent</span>
                          <span className="font-medium">{mostConsistent?.station_name || 'N/A'}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Next Target</span>
                          <span className="font-medium">
                            {nextTarget ? `${nextTarget.station_name} (${getTimeDifference(nextTarget.best_time, nextTarget.goal_time)} to goal)` : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Achievement Milestones */}
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Achievement Milestones</CardTitle>
                      <CardDescription>Celebrate your progress with these milestones</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                          <div className="flex flex-col items-center text-center space-y-2">
                            <Trophy className="w-8 h-8 text-green-600" />
                            <div className="font-semibold">Sub 1:20</div>
                            <div className="text-sm text-muted-foreground">Achieved!</div>
                          </div>
                        </div>
                        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                          <div className="flex flex-col items-center text-center space-y-2">
                            <Target className="w-8 h-8 text-blue-600" />
                            <div className="font-semibold">Sub 1:15</div>
                            <div className="text-sm text-muted-foreground">3:42 to go</div>
                          </div>
                        </div>
                        <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                          <div className="flex flex-col items-center text-center space-y-2">
                            <Badge className="w-8 h-8 text-gray-400" />
                            <div className="font-semibold">Sub 1:10</div>
                            <div className="text-sm text-muted-foreground">Future goal</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Race Simulation Tab */}
              <TabsContent value="race-simulation" className="mt-6">
                <div className="space-y-6">
                  {/* Header with status */}
                  <Card className="relative">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <Activity className="w-6 h-6 text-blue-600" />
                          <h2 className="text-2xl font-bold">HYROX Full Race Simulation</h2>
                        </div>
                        {workoutActive && (
                          <Badge variant={isPaused ? "secondary" : "default"} className="text-sm px-3 py-1">
                            {isPaused ? "Paused" : "Active"}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="text-sm text-muted-foreground mb-4">
                        Station {currentStation + 1} of {workoutStations.length}
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Overall Progress</span>
                          <span className="font-medium">{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-3" />
                      </div>
                    </CardContent>
                  </Card>

                  {!workoutActive ? (
                    // Start workout screen
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center space-y-6 py-8">
                          <Trophy className="w-16 h-16 mx-auto text-blue-600" />
                          <div className="space-y-2">
                            <h3 className="text-2xl font-bold">Ready to Start Your HYROX Simulation?</h3>
                            <p className="text-muted-foreground max-w-md mx-auto">
                              Complete all 8 stations with 1km runs between each. Track your time and compare with your personal records.
                            </p>
                          </div>
                          <Button 
                            size="lg" 
                            onClick={startWorkout}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Play className="w-5 h-5 mr-2" />
                            Start Workout
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Current Station */}
                      <Card>
                        <CardHeader>
                          <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-blue-600" />
                            <CardTitle>Current Station</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          <div className="text-center space-y-4">
                            <h3 className="text-4xl font-bold text-blue-600">
                              {workoutStations[currentStation]?.name}
                            </h3>
                            <p className="text-muted-foreground">
                              Target: {workoutStations[currentStation]?.target}
                            </p>
                            <div className="text-6xl font-mono font-bold">
                              {formatTime(elapsedTime - stationStartTime)}
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-center gap-3">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={pauseWorkout}
                              className="h-12 w-12"
                            >
                              {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                            </Button>
                            
                            <Button
                              size="lg"
                              onClick={completeStation}
                              className="bg-orange-600 hover:bg-orange-700 text-white px-6"
                              disabled={isPaused}
                            >
                              <CheckCircle className="w-5 h-5 mr-2" />
                              Complete Station
                            </Button>
                            
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={skipStation}
                              className="h-12 w-12"
                              disabled={isPaused}
                            >
                              <SkipForward className="w-5 h-5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Station Times */}
                      <Card>
                        <CardHeader>
                          <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-green-600" />
                            <CardTitle>Station Times</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {workoutStations.map((station, index) => {
                              const stationTime = stationTimes.find(st => 
                                stationTimes.filter(s => s.name === station.name)
                                  .indexOf(st) === workoutStations.slice(0, index + 1)
                                    .filter(s => s.name === station.name).length - 1
                              )
                              const bestRecord = stationRecords.find(r => r.station_name === station.name)
                              
                              return (
                                <div 
                                  key={index}
                                  className={`flex items-center justify-between p-3 rounded-lg ${
                                    index === currentStation 
                                      ? 'bg-blue-50 border border-blue-200' 
                                      : stationTime 
                                        ? 'bg-green-50 border border-green-200'
                                        : 'bg-gray-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm ${
                                      index === currentStation ? 'font-semibold' : ''
                                    }`}>
                                      {station.name}
                                    </span>
                                    {bestRecord && (
                                      <span className="text-xs text-blue-600 font-medium">
                                        Best: {formatTimeUtil(bestRecord.best_time)}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-sm font-mono font-medium">
                                    {stationTime ? formatTimeWithMs(stationTime.time) : '--:--'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                          
                          {stationTimes.length > 0 && (
                            <div className="mt-4 pt-4 border-t">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">Total Time</span>
                                <span className="text-lg font-mono font-bold">
                                  {formatTime(elapsedTime)}
                                </span>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Workout Complete */}
                  {!workoutActive && stationTimes.length === workoutStations.length && (
                    <Card className="bg-green-50 border-green-200">
                      <CardContent className="pt-6">
                        <div className="text-center space-y-4">
                          <Trophy className="w-12 h-12 mx-auto text-green-600" />
                          <div>
                            <h3 className="text-xl font-bold text-green-900">Workout Complete!</h3>
                            <p className="text-green-700 mt-2">
                              Total Time: {formatTime(elapsedTime)}
                            </p>
                          </div>
                          <Button 
                            onClick={startWorkout} 
                            variant="outline"
                            className="mt-4"
                          >
                            Start New Workout
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              {/* Nutrition Tab */}
              <TabsContent value="nutrition" className="mt-6">
                <div className="flex flex-col items-center justify-center w-full">
                  <Carousel className="w-full max-w-[750px]">
                    <CarouselContent>
                      <CarouselItem>
                        <div className="p-1">
                          <div className="flex items-center justify-center">
                            <img 
                              src="/nutrition/nutrition-1.png" 
                              alt="HYROX Race Nutrition - The Final 48 Hours" 
                              className="rounded-lg shadow-lg"
                              style={{ width: '700px', height: '850px', objectFit: 'cover' }}
                            />
                          </div>
                        </div>
                      </CarouselItem>
                      <CarouselItem>
                        <div className="p-1">
                          <div className="flex items-center justify-center">
                            <img 
                              src="/nutrition/nutrition-2.png" 
                              alt="Pre-Race Goals" 
                              className="rounded-lg shadow-lg"
                              style={{ width: '700px', height: '850px', objectFit: 'cover' }}
                            />
                          </div>
                        </div>
                      </CarouselItem>
                      <CarouselItem>
                        <div className="p-1">
                          <div className="flex items-center justify-center">
                            <img 
                              src="/nutrition/nutrition-3.png" 
                              alt="Carb Loading & Energy Needs" 
                              className="rounded-lg shadow-lg"
                              style={{ width: '700px', height: '850px', objectFit: 'cover' }}
                            />
                          </div>
                        </div>
                      </CarouselItem>
                      <CarouselItem>
                        <div className="p-1">
                          <div className="flex items-center justify-center">
                            <img 
                              src="/nutrition/nutrition-4.png" 
                              alt="What Carbs Actually Look Like" 
                              className="rounded-lg shadow-lg"
                              style={{ width: '700px', height: '850px', objectFit: 'cover' }}
                            />
                          </div>
                        </div>
                      </CarouselItem>
                      <CarouselItem>
                        <div className="p-1">
                          <div className="flex items-center justify-center">
                            <img 
                              src="/nutrition/nutrition-5.png" 
                              alt="Hydration Strategy" 
                              className="rounded-lg shadow-lg"
                              style={{ width: '700px', height: '850px', objectFit: 'cover' }}
                            />
                          </div>
                        </div>
                      </CarouselItem>
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                  </Carousel>
                </div>
              </TabsContent>
            </Tabs>

      {/* YouTube Video Modal */}
      <YouTubeModal
        isOpen={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        videoUrl={selectedVideoUrl}
        title={selectedVideoTitle}
      />
    </div>
  )
}