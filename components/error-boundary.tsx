/**
 * Error Boundary Component
 *
 * React Error Boundary for catching and displaying errors gracefully.
 * Used to wrap module pages to prevent crashes from affecting the entire app.
 *
 * IMPORTANT: Must be a client component ('use client')
 */

'use client'

import { Component, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: any) => void
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in child component tree,
 * logs those errors, and displays a fallback UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  /**
   * Update state when an error is caught
   */
  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error
    }
  }

  /**
   * Log error details when caught
   */
  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught error:', error, errorInfo)

    // Call optional error handler prop
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  /**
   * Reset error boundary state
   */
  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default fallback UI
      return (
        <div className="flex items-center justify-center min-h-96 p-6">
          <Card className="max-w-2xl w-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <CardTitle>Something went wrong</CardTitle>
                  <CardDescription>
                    An error occurred while rendering this page
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error details (development only) */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <p className="text-sm font-mono text-red-600 mb-2">
                    {this.state.error.name}: {this.state.error.message}
                  </p>
                  {this.state.error.stack && (
                    <pre className="text-xs text-gray-600 overflow-x-auto">
                      {this.state.error.stack}
                    </pre>
                  )}
                </div>
              )}

              {/* Production error message */}
              {process.env.NODE_ENV === 'production' && (
                <p className="text-sm text-muted-foreground">
                  The page encountered an unexpected error. Please try refreshing
                  or contact support if the problem persists.
                </p>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button onClick={() => window.location.reload()} variant="default">
                  Refresh Page
                </Button>
                <Button
                  onClick={this.resetErrorBoundary}
                  variant="outline"
                >
                  Try Again
                </Button>
                <Button
                  onClick={() => window.location.href = '/dashboard'}
                  variant="outline"
                >
                  Go to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    // No error, render children normally
    return this.props.children
  }
}

/**
 * Custom fallback component for module errors
 *
 * @param moduleName - Name of the module that crashed
 */
export function ModuleErrorFallback({ moduleName }: { moduleName: string }) {
  return (
    <div className="flex items-center justify-center min-h-96 p-6">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <CardTitle>Module Error</CardTitle>
              <CardDescription>
                {moduleName} encountered an error
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This module crashed unexpectedly. You can disable it in Settings or
            try refreshing the page.
          </p>

          <div className="flex gap-2">
            <Button onClick={() => window.location.reload()} variant="default">
              Refresh Page
            </Button>
            <Button
              onClick={() => window.location.href = '/settings'}
              variant="outline"
            >
              Go to Settings
            </Button>
            <Button
              onClick={() => window.location.href = '/dashboard'}
              variant="outline"
            >
              Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
