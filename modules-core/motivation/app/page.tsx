'use client'

import { useMemo, useState } from 'react'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, Flame, Loader2, Plus, RefreshCw, Shuffle } from 'lucide-react'
import {
  useDeleteMotivationVideo,
  useMotivationSettings,
  useMotivationVideos,
  useQuotesPool,
  useReorderMotivationVideos,
} from '../hooks/use-motivation'
import { AddVideoDialog } from '../components/add-video-dialog'
import { VideoGrid } from '../components/video-grid'
import { PlayerDialog } from '../components/player-dialog'
import { MotivationOnboarding } from '../components/onboarding'
import { DeleteVideoDialog } from '../components/delete-video-dialog'
import type { GridDensity, MotivationVideo, SortOrder } from '../types'

function shuffleInPlace<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export default function MotivationPage() {
  const { toast } = useToast()
  const { data: settings, isLoading: settingsLoading } = useMotivationSettings()
  const {
    videos,
    total,
    isLoading: videosLoading,
    isError: videosError,
    refetch: refetchVideos,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useMotivationVideos()
  const deleteVideo = useDeleteMotivationVideo()
  const reorderVideos = useReorderMotivationVideos()

  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')
  const { data: quotesPool = [] } = useQuotesPool(quotesEnabled && !quotesLoading)
  // Pick a random quote once per mount-or-refresh of the pool. Project's
  // global staleTime keeps the pool cached so back-and-forth navigation
  // doesn't reroll on every render.
  const randomQuote = useMemo(() => {
    if (quotesPool.length === 0) return null
    return quotesPool[Math.floor(Math.random() * quotesPool.length)]
  }, [quotesPool])

  const [addOpen, setAddOpen] = useState(false)
  const [playerOpen, setPlayerOpen] = useState(false)
  const [playlist, setPlaylist] = useState<MotivationVideo[]>([])
  const [playerStartIndex, setPlayerStartIndex] = useState(0)
  const [videoToDelete, setVideoToDelete] = useState<MotivationVideo | null>(null)

  const sortOrder: SortOrder = settings?.defaultSort ?? 'custom'
  const density: GridDensity = settings?.gridDensity ?? 'comfortable'
  const reorderEnabled = sortOrder === 'custom'

  const openPlayerAt = (videoId: string) => {
    const idx = videos.findIndex((v) => v.id === videoId)
    if (idx < 0) return
    // Snapshot the live array so background refetches don't mutate the
    // open player's playlist out from under it.
    setPlaylist([...videos])
    setPlayerStartIndex(idx)
    setPlayerOpen(true)
  }

  const handleShuffle = () => {
    if (videos.length === 0) return
    setPlaylist(shuffleInPlace(videos))
    setPlayerStartIndex(0)
    setPlayerOpen(true)
  }

  const requestDelete = (videoId: string) => {
    const target = videos.find((v) => v.id === videoId)
    if (target) setVideoToDelete(target)
  }

  const confirmDelete = () => {
    if (!videoToDelete) return
    const target = videoToDelete
    deleteVideo.mutate(target.id, {
      onSuccess: () => {
        setVideoToDelete(null)
        toast({ title: 'Video removed' })
      },
      onError: (err) => {
        setVideoToDelete(null)
        const message = err instanceof Error ? err.message : 'Please try again.'
        toast({ variant: 'destructive', title: 'Failed to delete video', description: message })
      },
    })
  }

  const handleReorder = (orderedIds: string[]) => {
    reorderVideos.mutate(orderedIds, {
      onError: (err) => {
        const message = err instanceof Error ? err.message : 'Please try again.'
        toast({ variant: 'destructive', title: 'Failed to save new order', description: message })
      },
    })
  }

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!settings?.onboardingCompleted) {
    return <MotivationOnboarding />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-medium">Motivation</h1>
          {quotesEnabled && randomQuote && (
            <p className="text-sm text-muted-foreground mt-1">{randomQuote.quote}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleShuffle} disabled={videos.length < 2}>
            <Shuffle className="w-4 h-4 mr-2" />
            Shuffle
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add video
          </Button>
        </div>
      </div>

      {videosLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading videos...
        </div>
      ) : videosError ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center text-center py-16">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-lg font-medium">Couldn&apos;t load your videos</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Something went wrong fetching your list. Check your connection and try again.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => refetchVideos()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : videos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center text-center py-16">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Flame className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold">Build your motivation wall</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Paste in the YouTube videos that fire you up — speeches, hype tracks,
              training montages, mantras, anything. Stack a few and hit Shuffle
              whenever you need a kick.
            </p>
            <Button className="mt-5" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add your first video
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <VideoGrid
            videos={videos}
            density={density}
            reorderEnabled={reorderEnabled}
            onPlay={openPlayerAt}
            onDelete={requestDelete}
            onReorder={handleReorder}
          />
          {hasNextPage && (
            <div className="flex flex-col items-center gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load more'
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Showing {videos.length} of {total}
              </p>
            </div>
          )}
        </>
      )}

      <AddVideoDialog open={addOpen} onOpenChange={setAddOpen} />

      <DeleteVideoDialog
        video={videoToDelete}
        open={videoToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteVideo.isPending) setVideoToDelete(null)
        }}
        onConfirm={confirmDelete}
        isPending={deleteVideo.isPending}
      />

      {playerOpen && (
        <PlayerDialog
          open={playerOpen}
          onOpenChange={setPlayerOpen}
          playlist={playlist}
          startIndex={playerStartIndex}
          defaultAutoplayNext={settings?.autoplayNext ?? true}
        />
      )}
    </div>
  )
}
