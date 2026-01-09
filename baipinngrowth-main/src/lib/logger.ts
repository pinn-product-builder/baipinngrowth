/**
 * Logger utility - Only logs in development mode
 * Use this instead of console.log/error/warn in production code
 */

type LogLevel = 'log' | 'error' | 'warn' | 'info' | 'debug';

const isDevelopment = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  error: (...args: unknown[]) => {
    if (isDevelopment) {
      console.error(...args);
    }
    // In production, you might want to send errors to an error tracking service
    // e.g., Sentry, LogRocket, etc.
  },
  
  warn: (...args: unknown[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },
  
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },
};

/**
 * Creates a scoped logger with a prefix
 */
export function createScopedLogger(scope: string) {
  return {
    log: (...args: unknown[]) => logger.log(`[${scope}]`, ...args),
    error: (...args: unknown[]) => logger.error(`[${scope}]`, ...args),
    warn: (...args: unknown[]) => logger.warn(`[${scope}]`, ...args),
    info: (...args: unknown[]) => logger.info(`[${scope}]`, ...args),
    debug: (...args: unknown[]) => logger.debug(`[${scope}]`, ...args),
  };
}

