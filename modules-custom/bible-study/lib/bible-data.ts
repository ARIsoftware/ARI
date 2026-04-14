/**
 * Bible structural data — canonical 66-book Protestant canon.
 * Verse counts are based on standard reference editions (ESV/KJV).
 * Minor variations exist between translations; these counts are for UI navigation only.
 */

export interface BibleBook {
  name: string
  testament: 'OT' | 'NT'
  abbreviation: string
  chapters: number
}

// Verse counts per chapter indexed by chapter number (1-based, index 0 unused for readability).
// verseCounts['Genesis'][1] = 31  (chapter 1 has 31 verses)
export const VERSE_COUNTS: Record<string, number[]> = {
  Genesis:         [0,31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],
  Exodus:          [0,22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38],
  Leviticus:       [0,17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,24,46,22,22,15,25,22,23,27],
  Numbers:         [0,54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13],
  Deuteronomy:     [0,46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12],
  Joshua:          [0,18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33],
  Judges:          [0,36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25],
  Ruth:            [0,22,23,18,22],
  '1 Samuel':      [0,28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13],
  '2 Samuel':      [0,27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25],
  '1 Kings':       [0,53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53],
  '2 Kings':       [0,18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30],
  '1 Chronicles':  [0,54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30],
  '2 Chronicles':  [0,17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23],
  Ezra:            [0,11,70,13,24,17,22,28,36,15,44],
  Nehemiah:        [0,11,20,32,23,19,19,73,18,38,39,36,47,31],
  Esther:          [0,22,23,15,17,14,14,10,17,32,3],
  Job:             [0,22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17],
  Psalms:          [0,6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,13,25,11,22,23,28,13,40,23,14,18,14,12,5,27,18,12,10,15,21,23,21,11,7,9,24,14,12,12,18,14,9,13,12,11,14,20,8,36,37,6,24,20,28,23,11,13,21,72,13,20,17,8,19,13,14,17,7,19,53,17,16,16,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6],
  Proverbs:        [0,33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,62,35,24,29,34,30,17,25],
  Ecclesiastes:    [0,18,26,22,16,20,12,29,17,18,20,10,14],
  'Song of Solomon':[0,17,17,11,16,16,13,13,14],
  Isaiah:          [0,31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24],
  Jeremiah:        [0,19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34],
  Lamentations:    [0,22,22,66,22,22],
  Ezekiel:         [0,28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35],
  Daniel:          [0,21,49,30,37,31,28,28,27,27,21,45,13],
  Hosea:           [0,11,23,5,19,15,11,16,14,17,15,12,14,16,9],
  Joel:            [0,20,32,21],
  Amos:            [0,15,16,15,13,27,14,17,14,15],
  Obadiah:         [0,21],
  Jonah:           [0,17,10,10,11],
  Micah:           [0,16,13,12,13,15,16,20],
  Nahum:           [0,15,13,19],
  Habakkuk:        [0,17,20,19],
  Zephaniah:       [0,18,15,20],
  Haggai:          [0,15,23],
  Zechariah:       [0,21,13,10,14,11,15,14,23,17,12,17,14,9,21],
  Malachi:         [0,14,17,18,6],
  Matthew:         [0,25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20],
  Mark:            [0,45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20],
  Luke:            [0,80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53],
  John:            [0,51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25],
  Acts:            [0,26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31],
  Romans:          [0,32,29,31,25,21,23,25,39,33,21,36,21,14,26,33,24],
  '1 Corinthians': [0,31,16,23,21,13,20,40,34,16,30,28,12,14,17,15,31],
  '2 Corinthians': [0,24,17,18,18,21,18,16,24,15,18,33,21,14],
  Galatians:       [0,24,21,29,31,26,18],
  Ephesians:       [0,23,22,21,28,30,14],
  Philippians:     [0,30,18,19,16],
  Colossians:      [0,29,23,25,18],
  '1 Thessalonians':[0,10,20,13,18,28],
  '2 Thessalonians':[0,12,17,18],
  '1 Timothy':     [0,20,15,16,16,25,21],
  '2 Timothy':     [0,18,26,17,22],
  Titus:           [0,16,15,15],
  Philemon:        [0,25],
  Hebrews:         [0,14,18,19,16,14,20,28,13,28,39,40,29,25],
  James:           [0,27,26,18,17,20],
  '1 Peter':       [0,25,25,22,19,14],
  '2 Peter':       [0,21,22,18],
  '1 John':        [0,10,29,24,21,21],
  '2 John':        [0,13],
  '3 John':        [0,14],
  Jude:            [0,25],
  Revelation:      [0,20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21],
}

