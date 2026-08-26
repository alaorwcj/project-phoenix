import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { hostAgentRepository } from '../repositories/hostAgentRepository';
import { createContainerService } from '../services/containerService';
import { createServerCredentials, getTLSConfig } from './tlsConfig';
import { getLogger } from './logger';
import { observeGrpcOperation } from './metrics';
import { createTraceId } from './trace';
import type {
  RegisterHostRequest,
  RegisterHostResponse,
  HeartbeatRequest,
  HeartbeatResponse,
  StartContainerRequest,
  StopContainerRequest,
  ContainerActionResponse,
  GetContainerLogsRequest,
  ContainerLogEntry,
} from '../proto/docker_platform';

const PROTO_PATH = path.join(__dirname, '../../proto/docker_platform.proto');

export class GrpcServer {
  private server: grpc.Server;
  private port: number;
  private containerService = createContainerService();

  constructor(port: number) {
    this.server = new grpc.Server();
    this.port = port;
  }

  async start() {
    const packageDef = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDef);
    const dockerplatform = protoDescriptor.dockerplatform as any;

    this.server.addService(dockerplatform.v1.HostAgentService.service, {
      registerHost: this.registerHost.bind(this),
      heartbeat: this.heartbeat.bind(this),
      startContainer: this.startContainer.bind(this),
      stopContainer: this.stopContainer.bind(this),
      getContainerLogs: this.getContainerLogs.bind(this),
    });

