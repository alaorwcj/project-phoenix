import axios from 'axios'
import type {
  PaginatedResponse,
  Host,
  Container,
  UsageSummary,
  LoginResponse,
  SystemStatus,
} from '../types'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

// Inject JWT from storage
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('docker-platform-auth')
  if (stored) {
    try {
      const { token } = JSON.parse(stored)
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      // ignore
    }
  }
  return config
})

// Handle 401 → clear auth
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('docker-platform-auth')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// --- Auth ---
export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post('/auth/login', { email, password })
  return data
}

// --- Status ---
export async function getStatus(): Promise<SystemStatus> {
  const { data } = await api.get('/status')
  return data
}

// --- Hosts ---
export async function listHosts(params: {
  limit?: number
  offset?: number
  status?: string
} = {}): Promise<PaginatedResponse<Host>> {
  const { data } = await api.get('/hosts', { params })
  return data
}

export async function getHost(id: string): Promise<Host> {
  const { data } = await api.get(`/hosts/${id}`)
  return data
}

// --- Containers ---
export async function listContainers(params: {
  limit?: number
  offset?: number
  status?: string
  hostId?: string
} = {}): Promise<PaginatedResponse<Container>> {
  const { data } = await api.get('/containers', { params })
  return data
}

export async function startContainer(payload: {
  name: string
  image: string
  hostId: string
  environmentId: string
  cpuShares?: number
  memoryMB?: number
}): Promise<Container> {
  const { data } = await api.post('/containers', payload)
  return data
}

export async function stopContainer(id: string): Promise<Container> {
  const { data } = await api.post(`/containers/${id}/stop`)
  return data
}

// --- Usage ---
export async function getUsageSummary(params: {
  from?: string
  to?: string
} = {}): Promise<UsageSummary> {
  const { data } = await api.get('/usage/summary', { params })
  return data
}

export default api