export const BIBLE_BOOKS: BibleBook[] = [
  // Old Testament
  { name: 'Genesis',          testament: 'OT', abbreviation: 'Gen',  chapters: 50 },
  { name: 'Exodus',           testament: 'OT', abbreviation: 'Exo',  chapters: 40 },
  { name: 'Leviticus',        testament: 'OT', abbreviation: 'Lev',  chapters: 27 },
  { name: 'Numbers',          testament: 'OT', abbreviation: 'Num',  chapters: 36 },
  { name: 'Deuteronomy',      testament: 'OT', abbreviation: 'Deu',  chapters: 34 },
  { name: 'Joshua',           testament: 'OT', abbreviation: 'Jos',  chapters: 24 },
  { name: 'Judges',           testament: 'OT', abbreviation: 'Jdg',  chapters: 21 },
  { name: 'Ruth',             testament: 'OT', abbreviation: 'Rut',  chapters: 4  },
  { name: '1 Samuel',         testament: 'OT', abbreviation: '1Sa',  chapters: 31 },
  { name: '2 Samuel',         testament: 'OT', abbreviation: '2Sa',  chapters: 24 },
  { name: '1 Kings',          testament: 'OT', abbreviation: '1Ki',  chapters: 22 },
  { name: '2 Kings',          testament: 'OT', abbreviation: '2Ki',  chapters: 25 },
  { name: '1 Chronicles',     testament: 'OT', abbreviation: '1Ch',  chapters: 29 },
  { name: '2 Chronicles',     testament: 'OT', abbreviation: '2Ch',  chapters: 36 },
  { name: 'Ezra',             testament: 'OT', abbreviation: 'Ezr',  chapters: 10 },
  { name: 'Nehemiah',         testament: 'OT', abbreviation: 'Neh',  chapters: 13 },
  { name: 'Esther',           testament: 'OT', abbreviation: 'Est',  chapters: 10 },
  { name: 'Job',              testament: 'OT', abbreviation: 'Job',  chapters: 42 },
  { name: 'Psalms',           testament: 'OT', abbreviation: 'Psa',  chapters: 150},
  { name: 'Proverbs',         testament: 'OT', abbreviation: 'Pro',  chapters: 31 },
  { name: 'Ecclesiastes',     testament: 'OT', abbreviation: 'Ecc',  chapters: 12 },
  { name: 'Song of Solomon',  testament: 'OT', abbreviation: 'Son',  chapters: 8  },
  { name: 'Isaiah',           testament: 'OT', abbreviation: 'Isa',  chapters: 66 },
  { name: 'Jeremiah',         testament: 'OT', abbreviation: 'Jer',  chapters: 52 },
  { name: 'Lamentations',     testament: 'OT', abbreviation: 'Lam',  chapters: 5  },
  { name: 'Ezekiel',          testament: 'OT', abbreviation: 'Eze',  chapters: 48 },
  { name: 'Daniel',           testament: 'OT', abbreviation: 'Dan',  chapters: 12 },
  { name: 'Hosea',            testament: 'OT', abbreviation: 'Hos',  chapters: 14 },
  { name: 'Joel',             testament: 'OT', abbreviation: 'Joe',  chapters: 3  },
  { name: 'Amos',             testament: 'OT', abbreviation: 'Amo',  chapters: 9  },
  { name: 'Obadiah',          testament: 'OT', abbreviation: 'Oba',  chapters: 1  },
  { name: 'Jonah',            testament: 'OT', abbreviation: 'Jon',  chapters: 4  },
  { name: 'Micah',            testament: 'OT', abbreviation: 'Mic',  chapters: 7  },
  { name: 'Nahum',            testament: 'OT', abbreviation: 'Nah',  chapters: 3  },
  { name: 'Habakkuk',         testament: 'OT', abbreviation: 'Hab',  chapters: 3  },
  { name: 'Zephaniah',        testament: 'OT', abbreviation: 'Zep',  chapters: 3  },
  { name: 'Haggai',           testament: 'OT', abbreviation: 'Hag',  chapters: 2  },
  { name: 'Zechariah',        testament: 'OT', abbreviation: 'Zec',  chapters: 14 },
  { name: 'Malachi',          testament: 'OT', abbreviation: 'Mal',  chapters: 4  },
  // New Testament
  { name: 'Matthew',          testament: 'NT', abbreviation: 'Mat',  chapters: 28 },
  { name: 'Mark',             testament: 'NT', abbreviation: 'Mar',  chapters: 16 },
  { name: 'Luke',             testament: 'NT', abbreviation: 'Luk',  chapters: 24 },
  { name: 'John',             testament: 'NT', abbreviation: 'Joh',  chapters: 21 },
  { name: 'Acts',             testament: 'NT', abbreviation: 'Act',  chapters: 28 },
  { name: 'Romans',           testament: 'NT', abbreviation: 'Rom',  chapters: 16 },
  { name: '1 Corinthians',    testament: 'NT', abbreviation: '1Co',  chapters: 16 },
  { name: '2 Corinthians',    testament: 'NT', abbreviation: '2Co',  chapters: 13 },
  { name: 'Galatians',        testament: 'NT', abbreviation: 'Gal',  chapters: 6  },
  { name: 'Ephesians',        testament: 'NT', abbreviation: 'Eph',  chapters: 6  },
  { name: 'Philippians',      testament: 'NT', abbreviation: 'Php',  chapters: 4  },
  { name: 'Colossians',       testament: 'NT', abbreviation: 'Col',  chapters: 4  },
  { name: '1 Thessalonians',  testament: 'NT', abbreviation: '1Th',  chapters: 5  },
  { name: '2 Thessalonians',  testament: 'NT', abbreviation: '2Th',  chapters: 3  },
  { name: '1 Timothy',        testament: 'NT', abbreviation: '1Ti',  chapters: 6  },
  { name: '2 Timothy',        testament: 'NT', abbreviation: '2Ti',  chapters: 4  },
  { name: 'Titus',            testament: 'NT', abbreviation: 'Tit',  chapters: 3  },
  { name: 'Philemon',         testament: 'NT', abbreviation: 'Phm',  chapters: 1  },
  { name: 'Hebrews',          testament: 'NT', abbreviation: 'Heb',  chapters: 13 },
  { name: 'James',            testament: 'NT', abbreviation: 'Jas',  chapters: 5  },
  { name: '1 Peter',          testament: 'NT', abbreviation: '1Pe',  chapters: 5  },
  { name: '2 Peter',          testament: 'NT', abbreviation: '2Pe',  chapters: 3  },
  { name: '1 John',           testament: 'NT', abbreviation: '1Jo',  chapters: 5  },
  { name: '2 John',           testament: 'NT', abbreviation: '2Jo',  chapters: 1  },
  { name: '3 John',           testament: 'NT', abbreviation: '3Jo',  chapters: 1  },
  { name: 'Jude',             testament: 'NT', abbreviation: 'Jud',  chapters: 1  },
  { name: 'Revelation',       testament: 'NT', abbreviation: 'Rev',  chapters: 22 },
]

export const OT_BOOKS = BIBLE_BOOKS.filter((b) => b.testament === 'OT')
export const NT_BOOKS = BIBLE_BOOKS.filter((b) => b.testament === 'NT')

/** Returns the number of chapters in a book. */
export function getChapterCount(book: string): number {
  const counts = VERSE_COUNTS[book]
  return counts ? counts.length - 1 : 0 // index 0 unused
}

/** Returns the number of verses in a chapter (1-based). */
export function getVerseCount(book: string, chapter: number): number {
  return VERSE_COUNTS[book]?.[chapter] ?? 0
}

/** Format a passage reference string. */
export function formatPassage(book: string, chapter: number, verseStart?: number | null, verseEnd?: number | null): string {
  if (!book) return ''
  let ref = `${book} ${chapter}`
  if (verseStart) {
    ref += `:${verseStart}`
    if (verseEnd && verseEnd !== verseStart) ref += `–${verseEnd}`
  }
  return ref
}
