'use client'

import { useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BIBLE_BOOKS, OT_BOOKS, NT_BOOKS, getChapterCount, getVerseCount } from '../lib/bible-data'
import { ACTIVE_VERSIONS } from '../lib/bible-versions'

interface BiblePassageSelectorProps {
  book: string
  chapter: number | null
  verseStart: number | null
  verseEnd: number | null
  version: string
  onBookChange: (book: string) => void
  onChapterChange: (chapter: number | null) => void
  onVerseStartChange: (verse: number | null) => void
  onVerseEndChange: (verse: number | null) => void
  onVersionChange: (version: string) => void
  /** compact = hide labels, useful for inline filter bars */
  compact?: boolean
  /** Show/hide version selector */
  showVersion?: boolean
}

export default function BiblePassageSelector({
  book,
  chapter,
  verseStart,
  verseEnd,
  version,
  onBookChange,
  onChapterChange,
  onVerseStartChange,
  onVerseEndChange,
  onVersionChange,
  compact = false,
  showVersion = true,
}: BiblePassageSelectorProps) {
  const chapterCount = useMemo(() => (book ? getChapterCount(book) : 0), [book])
  const verseCount = useMemo(() => (book && chapter ? getVerseCount(book, chapter) : 0), [book, chapter])

  const chapters = useMemo(
    () => Array.from({ length: chapterCount }, (_, i) => i + 1),
    [chapterCount]
  )

  const verses = useMemo(
    () => Array.from({ length: verseCount }, (_, i) => i + 1),
    [verseCount]
  )

  function handleBookChange(newBook: string) {
    onBookChange(newBook === '__none__' ? '' : newBook)
    onChapterChange(null)
    onVerseStartChange(null)
    onVerseEndChange(null)
  }

  function handleChapterChange(val: string) {
    if (val === '__none__') {
      onChapterChange(null)
      onVerseStartChange(null)
      onVerseEndChange(null)
    } else {
      onChapterChange(Number(val))
      onVerseStartChange(null)
      onVerseEndChange(null)
    }
  }

  function handleVerseStartChange(val: string) {
    if (val === '__none__') {
      onVerseStartChange(null)
      onVerseEndChange(null)
    } else {
      const v = Number(val)
      onVerseStartChange(v)
      if (verseEnd && verseEnd < v) onVerseEndChange(null)
    }
  }

  function handleVerseEndChange(val: string) {
    onVerseEndChange(val === '__none__' ? null : Number(val))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Version */}
      {showVersion && (
        <Select value={version} onValueChange={onVersionChange}>
          <SelectTrigger className={compact ? 'h-8 text-xs w-[90px]' : 'w-[100px]'}>
            <SelectValue placeholder="Version" />
          </SelectTrigger>
          <SelectContent>
            {ACTIVE_VERSIONS.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Book */}
      <Select value={book || '__none__'} onValueChange={handleBookChange}>
        <SelectTrigger className={compact ? 'h-8 text-xs w-[140px]' : 'w-[160px]'}>
          <SelectValue placeholder="Book" />
        </SelectTrigger>
        <SelectContent className="max-h-[320px]">
          {!compact && (
            <SelectItem value="__none__" className="text-muted-foreground">
              All books
            </SelectItem>
          )}
          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Old Testament
          </div>
          {OT_BOOKS.map((b) => (
            <SelectItem key={b.name} value={b.name}>
              {b.name}
            </SelectItem>
          ))}
          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">
            New Testament
          </div>
          {NT_BOOKS.map((b) => (
            <SelectItem key={b.name} value={b.name}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Chapter */}
      {book && (
        <Select
          value={chapter != null ? String(chapter) : '__none__'}
          onValueChange={handleChapterChange}
        >
          <SelectTrigger className={compact ? 'h-8 text-xs w-[88px]' : 'w-[100px]'}>
            <SelectValue placeholder="Chapter" />
          </SelectTrigger>
          <SelectContent className="max-h-[280px]">
            <SelectItem value="__none__" className="text-muted-foreground">
              Any ch.
            </SelectItem>
            {chapters.map((c) => (
              <SelectItem key={c} value={String(c)}>
                Ch. {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Verse start */}
      {book && chapter != null && (
        <Select
          value={verseStart != null ? String(verseStart) : '__none__'}
          onValueChange={handleVerseStartChange}
        >
          <SelectTrigger className={compact ? 'h-8 text-xs w-[80px]' : 'w-[88px]'}>
            <SelectValue placeholder="Verse" />
          </SelectTrigger>
          <SelectContent className="max-h-[280px]">
            <SelectItem value="__none__" className="text-muted-foreground">
              Any v.
            </SelectItem>
            {verses.map((v) => (
              <SelectItem key={v} value={String(v)}>
                v. {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Verse end (only if verse start selected) */}
      {book && chapter != null && verseStart != null && (
        <Select
          value={verseEnd != null ? String(verseEnd) : '__none__'}
          onValueChange={handleVerseEndChange}
        >
          <SelectTrigger className={compact ? 'h-8 text-xs w-[80px]' : 'w-[88px]'}>
            <SelectValue placeholder="End" />
          </SelectTrigger>
          <SelectContent className="max-h-[280px]">
            <SelectItem value="__none__" className="text-muted-foreground">
              —
            </SelectItem>
            {verses.filter((v) => v >= verseStart).map((v) => (
              <SelectItem key={v} value={String(v)}>
                v. {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
