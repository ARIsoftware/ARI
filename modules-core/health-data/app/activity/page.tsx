'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingState } from '@/modules/health-data/components/loading-state'

/** Activity now lives at the module root (/health-data); keep old links working. */
export default function HealthDataActivityRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/health-data')
  }, [router])
  return <LoadingState />
}
