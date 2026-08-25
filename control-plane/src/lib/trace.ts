import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';

const REQUEST_ID_HEADERS = ['x-request-id', 'x-correlation-id'] as const;
const TRACE_ID_HEADERS = ['x-trace-id'] as const;
const TRACEPARENT_HEADER = 'traceparent';

const requestTraceIds = new WeakMap<object, string>();

export interface TraceContext {
  requestId: string;
  traceId: string;
}

function readHeader(headers: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = headers[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
      return value[0].trim();
    }
  }

  return undefined;
}

export function createTraceId() {
  return randomUUID().replace(/-/g, '');
}

export function resolveRequestId(
  request: Pick<IncomingMessage, 'headers'> | { headers: Record<string, unknown> }
) {
  return readHeader(request.headers as Record<string, unknown>, REQUEST_ID_HEADERS) ?? randomUUID();
}

function resolveTraceId(headers: Record<string, unknown>) {
  const traceId = readHeader(headers, TRACE_ID_HEADERS);
  if (traceId) return traceId;

  const traceparent = readHeader(headers, [TRACEPARENT_HEADER]);
  if (traceparent) {
    const parts = traceparent.split('-');
    if (parts.length >= 4 && parts[1] && parts[1] !== '00000000000000000000000000000000') {
      return parts[1];
    }
  }

  return createTraceId();
}

export function resolveTraceContext(headers: Record<string, unknown>): TraceContext {
  return {
    requestId: resolveRequestId({ headers }),
    traceId: resolveTraceId(headers),
  };
}

export function setRequestTraceId(request: object, traceId: string) {
  requestTraceIds.set(request, traceId);
}

export function getRequestTraceId(request: object) {
  return requestTraceIds.get(request);
}
