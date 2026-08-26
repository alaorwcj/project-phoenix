import * as fs from 'fs';
import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import { env } from '../config/env';

export interface TLSConfig {
  enabled: boolean;
  certPath?: string;
  keyPath?: string;
  caPath?: string;
}

export function getTLSConfig(): TLSConfig {
  return {
    enabled: env.TLS_ENABLED,
    certPath: env.TLS_CERT_PATH,
    keyPath: env.TLS_KEY_PATH,
    caPath: env.TLS_CA_PATH,
  };
}

export function validateTLSConfig(config: TLSConfig): void {
  if (!config.enabled) {
    return;
  }

  const paths = [config.certPath, config.keyPath, config.caPath];
  const names = ['TLS_CERT_PATH', 'TLS_KEY_PATH', 'TLS_CA_PATH'];

  for (let i = 0; i < paths.length; i++) {
    const filePath = paths[i];
    const name = names[i];

    if (!filePath) {
      throw new Error(`${name} is required when TLS_ENABLED is true`);
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`${name} file not found: ${filePath}`);
    }
  }
}

export function createServerCredentials(config: TLSConfig): grpc.ServerCredentials {
  if (!config.enabled) {
    return grpc.ServerCredentials.createInsecure();
  }

  validateTLSConfig(config);

  const certChain = fs.readFileSync(config.certPath!);
  const privateKey = fs.readFileSync(config.keyPath!);
  const ca = fs.readFileSync(config.caPath!);

  return grpc.ServerCredentials.createSsl(
    ca,
    [{ private_key: privateKey, cert_chain: certChain }],
    true, // request client certificate
  );
}

export function createChannelCredentials(config: TLSConfig): grpc.ChannelCredentials {
  if (!config.enabled) {
    return grpc.credentials.createInsecure();
  }

  validateTLSConfig(config);

  const certChain = fs.readFileSync(config.certPath!);
  const privateKey = fs.readFileSync(config.keyPath!);
  const ca = fs.readFileSync(config.caPath!);

  return grpc.credentials.createSsl(ca, privateKey, certChain);
}

export function resolveCertPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}
