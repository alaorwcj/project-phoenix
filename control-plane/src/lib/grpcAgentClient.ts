import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { createChannelCredentials, getTLSConfig } from './tlsConfig';
import { getLogger } from './logger';
const PROTO_PATH = path.join(__dirname, '../../proto/docker_platform.proto');

// Wire-format request/response shapes (snake_case) as produced by proto-loader
// with keepCase: true. These map directly to the .proto message fields.
export interface StartContainerWireRequest {
  command_id: string;
  host_id: string;
  container_id: string;
}

export interface StopContainerWireRequest {
  command_id: string;
  host_id: string;
  container_id: string;
  timeout_seconds: number;
}

export interface ContainerActionWireResponse {
  command_id: string;
  container_id: string;
  success: boolean;
  message: string;
}

export interface GetContainerLogsWireRequest {
  host_id: string;
  container_id: string;
  follow: boolean;
  timestamps: boolean;
  tail: number;
}

export interface ContainerLogWireEntry {
  container_id: string;
  data: Buffer;
  timestamp?: Date;
  stream: string;
}

interface AgentConnection {
  hostId: string;
  channel: grpc.Channel;
  client: any;
  createdAt: Date;
}

/**
 * Maintains gRPC client connections to individual agents.
 * Dispatches container operations (start, stop, logs) to connected agents.
 */
export class GrpcAgentClient {
  private connections: Map<string, AgentConnection> = new Map();
  private packageDef: any;
  private protoDescriptor: any;
  private log = getLogger({ component: 'grpc-agent-client' });

  async initialize() {
    this.packageDef = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    this.protoDescriptor = grpc.loadPackageDefinition(this.packageDef);
  }

  /**
   * Establish or reuse a gRPC channel to an agent.
   * Agents register themselves via the heartbeat, so we connect to their advertised address.
   */
  async getOrCreateConnection(hostId: string, agentAddress: string): Promise<AgentConnection> {
    const existing = this.connections.get(hostId);
    if (existing) {
      const state = existing.channel.getConnectivityState(false);
      // Skip reuse if TRANSIENT_FAILURE (3) or SHUTDOWN (4)
      if (state !== grpc.connectivityState.TRANSIENT_FAILURE && state !== grpc.connectivityState.SHUTDOWN) {
        return existing;
      }
      // Stale connection, remove and recreate
      existing.channel.close();
      this.connections.delete(hostId);
      this.log.warn({ hostId }, 'Replaced stale gRPC connection');
    }

    const credentials = createChannelCredentials(getTLSConfig());
    const channel = new grpc.Channel(agentAddress, credentials, {
      'grpc.max_receive_message_length': 100 * 1024 * 1024, // 100MB for logs
      'grpc.keepalive_time_ms': 30000,
      'grpc.keepalive_timeout_ms': 10000,
    });

    const dockerplatform = this.protoDescriptor.dockerplatform as any;
    const client = new dockerplatform.v1.HostAgentService(agentAddress, credentials);

    const conn: AgentConnection = {
      hostId,
      channel,
      client,
      createdAt: new Date(),
    };

    this.connections.set(hostId, conn);
    this.log.info({ hostId, agentAddress }, 'Created new gRPC connection to agent');
    return conn;
  }

  /**
   * Dispatch StartContainer RPC to agent.
   */
  async startContainer(
    hostId: string,
    agentAddress: string,
    request: StartContainerWireRequest
  ): Promise<ContainerActionWireResponse> {
    const log = getLogger({ component: 'grpc-agent-client', rpc: 'StartContainer', hostId });
    return new Promise((resolve, reject) => {
      this.getOrCreateConnection(hostId, agentAddress)
        .then((conn) => {
          conn.client.startContainer(request, (err: Error | null, response: any) => {
            if (err) {
              log.error({ err }, 'StartContainer RPC failed');
              reject(err);
            } else {
              log.info({ containerId: response?.container_id }, 'StartContainer RPC succeeded');
              resolve(response);
            }
          });
        })
        .catch(reject);
    });
  }

  /**
   * Dispatch StopContainer RPC to agent.
   */
  async stopContainer(
    hostId: string,
    agentAddress: string,
    request: StopContainerWireRequest
  ): Promise<ContainerActionWireResponse> {
    const log = getLogger({ component: 'grpc-agent-client', rpc: 'StopContainer', hostId });
    return new Promise((resolve, reject) => {
      this.getOrCreateConnection(hostId, agentAddress)
        .then((conn) => {
          conn.client.stopContainer(request, (err: Error | null, response: any) => {
            if (err) {
              log.error({ err }, 'StopContainer RPC failed');
              reject(err);
            } else {
              log.info({ containerId: response?.container_id }, 'StopContainer RPC succeeded');
              resolve(response);
            }
          });
        })
        .catch(reject);
    });
  }

  /**
   * Dispatch GetContainerLogs RPC to agent (streaming).
   * Returns an async iterable of log entries.
   */
  async *getContainerLogs(
    hostId: string,
    agentAddress: string,
    request: GetContainerLogsWireRequest
  ): AsyncGenerator<ContainerLogWireEntry, void, unknown> {
    const log = getLogger({ component: 'grpc-agent-client', rpc: 'GetContainerLogs', hostId });

    try {
      const conn = await this.getOrCreateConnection(hostId, agentAddress);
      const stream = conn.client.getContainerLogs(request);

      for await (const entry of stream) {
        yield entry;
      }

      log.info({ containerId: request.container_id }, 'GetContainerLogs stream completed');
    } catch (err) {
      log.error({ err, containerId: request.container_id }, 'GetContainerLogs stream failed');
      throw err;
    }
  }

  /**
   * Close all connections.
   */
  async closeAll() {
    for (const conn of this.connections.values()) {
      conn.channel.close();
    }
    this.connections.clear();
    this.log.info({}, 'Closed all gRPC connections to agents');
  }

  /**
   * Get connection stats for monitoring.
   */
  getConnectionStats() {
    return {
      totalConnections: this.connections.size,
      connections: Array.from(this.connections.values()).map((conn) => ({
        hostId: conn.hostId,
        createdAt: conn.createdAt,
        ageSeconds: Math.floor((Date.now() - conn.createdAt.getTime()) / 1000),
      })),
    };
  }
}

// Singleton instance
let agentClient: GrpcAgentClient | undefined;

export async function initializeGrpcAgentClient(): Promise<GrpcAgentClient> {
  if (!agentClient) {
    agentClient = new GrpcAgentClient();
    await agentClient.initialize();
  }
  return agentClient;
}

export function getGrpcAgentClient(): GrpcAgentClient {
  if (!agentClient) {
    throw new Error('gRPC agent client not initialized. Call initializeGrpcAgentClient() first.');
  }
  return agentClient;
}

export async function closeGrpcAgentClient(): Promise<void> {
  if (agentClient) {
    await agentClient.closeAll();
    agentClient = undefined;
  }
}
