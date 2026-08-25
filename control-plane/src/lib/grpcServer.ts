import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { hostAgentRepository } from '../repositories/hostAgentRepository';
import { createContainerService } from '../services/containerService';
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
      this.server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err: Error | null) => {
        if (err) reject(err);
        else {
          this.server.start();
          const msg = 'gRPC server listening on 0.0.0.0:' + this.port;
          console.log(msg);
          resolve();
        }
      });
    });
  }

  private async registerHost(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    try {
      const { agent_id, hostname, operating_system, docker_version } = call.request;
      if (!agent_id || !hostname) return callback(new Error('Missing required fields') as any);

      const host = await hostAgentRepository.registerAgent('default-tenant', agent_id, {
        name: hostname,
        hostname,
        metadata: { os: operating_system, docker_version },
      });

      callback(null, { host_id: host.id, tenant_id: host.tenantId, accepted: true, message: 'Host registered' });
    } catch (error) {
      callback(error as Error);
    }
  }

  private async heartbeat(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    try {
      const { host_id, agent_id, metrics } = call.request;
      if (!host_id || !agent_id) return callback(new Error('Missing host_id or agent_id') as any);

      await hostAgentRepository.updateHeartbeat(host_id, metrics);

      callback(null, { acknowledged: true, server_time: new Date() });
    } catch (error) {
      callback(error as Error);
    }
  }

  private async startContainer(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    try {
      const { command_id, host_id, container_id } = call.request;
      if (!command_id || !host_id || !container_id) {
        return callback(new Error('Missing required fields: command_id, host_id, container_id') as any);
      }

      // Find container and verify it belongs to correct host
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      
      const container = await prisma.container.findUnique({
        where: { id: container_id },
      });

      if (!container || container.hostId !== host_id) {
        return callback(new Error(`Container ${container_id} not found on host ${host_id}`) as any);
      }

      // Update status to CREATING
      await this.containerService.updateContainerStatus(container.tenantId, container_id, 'CREATING' as any);

      callback(null, {
        command_id,
        container_id,
        success: true,
        message: 'Container start operation queued',
      });
    } catch (error) {
      callback(error as Error);
    }
  }

  private async stopContainer(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    try {
      const { command_id, host_id, container_id, timeout_seconds } = call.request;
      if (!command_id || !host_id || !container_id) {
        return callback(new Error('Missing required fields') as any);
      }

      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      const container = await prisma.container.findUnique({
        where: { id: container_id },
      });

      if (!container || container.hostId !== host_id) {
        return callback(new Error(`Container ${container_id} not found on host ${host_id}`) as any);
      }

      // Update status to STOPPING
      await this.containerService.updateContainerStatus(container.tenantId, container_id, 'STOPPING' as any);

      callback(null, {
        command_id,
        container_id,
        success: true,
        message: `Container stop operation queued (timeout: ${timeout_seconds || 15}s)`,
      });
    } catch (error) {
      callback(error as Error);
    }
  }

  private async *getContainerLogs(call: grpc.ServerWritableStream<any, any>) {
    try {
      const { host_id, container_id, follow, tail } = call.request;
      
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      const container = await prisma.container.findUnique({
        where: { id: container_id },
      });

      if (!container || container.hostId !== host_id) {
        call.destroy(new Error(`Container ${container_id} not found on host ${host_id}`));
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
    } catch (error) {
      call.destroy(error as Error);
    }
  }

  async stop() {
    return new Promise<void>((resolve) => {
      this.server.tryShutdown(() => resolve());
    });
  }
}