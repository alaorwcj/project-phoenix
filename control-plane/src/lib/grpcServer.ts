import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { hostAgentRepository } from '../repositories/hostAgentRepository';
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
      const { container_id } = call.request;
      callback(null, { container_id, success: true, message: 'Container start queued' });
    } catch (error) {
      callback(error as Error);
    }
  }

  private async stopContainer(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    try {
      const { container_id } = call.request;
      callback(null, { container_id, success: true, message: 'Container stop queued' });
    } catch (error) {
      callback(error as Error);
    }
  }

  private async *getContainerLogs(call: grpc.ServerWritableStream<any, any>) {
    try {
      const { container_id } = call.request;
      call.write({ container_id, data: Buffer.from('Log streaming not yet implemented'), stream: 'stdout' });
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