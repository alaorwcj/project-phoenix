export interface StructuredLogger {
  child(bindings: Record<string, unknown>): StructuredLogger;
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
  debug(payload: unknown, message?: string): void;
  fatal(payload: unknown, message?: string): void;
  trace(payload: unknown, message?: string): void;
}

let appLogger: StructuredLogger | undefined;

export function setAppLogger(logger: StructuredLogger) {
  appLogger = logger;
}

export function getLogger(bindings: Record<string, unknown> = {}): StructuredLogger {
  if (appLogger) {
    return Object.keys(bindings).length > 0 ? appLogger.child(bindings) : appLogger;
  }

  const emit = (level: string, payload: unknown, message?: string) => {
    const fields =
      payload instanceof Error
        ? { error: payload.message, stack: payload.stack }
        : payload && typeof payload === 'object' && !Array.isArray(payload)
          ? payload
          : { payload };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level, ...bindings, ...fields, message }));
  };

  return {
    child(childBindings: Record<string, unknown>) {
      return getLogger({ ...bindings, ...childBindings });
    },
    info(payload: unknown, message?: string) {
      emit('info', payload, message);
    },
    warn(payload: unknown, message?: string) {
      emit('warn', payload, message);
    },
    error(payload: unknown, message?: string) {
      emit('error', payload, message);
    },
    debug(payload: unknown, message?: string) {
      emit('debug', payload, message);
    },
    fatal(payload: unknown, message?: string) {
      emit('fatal', payload, message);
    },
    trace(payload: unknown, message?: string) {
      emit('trace', payload, message);
    },
  } as StructuredLogger;
}
