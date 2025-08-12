"use client"

import React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface YouTubeModalProps {
  isOpen: boolean
  onClose: () => void
  videoUrl: string
  title?: string
}

function getYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null
  
  // Extract video ID from various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      // Add autoplay=1 parameter to the embed URL
      return `https://www.youtube.com/embed/${match[1]}?autoplay=1`
    }
  }
  
  return null
}

export function YouTubeModal({ isOpen, onClose, videoUrl, title }: YouTubeModalProps) {
  const embedUrl = getYouTubeEmbedUrl(videoUrl)
  
  if (!embedUrl) {
    return null
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] p-0 border-0 rounded-[20px] overflow-hidden">
        <DialogHeader className="bg-black text-white p-4 pb-2 rounded-t-[20px]">
          <DialogTitle className="text-white">{title || "Exercise Video"}</DialogTitle>
        </DialogHeader>
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <iframe
            className="absolute top-0 left-0 w-full h-full"
            src={embedUrl}
            title={title || "YouTube video player"}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}