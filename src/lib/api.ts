export type SolveResult = {
  status: 'reachable' | 'unreachable' | 'unknown' | 'error'
  progression?: string
  raw?: string
  error?: string
}

export type SolveInputPayload = {
  origin: string
  whiteBoard: string
  blackBoard: string
  blackMask: string
  whiteMask: string
}

export type SolveJobAccepted = {
  jobId: string
  status: 'queued' | 'running'
  input?: SolveInputPayload
}

export type SolveJobView = {
  jobId: string
  status: 'queued' | 'running' | 'finished' | 'error'
  result?: SolveResult
  error?: string
  input?: SolveInputPayload
}

const apiBase = (() => {
  const raw = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
  return raw.replace(/\/+$/, '')
})()

export const buildApiUrl = (path: string) => (apiBase ? `${apiBase}${path}` : path)
export const pollIntervalMs = Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? 1000)
export const pollTimeoutMs = Number(import.meta.env.VITE_POLL_TIMEOUT_MS ?? 0)

export const mockSolveResponse = (import.meta.env.VITE_MOCK_SOLVE_RESPONSE as string | undefined) ?? ''
