"use client"

export function TopNav() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-6 bg-black text-white flex items-center justify-between px-4">
      <div className="flex items-center">{/* Left side content if needed */}</div>
      <div className="flex items-center gap-4">
        <span className="text-white font-semibold text-xs">ARI</span>
      </div>
    </div>
  )
}
