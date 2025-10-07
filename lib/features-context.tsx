"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface FeaturesContextType {
  features: Record<string, boolean>
  isFeatureEnabled: (featureName: string) => boolean
  loading: boolean
}

const FeaturesContext = createContext<FeaturesContextType | undefined>(undefined)

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
  }, [])

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
