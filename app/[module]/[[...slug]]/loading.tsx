/**
 * No spinner during module-route transitions. Next.js shows the previous
 * page's content (or nothing on a cold load) until the server component
 * finishes its auth + getEnabledModule + dynamic page-chunk import. Cleaner
 * than flashing a spinner for the brief delay.
 */
export default function ModuleLoading() {
  return null
}
