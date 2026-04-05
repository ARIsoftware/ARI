"use client"

import { useEffect } from "react"
import { useMusicPlaylistSongs } from "@/modules/music-player/hooks/use-music-player"
import { useMusicPlayerContext } from "./music-player-context"

/**
 * Invisible component that keeps the MusicPlayerContext playlist
 * in sync with the database. Mounted globally inside the context
 * provider so the top bar icon always has access to the playlist.
 */
export function PlaylistSync() {
  const { setPlaylist } = useMusicPlayerContext()
  const { data: songs } = useMusicPlaylistSongs()

  useEffect(() => {
    if (songs) {
      setPlaylist(songs)
    }
  }, [songs, setPlaylist])

  return null
}
