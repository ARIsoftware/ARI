"use client"

import { TetrisGame } from "@/components/tetris-game"

export function DatabaseErrorContent({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8 max-w-2xl">
        <h1 className="text-6xl font-bold mb-4">Database</h1>
        <p className="text-base font-normal text-gray-600 mb-6">
          The application cannot connect to the database. Please verify that
          your database connection environment variables are set correctly.
        </p>
        <div className="text-left inline-block">
          <ul className="space-y-3">
            <li className="flex items-start gap-3 text-sm text-gray-700">
              <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 mt-0.5">
                1
              </span>
              <span>
                Check your database host to ensure your
                database is running and your connection settings are correct.
              </span>
            </li>
            <li className="flex items-start gap-3 text-sm text-gray-700">
              <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 mt-0.5">
                2
              </span>
              <span>
                <strong>Local development:</strong> Check your{" "}
                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  .env.local
                </code>{" "}
                file to ensure the{" "}
                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  DATABASE_URL
                </code>{" "}
                is configured properly.
              </span>
            </li>
            <li className="flex items-start gap-3 text-sm text-gray-700">
              <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 mt-0.5">
                3
              </span>
              <span>
                <strong>Production / hosting environment:</strong> Verify that
                the required environment variables are defined in your hosting
                provider&apos;s environment settings.
              </span>
            </li>
          </ul>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-6 bg-black text-white px-6 py-2 rounded hover:bg-gray-800 transition-colors text-sm"
          >
            Try again
          </button>
        )}
      </div>
      <TetrisGame />
    </div>
  )
}
