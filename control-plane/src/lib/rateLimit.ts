interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitEntry {
  requests: number[];  // timestamps
}

const store = new Map<string, RateLimitEntry>();

export function checkRateLimit(key: string, config: RateLimitConfig): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { requests: [] };
    store.set(key, entry);
  }

  // Evict old requests outside window
  entry.requests = entry.requests.filter(ts => ts > windowStart);

  if (entry.requests.length >= config.maxRequests) {
    const oldest = entry.requests[0];
    const retryAfterMs = oldest + config.windowMs - now;
    return { allowed: false, retryAfterMs };
  }

  entry.requests.push(now);
  return { allowed: true };
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.requests.length === 0 || entry.requests[entry.requests.length - 1] < now - 60000) {
      store.delete(key);
    }
  }
}, 300000);

export const RATE_LIMITS = {
  CONTAINER_OPS: { windowMs: 60_000, maxRequests: 10 },   // 10 ops/min per tenant
  API_WRITE: { windowMs: 60_000, maxRequests: 100 },       // 100 writes/min per user
  API_READ: { windowMs: 60_000, maxRequests: 500 },        // 500 reads/min per user
};
