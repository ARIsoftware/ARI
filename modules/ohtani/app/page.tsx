/**
 * Ohtani Module - Main Page
 *
 * A 9x9 grid where each cell can be edited with max 15 characters
 * Hover over a cell to see edit icon, click to edit
 *
 * Features:
 * - Cell bindings: Some cells are bound together and sync in real-time
 * - When you edit one cell in a binding group, all cells in that group update
 * - Changes are saved to database for all bound cells
 *
 * Route: /ohtani
 */

'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/providers'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { Loader2, Pencil } from 'lucide-react'
import type { OhtaniGridCell } from '../types'

// Define cell binding groups - cells that should sync together
// Each outer 3x3 block's CENTER binds with corresponding position in center 3x3
// The 9 3x3 blocks have centers at: (1,1), (1,4), (1,7), (4,1), (4,4), (4,7), (7,1), (7,4), (7,7)
const BINDING_GROUPS = [
  [[1, 1], [3, 3]],  // Top-left 3x3 center ↔ center 3x3 position (7)
  [[1, 4], [3, 4]],  // Top-center 3x3 center ↔ center 3x3 position (8)
  [[1, 7], [3, 5]],  // Top-right 3x3 center ↔ center 3x3 position (9)
  [[4, 1], [4, 3]],  // Middle-left 3x3 center ↔ center 3x3 position (6)
  [[4, 7], [4, 5]],  // Middle-right 3x3 center ↔ center 3x3 position (2)
  [[7, 1], [5, 3]],  // Bottom-left 3x3 center ↔ center 3x3 position (5)
  [[7, 4], [5, 4]],  // Bottom-center 3x3 center ↔ center 3x3 position (4)
  [[7, 7], [5, 5]]   // Bottom-right 3x3 center ↔ center 3x3 position (3)
]

// Helper to get all bound cells for a given cell (including itself)
function getBoundCells(row: number, col: number): Array<[number, number]> {
  for (const group of BINDING_GROUPS) {
    if (group.some(([r, c]) => r === row && c === col)) {
      return group
    }
  }
  return [[row, col]] // No binding, return just itself
}

