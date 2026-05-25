'use client'

import { ApiReferenceReact } from '@scalar/api-reference-react'
import '@scalar/api-reference-react/style.css'

/**
 * Interactive API documentation powered by Scalar. Renders the full
 * /api/openapi.json spec with a sidebar of endpoints, schema browser, and
 * Try-It-Now console.
 *
 * Auth: gated by middleware via `protectedRoutes` — only signed-in users
 * reach this page. The spec is fetched same-origin so the session cookie
 * is forwarded automatically.
 */
export default function ApiDocsPage() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <ApiReferenceReact
        configuration={{
          url: '/api/openapi.json',
          // Suppress Scalar's "Ask AI" search-bar button. It auto-enables on
          // localhost; we don't ship an AI agent so the button would dead-end.
          agent: { disabled: true },
        }}
      />
    </div>
  )
}
