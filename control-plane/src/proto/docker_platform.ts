/* Generated types from proto/docker_platform.proto */

export interface RegisterHostRequest {
  agentId: string;
  hostname: string;
  dockerVersion: string;
  operatingSystem: string;
  architecture: string;
  labels?: Record<string, string>;
}

export interface RegisterHostResponse {
  hostId: string;
  tenantId: string;
  accepted: boolean;
  message: string;
}

export interface HostMetrics {
  cpuPercent: number;
  memoryUsedBytes: bigint;
  memoryTotalBytes: bigint;
  diskUsedBytes: bigint;
  diskTotalBytes: bigint;
  runningContainers: number;
}

export interface HeartbeatRequest {
  hostId: string;
  agentId: string;
  metrics?: HostMetrics;
  observedAt?: Date;
}

export interface HeartbeatResponse {
  acknowledged: boolean;
  serverTime?: Date;
  pendingCommands: AgentCommand[];
}

export interface AgentCommand {
  commandId: string;
  type: string;
  parameters?: Record<string, string>;
}

export interface StartContainerRequest {
  commandId: string;
  hostId: string;
  containerId: string;
}

export interface StopContainerRequest {
  commandId: string;
  hostId: string;
  containerId: string;
  timeoutSeconds: number;
}

export interface ContainerActionResponse {
  commandId: string;
  containerId: string;
  success: boolean;
  message: string;
}

export interface GetContainerLogsRequest {
  hostId: string;
  containerId: string;
  follow: boolean;
  timestamps: boolean;
  tail: number;
}

export interface ContainerLogEntry {
  containerId: string;
  data: Buffer;
  timestamp?: Date;
  stream: string;
}

/* gRPC Service Interface */
export interface HostAgentServiceImpl {
  registerHost(request: RegisterHostRequest): Promise<RegisterHostResponse>;
  heartbeat(request: HeartbeatRequest): Promise<HeartbeatResponse>;
  startContainer(request: StartContainerRequest): Promise<ContainerActionResponse>;
  stopContainer(request: StopContainerRequest): Promise<ContainerActionResponse>;
  getContainerLogs(request: GetContainerLogsRequest): AsyncIterable<ContainerLogEntry>;
}