export default function OhtaniPage() {
  const { session } = useSupabase()

  // Check if quotes module is enabled
  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')

  const [cells, setCells] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null)
  const [randomQuote, setRandomQuote] = useState<{ quote: string; author?: string } | null>(null)

  // Load grid data on mount
  useEffect(() => {
    if (session?.access_token) {
      loadGrid()
    }
  }, [session])

  // Load random quote when quotes module is confirmed enabled
  useEffect(() => {
    if (session?.access_token && quotesEnabled && !quotesLoading) {
      loadRandomQuote()
    }
  }, [session, quotesEnabled, quotesLoading])

  /**
   * Fetch a random quote from the quotes module
   */
  const loadRandomQuote = async () => {
    try {
      const response = await fetch('/api/modules/quotes/quotes', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) return

      const quotes = await response.json()
      if (quotes && quotes.length > 0) {
        const randomIndex = Math.floor(Math.random() * quotes.length)
        setRandomQuote(quotes[randomIndex])
      }
    } catch (err) {
      console.error('Error loading quote:', err)
    }
  }

  /**
   * Fetch all grid cells from the API
   */
  const loadGrid = async () => {
    try {
      setLoading(true)

      const response = await fetch('/api/modules/ohtani/data', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load grid')
      }

      const data = await response.json()

      // Convert array to Map for easy lookup
      const cellMap = new Map<string, string>()
      data.cells.forEach((cell: OhtaniGridCell) => {
        const key = `${cell.row_index}-${cell.col_index}`
        cellMap.set(key, cell.content)
      })

      setCells(cellMap)
    } catch (err) {
      console.error('Error loading grid:', err)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Update a cell value in the database
   * Note: State is updated optimistically before calling this
   */
  const updateCell = async (row: number, col: number, content: string) => {
    try {
      const response = await fetch('/api/modules/ohtani/data', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          row_index: row,
          col_index: col,
          content: content
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update cell')
      }

      // Success - optimistic update was correct
    } catch (err) {
      console.error('Error updating cell:', err)
      // On error, reload grid to get actual state
      loadGrid()
    }
  }

  /**
   * Handle cell click to start editing
   */
  const handleCellClick = (row: number, col: number) => {
    const key = `${row}-${col}`
    const currentValue = cells.get(key) || ''
    setEditingCell({ row, col })
    setEditValue(currentValue)
  }

  /**
   * Handle real-time input changes - updates all bound cells as user types
   */
  const handleInputChange = (value: string) => {
    setEditValue(value)

    if (editingCell) {
      // Update all bound cells in real-time
      const boundCells = getBoundCells(editingCell.row, editingCell.col)
      const newCells = new Map(cells)

      boundCells.forEach(([r, c]) => {
        const key = `${r}-${c}`
        newCells.set(key, value)
      })

      setCells(newCells)
    }
  }

  /**
   * Handle input blur to save changes
   */
  const handleInputBlur = () => {
    if (editingCell) {
      // Get all bound cells for this cell
      const boundCells = getBoundCells(editingCell.row, editingCell.col)

      // Exit editing mode
      setEditingCell(null)
      setEditValue('')

      // Save all bound cells to database in background
      boundCells.forEach(([r, c]) => {
        updateCell(r, c, editValue)
      })
    }
  }

  /**
   * Handle Enter key to save
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputBlur()
    } else if (e.key === 'Escape') {
      setEditingCell(null)
      setEditValue('')
    }
  }

  /**
   * Get cell content
   */
  const getCellContent = (row: number, col: number): string => {
    const key = `${row}-${col}`
    return cells.get(key) || ''
  }

  // Loading state
  if (!session || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 w-full mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-medium">Ohtani</h1>
        {quotesEnabled && randomQuote && (
          <p className="text-sm text-[#aa2020] mt-1">
            {randomQuote.quote}
          </p>
        )}
      </div>

      {/* 9x9 Grid */}
      <div className="flex justify-center w-full">
        <div className="grid grid-cols-9 border-4 border-black w-[95%]">
          {Array.from({ length: 9 }).map((_, rowIndex) => (
            Array.from({ length: 9 }).map((_, colIndex) => {
              const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex
              const isHovered = hoveredCell?.row === rowIndex && hoveredCell?.col === colIndex
              const isBlockBorder = (colIndex + 1) % 3 === 0 && colIndex !== 8
              const isBottomBlockBorder = (rowIndex + 1) % 3 === 0 && rowIndex !== 8

              // Pattern: rows where row%3===1 start with gray (G W G...), others start with white (W G W...)
              const startsWithGray = rowIndex % 3 === 1
              const isEvenCol = colIndex % 2 === 0
              const isGray = startsWithGray === isEvenCol

              return (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  className={`
                    relative w-full aspect-square border border-gray-300
                    ${isBlockBorder ? 'border-r-2 border-r-black' : ''}
                    ${isBottomBlockBorder ? 'border-b-2 border-b-black' : ''}
                    ${isGray ? 'bg-gray-100' : 'bg-white'}
                    ${isHovered && !isEditing ? 'bg-yellow-100' : ''}
                    cursor-pointer
                    transition-colors
                    flex items-center justify-center
                  `}
                  onClick={() => handleCellClick(rowIndex, colIndex)}
                  onMouseEnter={() => setHoveredCell({ row: rowIndex, col: colIndex })}
                  onMouseLeave={() => setHoveredCell(null)}
                >
                  {isEditing ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => handleInputChange(e.target.value.slice(0, 15))}
                      onBlur={handleInputBlur}
                      onKeyDown={handleKeyDown}
                      maxLength={15}
                      autoFocus
                      className="w-full h-full text-center text-xs sm:text-sm md:text-base p-1 outline-none bg-transparent"
                    />
                  ) : (
                    <>
                      <span className="text-xs sm:text-sm md:text-base text-center px-1 break-all">
                        {getCellContent(rowIndex, colIndex)}
                      </span>
                      {isHovered && (
                        <div className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1">
                          <Pencil className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="text-center text-sm text-gray-600">
        <p>Hover over any square to see the edit icon. Click to edit (max 15 characters).</p>
      </div>
    </div>
  )
}
