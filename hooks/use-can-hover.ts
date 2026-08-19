import * as React from "react"

/**
 * True when the primary pointer can hover (mouse / trackpad). Touch-only
 * devices report false, so hover-driven UI — e.g. the Mini sidebar's
 * expand-on-hover rail — can fall back to something reachable by tap.
 *
 * Defaults to true so the first paint matches the common (desktop) case; the
 * media query resolves on mount.
 */
export function useCanHover() {
  const [canHover, setCanHover] = React.useState(true)

  React.useEffect(() => {
    const mql = window.matchMedia("(hover: hover)")
    const onChange = () => setCanHover(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return canHover
}