    return new Promise<void>((resolve, reject) => {
      const addr = '0.0.0.0:' + this.port;
      const tlsConfig = getTLSConfig();
      const credentials = createServerCredentials(tlsConfig);
      const tlsMode = tlsConfig.enabled ? 'mTLS' : 'insecure';

      this.server.bindAsync(addr, credentials, (err: Error | null) => {
        if (err) reject(err);
        else {
          this.server.start();
          const msg = `gRPC server listening on 0.0.0.0:${this.port} (${tlsMode})`;
          getLogger({ component: 'grpc-server', port: this.port, tlsMode }).info(
            {},
            msg
          );
          resolve();
        }
      });
    });
  }

  private async registerHost(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const startedAt = process.hrtime.bigint();
    const traceId = getTraceIdFromCall(call);
    const log = getLogger({ component: 'grpc-server', rpc: 'RegisterHost', traceId });
    const finish = (status: 'ok' | 'error', error: Error | null, response?: any) => {
      observeGrpcOperation('RegisterHost', status, Number(process.hrtime.bigint() - startedAt) / 1e9);
      if (status === 'ok') {
        log.info({ hostId: response?.host_id, tenantId: response?.tenant_id }, 'RegisterHost handled');
      } else if (error) {
        log.error({ err: error }, 'RegisterHost failed');
      }
      callback(error as any, response);
    };

    try {
      const { agent_id, hostname, operating_system, docker_version } = call.request;
      if (!agent_id || !hostname) return finish('error', new Error('Missing required fields'));

      const host = await hostAgentRepository.registerAgent('default-tenant', agent_id, {
        name: hostname,
        hostname,
        metadata: { os: operating_system, docker_version },
      });

      finish('ok', null, { host_id: host.id, tenant_id: host.tenantId, accepted: true, message: 'Host registered' });
    } catch (error) {
      finish('error', error as Error);
    }
  }

  private async heartbeat(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const startedAt = process.hrtime.bigint();
    const traceId = getTraceIdFromCall(call);
    const log = getLogger({ component: 'grpc-server', rpc: 'Heartbeat', traceId });
    const finish = (status: 'ok' | 'error', error: Error | null, response?: any) => {
      observeGrpcOperation('Heartbeat', status, Number(process.hrtime.bigint() - startedAt) / 1e9);
      if (status === 'ok') {
        log.info({ hostId: call.request?.host_id }, 'Heartbeat handled');
      } else if (error) {
        log.error({ err: error }, 'Heartbeat failed');
      }
      callback(error as any, response);
    };

    try {
      const { host_id, agent_id, metrics } = call.request;
      if (!host_id || !agent_id) return finish('error', new Error('Missing host_id or agent_id'));

      await hostAgentRepository.updateHeartbeat(host_id, metrics);

      finish('ok', null, { acknowledged: true, server_time: new Date() });
    } catch (error) {
      finish('error', error as Error);
    }
  }

  private async startContainer(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const startedAt = process.hrtime.bigint();
    const traceId = getTraceIdFromCall(call);
    const log = getLogger({ component: 'grpc-server', rpc: 'StartContainer', traceId });
    const finish = (status: 'ok' | 'error', error: Error | null, response?: any) => {
      observeGrpcOperation('StartContainer', status, Number(process.hrtime.bigint() - startedAt) / 1e9);
      if (status === 'ok') {
        log.info({ containerId: response?.container_id, commandId: response?.command_id }, 'StartContainer handled');
      } else if (error) {
        log.error({ err: error }, 'StartContainer failed');
      }
      callback(error as any, response);
    };

    try {
      const { command_id, host_id, container_id } = call.request;
      if (!command_id || !host_id || !container_id) {
        return finish('error', new Error('Missing required fields: command_id, host_id, container_id'));
      }

      // Find container and verify it belongs to correct host
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      
      const container = await prisma.container.findUnique({
        where: { id: container_id },
      });

      if (!container || container.hostId !== host_id) {
        return finish('error', new Error(`Container ${container_id} not found on host ${host_id}`));
      }

      // Update status to CREATING
      await this.containerService.updateContainerStatus(container.tenantId, container_id, 'CREATING' as any);

      finish('ok', null, {
        command_id,
        container_id,
        success: true,
        message: 'Container start operation queued',
      });
    } catch (error) {
      finish('error', error as Error);
    }
  }

  private async stopContainer(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const startedAt = process.hrtime.bigint();
    const traceId = getTraceIdFromCall(call);
    const log = getLogger({ component: 'grpc-server', rpc: 'StopContainer', traceId });
    const finish = (status: 'ok' | 'error', error: Error | null, response?: any) => {
      observeGrpcOperation('StopContainer', status, Number(process.hrtime.bigint() - startedAt) / 1e9);
      if (status === 'ok') {
        log.info({ containerId: response?.container_id, commandId: response?.command_id }, 'StopContainer handled');
      } else if (error) {
        log.error({ err: error }, 'StopContainer failed');
      }
      callback(error as any, response);
    };

    try {
      const { command_id, host_id, container_id, timeout_seconds } = call.request;
      if (!command_id || !host_id || !container_id) {
        return finish('error', new Error('Missing required fields'));
      }

      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      const container = await prisma.container.findUnique({
        where: { id: container_id },
      });

      if (!container || container.hostId !== host_id) {
        return finish('error', new Error(`Container ${container_id} not found on host ${host_id}`));
      }

      // Update status to STOPPING
      await this.containerService.updateContainerStatus(container.tenantId, container_id, 'STOPPING' as any);

      finish('ok', null, {
        command_id,
        container_id,
        success: true,
        message: `Container stop operation queued (timeout: ${timeout_seconds || 15}s)`,
      });
    } catch (error) {
      finish('error', error as Error);
    }
  }

  private async *getContainerLogs(call: grpc.ServerWritableStream<any, any>) {
    const startedAt = process.hrtime.bigint();
    const traceId = getTraceIdFromCall(call);
    const log = getLogger({ component: 'grpc-server', rpc: 'GetContainerLogs', traceId });
    const finish = (status: 'ok' | 'error', error?: Error) => {
      observeGrpcOperation('GetContainerLogs', status, Number(process.hrtime.bigint() - startedAt) / 1e9);
      if (error) {
        log.error({ err: error }, 'GetContainerLogs failed');
        call.destroy(error);
      } else {
        log.info({ containerId: call.request?.container_id }, 'GetContainerLogs handled');
      }
    };

    try {
      const { host_id, container_id, follow, tail } = call.request;
      
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      const container = await prisma.container.findUnique({
        where: { id: container_id },
      });

      if (!container || container.hostId !== host_id) {
        finish('error', new Error(`Container ${container_id} not found on host ${host_id}`));
        return;
      }

      // Query logs from database
      const logs = await prisma.containerLog.findMany({
        where: {
          containerId: container_id,
        },
        orderBy: {
          timestamp: 'asc',
        },
        take: tail || 100,
      });

      // Send log entries
      for (const log of logs) {
        call.write({
          container_id,
          data: log.data,
          timestamp: log.timestamp,
          stream: log.stream,
        });
      }

      // If follow mode, keep stream open (in production, would subscribe to new logs)
      if (follow) {
        // TODO: Implement log tailing with subscription
        call.write({
          container_id,
          data: Buffer.from('(streaming mode - new logs would appear here)'),
          stream: 'stdout',
        });
      }

      call.end();
      finish('ok');
    } catch (error) {
      finish('error', error as Error);
    }
  }

  async stop() {
    return new Promise<void>((resolve) => {
      this.server.tryShutdown(() => resolve());
    });
  }
}

function getTraceIdFromCall(call: { metadata?: grpc.Metadata }) {
  const value = call.metadata?.get('x-trace-id')?.[0];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Buffer.isBuffer(value)) {
    const traceId = value.toString('utf8').trim();
    if (traceId) return traceId;
  }
  return createTraceId();
}