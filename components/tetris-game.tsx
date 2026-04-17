"use client"

import dynamic from "next/dynamic"
import "@/app/tetris.css"

const Tetris = dynamic(() => import("react-tetris"), { ssr: false })

export function TetrisGame() {
  return (
    <Tetris
      keyboardControls={{
        down: "MOVE_DOWN",
        left: "MOVE_LEFT",
        right: "MOVE_RIGHT",
        space: "HARD_DROP",
        z: "FLIP_COUNTERCLOCKWISE",
        x: "FLIP_CLOCKWISE",
        up: "FLIP_CLOCKWISE",
        p: "TOGGLE_PAUSE",
        c: "HOLD",
        shift: "HOLD",
      }}
    >
      {({
        HeldPiece,
        Gameboard,
        PieceQueue,
        points,
        linesCleared,
        state,
        controller,
      }) => (
        <div className="flex gap-8 items-start">
          <div className="flex flex-col items-center tetris-sidebar-hidden">
            <div className="tetris-side-panel">
              <HeldPiece />
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex gap-16 mb-4 font-mono text-sm">
              <div className="text-center">
                <div className="text-gray-500 mb-1">points</div>
                <div className="text-2xl font-bold tracking-wider">
                  {points.toString().padStart(4, "0")}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-500 mb-1">lines</div>
                <div className="text-2xl font-bold tracking-wider">
                  {linesCleared.toString().padStart(4, "0")}
                </div>
              </div>
            </div>

            <div className="relative">
              <Gameboard />
              {state === "LOST" && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="bg-white p-8 rounded-lg text-center">
                    <h2 className="text-2xl font-bold mb-4">Game Over</h2>
                    <button
                      onClick={controller.restart}
                      className="bg-black text-white px-6 py-2 rounded hover:bg-gray-800 transition-colors"
                    >
                      New game
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 flex gap-16 tetris-controls-hidden">
              <div className="flex flex-col items-center">
                <div className="grid grid-cols-3 gap-1 w-32 h-32">
                  <div></div>
                  <button className="tetris-button" onClick={() => controller.flipClockwise()}>↑</button>
                  <div></div>
                  <button className="tetris-button" onClick={() => controller.moveLeft()}>←</button>
                  <button className="tetris-button" onClick={() => controller.hardDrop()}>⏬</button>
                  <button className="tetris-button" onClick={() => controller.moveRight()}>→</button>
                  <div></div>
                  <button className="tetris-button" onClick={() => controller.moveDown()}>↓</button>
                  <div></div>
                </div>
              </div>
              <div className="flex flex-col justify-center gap-2">
                <button className="tetris-action-button" onClick={() => controller.flipClockwise()}>↻</button>
                <button className="tetris-action-button" onClick={() => controller.flipCounterclockwise()}>↺</button>
                <button className="tetris-action-button" onClick={() => controller.hold()}>H</button>
                <button className="tetris-action-button" onClick={() => controller.pause()}>P</button>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center tetris-sidebar-hidden">
            <div className="tetris-side-panel">
              <PieceQueue />
            </div>
          </div>
        </div>
      )}
    </Tetris>
  )
}
