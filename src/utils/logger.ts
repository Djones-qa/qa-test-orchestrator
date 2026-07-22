/**
 * Structured logger utility for QA Test Orchestrator.
 *
 * Exports two logger patterns:
 * 1. Logger class - configurable log level, writes to stdout/stderr with JSON output
 * 2. Default singleton - console-based logger with NODE_ENV-aware debug suppression
 *
 * Supports log levels: debug, info, warn, error (ascending severity).
 * Each log entry is emitted as a structured JSON line.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Logger class with configurable log level filtering.
 * Uses process.stdout.write / process.stderr.write for output.
 * Metadata is spread into the JSON entry at the top level.
 */
export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.level]) {
      return;
    }

    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    };

    const output = JSON.stringify(entry) + '\n';

    if (level === 'error' || level === 'warn') {
      process.stderr.write(output);
    } else {
      process.stdout.write(output);
    }
  }
}

/**
 * Console-based structured logger.
 * Uses console.log/warn/error for output routing.
 * Metadata is stored in a nested 'meta' field.
 * Suppresses debug in production (NODE_ENV=production).
 */
interface ConsoleLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

function createConsoleLogger(): ConsoleLogger {
  function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
    };

    if (meta !== undefined) {
      entry.meta = meta;
    }

    const json = JSON.stringify(entry);

    switch (level) {
      case 'error':
        console.error(json);
        break;
      case 'warn':
        console.warn(json);
        break;
      case 'debug':
        if (process.env['NODE_ENV'] === 'production') {
          return;
        }
        console.log(json);
        break;
      case 'info':
      default:
        console.log(json);
        break;
    }
  }

  return {
    info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
    error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
    debug: (message: string, meta?: Record<string, unknown>) => emit('debug', message, meta),
  };
}

/** Default console-based singleton logger instance. */
const consoleLogger = createConsoleLogger();

/** Named export for Logger class usage */
export const logger = new Logger('info');

/** Default export is the console-based logger */
export default consoleLogger;
