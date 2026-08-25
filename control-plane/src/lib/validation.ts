import { z } from 'zod';

export const ContainerNameSchema = z.string()
  .min(1).max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Container name must start with alphanumeric and contain only alphanumeric, underscore, dot, dash');

export const ImageNameSchema = z.string()
  .min(1).max(256)
  .regex(/^[a-z0-9]([a-z0-9._\-/:])*[a-z0-9]$|^[a-z0-9]$/, 'Invalid image name format');

export const ResourceLimitsSchema = z.object({
  cpuShares: z.number().int().min(0).max(1024).optional(),
  memory: z.number().int().min(0).max(17179869184).optional(), // 16GB max
  memorySwap: z.number().int().min(-1).optional(),
  pidsLimit: z.number().int().min(0).max(65535).optional(),
}).optional();

export const EnvVarSchema = z.record(
  z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid env var key'),
  z.string().max(8192)
).optional();

export const PortBindingSchema = z.record(
  z.string().regex(/^\d+\/(tcp|udp)$/, 'Port binding key must be "{port}/tcp" or "{port}/udp"'),
  z.array(z.object({
    HostIp: z.string().optional(),
    HostPort: z.string().regex(/^\d+$/).refine(v => parseInt(v) >= 1 && parseInt(v) <= 65535, 'Port must be 1-65535')
  }))
).optional();

export const StartContainerSchema = z.object({
  name: ContainerNameSchema,
  image: ImageNameSchema,
  hostId: z.string().uuid('hostId must be a valid UUID'),
  environmentVars: EnvVarSchema,
  resourceLimits: ResourceLimitsSchema,
  portBindings: PortBindingSchema,
});

export const StopContainerSchema = z.object({
  containerId: z.string().uuid('containerId must be a valid UUID'),
  timeoutSeconds: z.number().int().min(0).max(300).optional(),
});

export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): { data: T } | { error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const messages = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { error: messages };
  }
  return { data: result.data };
}
