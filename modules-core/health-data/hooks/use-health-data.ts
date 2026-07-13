/**
 * Health Data module - TanStack Query hooks
 *
 * The status query is the heartbeat of the module: it polls quickly while
 * an import is processing, slowly once data is loaded (to notice the
 * 1-hour expiry server-side), and not at all when nothing is loaded.
 * All data hooks are gated on a completed import.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { uploadStore } from '@/modules/health-data/hooks/upload-store'
import type {
  HealthImportStatus,
  HealthSummary,
  MetricSeries,
  HealthWorkout,
  HealthActivityDay,
  HealthSleepNight,
  HealthRoute,
  HealthEcg,
  HealthEcgDetail,
} from '@/modules/health-data/types'

const STATUS_KEY = ['health-data-status']
const DATA_KEY_PREFIX = 'health-data'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Request failed (${res.status})`)
  }
  return res.json()
}

export function useHealthStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: async (): Promise<HealthImportStatus | null> => {
      const data = await fetchJson<{ import: HealthImportStatus | null }>('/api/modules/health-data/status')
      return data.import
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'processing') return 1200
      if (status === 'completed') return 30_000
      return false
    },
  })
}

function useGatedQuery<T>(key: string, url: string, select: (raw: any) => T) {
  const { data: status } = useHealthStatus()
  return useQuery({
    queryKey: [DATA_KEY_PREFIX, key, status?.id],
    queryFn: async (): Promise<T> => select(await fetchJson<any>(url)),
    enabled: status?.status === 'completed',
    staleTime: Infinity,
  })
}

export function useHealthSummary() {
  return useGatedQuery<HealthSummary>('summary', '/api/modules/health-data/summary', (raw) => raw)
}

export function useHealthMetrics(types: string[]) {
  const { data: status } = useHealthStatus()
  const typesParam = [...types].sort().join(',')
  return useQuery({
    queryKey: [DATA_KEY_PREFIX, 'metrics', typesParam, status?.id],
    queryFn: async (): Promise<MetricSeries[]> => {
      const raw = await fetchJson<{ series: MetricSeries[] }>(
        `/api/modules/health-data/metrics?types=${encodeURIComponent(typesParam)}`
      )
      return raw.series
    },
    enabled: status?.status === 'completed' && types.length > 0,
    staleTime: Infinity,
  })
}

export function useHealthWorkouts() {
  return useGatedQuery<HealthWorkout[]>('workouts', '/api/modules/health-data/workouts', (raw) => raw.workouts)
}

export function useHealthActivity() {
  return useGatedQuery<HealthActivityDay[]>('activity', '/api/modules/health-data/activity', (raw) => raw.days)
}

export function useHealthSleep() {
  return useGatedQuery<HealthSleepNight[]>('sleep', '/api/modules/health-data/sleep', (raw) => raw.nights)
}

export function useHealthEcgs() {
  return useGatedQuery<HealthEcg[]>('ecgs', '/api/modules/health-data/ecgs', (raw) => raw.ecgs)
}

export function useHealthRoutes() {
  return useGatedQuery<HealthRoute[]>('routes', '/api/modules/health-data/routes', (raw) => raw.routes)
}

/** Full-resolution ECG strip, fetched lazily when a recording is enlarged */
export function useHealthEcgDetail(id: string | null) {
  const { data: status } = useHealthStatus()
  return useQuery({
    queryKey: [DATA_KEY_PREFIX, 'ecg-detail', id, status?.id],
    queryFn: async (): Promise<HealthEcgDetail> => {
      const raw = await fetchJson<{ ecg: HealthEcgDetail }>(`/api/modules/health-data/ecgs/${id}`)
      return raw.ecg
    },
    enabled: status?.status === 'completed' && id !== null,
    staleTime: Infinity,
  })
}

export interface UploadArgs {
  file: File
  onProgress?: (percent: number) => void
}

/** 4MB chunks — large request bodies get truncated by the dev server's
 * middleware body replay, so the zip is sent as many small sequential
 * POSTs instead of one big one. */
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024
const CHUNK_MAX_ATTEMPTS = 3
/** Statuses where retrying the same chunk cannot help */
const FATAL_UPLOAD_STATUSES = new Set([401, 403, 404, 413])

class UploadHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function postUpload(params: string, body?: Blob): Promise<any> {
  const res = await fetch(`/api/modules/health-data/upload?${params}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/octet-stream' } : undefined,
    body,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new UploadHttpError(json.error || `Upload failed (${res.status})`, res.status)
  }
  return json
}

/**
 * Chunks are retried on transient failures (network blips, 5xx, transport
 * truncation) so one hiccup doesn't restart a gigabyte upload. The server
 * treats a re-sent, already-applied chunk as idempotent success.
 */
async function postChunkWithRetry(params: string, body: Blob): Promise<any> {
  let lastError: unknown
  for (let attempt = 1; attempt <= CHUNK_MAX_ATTEMPTS; attempt++) {
    try {
      return await postUpload(params, body)
    } catch (error) {
      lastError = error
      if (error instanceof UploadHttpError && FATAL_UPLOAD_STATUSES.has(error.status)) {
        throw error
      }
      if (attempt < CHUNK_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt))
      }
    }
  }
  throw lastError
}

export function useUploadHealthData() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ file, onProgress }: UploadArgs): Promise<HealthImportStatus> => {
      // The singleton store (not mount-local state) is the source of truth
      // for upload progress, so every <HealthGate> mount sees it.
      uploadStore.start()
      const { upload_id: uploadId } = await postUpload('action=begin')

      const totalChunks = Math.ceil(file.size / UPLOAD_CHUNK_BYTES)
      for (let index = 0; index < totalChunks; index++) {
        const start = index * UPLOAD_CHUNK_BYTES
        const chunk = file.slice(start, Math.min(start + UPLOAD_CHUNK_BYTES, file.size))
        await postChunkWithRetry(`action=chunk&id=${uploadId}&index=${index}`, chunk)
        const percent = Math.round(((index + 1) / totalChunks) * 100)
        uploadStore.setPercent(percent)
        onProgress?.(percent)
      }

      const { import: importRow } = await postUpload(`action=finish&id=${uploadId}`)
      return importRow as HealthImportStatus
    },
    onSuccess: (importRow) => {
      uploadStore.finish()
      queryClient.setQueryData(STATUS_KEY, importRow)
      queryClient.invalidateQueries({ queryKey: STATUS_KEY })
    },
    onError: (error) => {
      uploadStore.fail(error instanceof Error ? error.message : 'Upload failed')
      // The server commits the import row and schedules the parse BEFORE
      // responding to `finish`, so a dropped finish response can be a
      // phantom failure — the import is actually running. Re-sending
      // finish isn't safe (the session is already deleted server-side);
      // instead refetch the status so a live import is discovered and the
      // gate shows the processing screen rather than the error.
      queryClient.invalidateQueries({ queryKey: STATUS_KEY })
    },
  })
}

export function usePurgeHealthData() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch('/api/modules/health-data/data', { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete health data')
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: STATUS_KEY })
      const previous = queryClient.getQueryData<HealthImportStatus | null>(STATUS_KEY)
      queryClient.setQueryData(STATUS_KEY, null)
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(STATUS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: STATUS_KEY })
      queryClient.removeQueries({ queryKey: [DATA_KEY_PREFIX] })
    },
  })
}
