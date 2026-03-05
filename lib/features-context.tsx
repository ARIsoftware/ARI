"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface FeaturesContextType {
  features: Record<string, boolean>
  isFeatureEnabled: (featureName: string) => boolean
  loading: boolean
}

const FeaturesContext = createContext<FeaturesContextType | undefined>(undefined)

interface FeaturesProviderProps {
  children: ReactNode
  /** Pre-fetched features from server-side */
  initialFeatures?: Record<string, boolean>
  isAuthenticated: boolean
  isAuthLoading: boolean
}

export function FeaturesProvider({ children, initialFeatures, isAuthenticated, isAuthLoading }: FeaturesProviderProps) {
  // Use initial features if provided (server-side), otherwise start empty
  const [features, setFeatures] = useState<Record<string, boolean>>(initialFeatures || {})
  // If we have initial features, no loading needed
  const [loading, setLoading] = useState(!initialFeatures)

  useEffect(() => {
    // Skip client-side fetch if we already have server-side features
    if (initialFeatures) {
      return
    }

    // Wait until auth state is determined
    if (isAuthLoading) {
      return
    }

    // Skip API call if not authenticated
    if (!isAuthenticated) {
      setLoading(false)
      return
    }

    const loadFeatures = async () => {
      try {
        const response = await fetch('/api/features')
        if (response.ok) {
          const data = await response.json()
          const featureMap: Record<string, boolean> = {}
          data.forEach((pref: { feature_name: string; enabled: boolean }) => {
            featureMap[pref.feature_name] = pref.enabled
          })
          setFeatures(featureMap)
        }
      } catch (error) {
        console.error('Error loading features:', error)
      } finally {
        setLoading(false)
      }
    }

    loadFeatures()
  }, [initialFeatures, isAuthLoading, isAuthenticated])

  const isFeatureEnabled = (featureName: string): boolean => {
    // Default to true if no preference is set
    return features[featureName] ?? true
  }

  return (
    <FeaturesContext.Provider value={{ features, isFeatureEnabled, loading }}>
      {children}
    </FeaturesContext.Provider>
  )
}

export function useFeatures() {
  const context = useContext(FeaturesContext)
  if (context === undefined) {
    throw new Error('useFeatures must be used within a FeaturesProvider')
  }
  return context
}
