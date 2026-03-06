"use client"

import { TetrisGame } from "@/components/tetris-game"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-base font-normal text-gray-600">
          This page could not be found. How about a game instead?
        </p>
      </div>
      <TetrisGame />
    </div>
  )
}
