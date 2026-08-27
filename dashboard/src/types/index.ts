// API Types

export interface Tenant {
  id: string
  name: string
  createdAt: string
}

export interface User {
  id: string
  email: string
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER'
  tenantId: string
  createdAt: string
}

export interface Environment {
  id: string
  name: string
  slug: string
  description?: string
  tenantId: string
  createdAt: string
}

export type HostStatus = 'PENDING' | 'ONLINE' | 'OFFLINE'

export interface HostMetrics {
  cpuPercent: number
  memoryUsedBytes: number
  memoryTotalBytes: number
  runningContainers: number
}

export interface Host {
  id: string
  name: string
  hostname: string
  agentId: string
  status: HostStatus
  dockerVersion?: string
  lastHeartbeat?: string
  tenantId: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export type ContainerStatus = 'PENDING' | 'RUNNING' | 'STOPPED' | 'ERROR'

export interface Container {
  id: string
  name: string
  image: string
  dockerId?: string
  status: ContainerStatus
  hostId: string
  environmentId: string
  tenantId: string
  cpuShares?: number
  memoryMB?: number
  createdAt: string
  startedAt?: string
  stoppedAt?: string
}

export interface UsageSummary {
  tenantId: string
  totalCost: number
  totalHours: number
  containerCount: number
  period: { from: string; to: string }
}

export interface Pagination {
  limit: number
  offset: number
  total: number
  hasMore: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: Pagination
}

export interface LoginResponse {
  token: string
  user: User
}

export interface SystemStatus {
  status: string
  uptime: number
  version: string
  database: string
  grpc: string
}
