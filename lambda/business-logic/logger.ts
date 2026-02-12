import { createHash } from 'crypto';

export type Severity = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  correlationId: string;
  timestamp: string;
  component: string;
  operation: string;
  severity: Severity;
  durationMs?: number;
  status?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface LambdaLogEntry extends LogEntry {
  payloadHash: string;
  processingDurationMs: number;
  outcomeStatus: string;
}

export interface Logger {
  info(operation: string, message: string, metadata?: Record<string, unknown>): LogEntry;
  warn(operation: string, message: string, metadata?: Record<string, unknown>): LogEntry;
  error(operation: string, message: string, metadata?: Record<string, unknown>): LogEntry;
  lambdaLog(
    operation: string,
    message: string,
    payload: string,
    processingDurationMs: number,
    outcomeStatus: string,
    metadata?: Record<string, unknown>
  ): LambdaLogEntry;
}

function buildEntry(
  correlationId: string,
  component: string,
  severity: Severity,
  operation: string,
  message: string,
  metadata?: Record<string, unknown>
): LogEntry {
  const entry: LogEntry = {
    correlationId,
    timestamp: new Date().toISOString(),
    component,
    operation,
    severity,
    message,
    ...(metadata && { metadata }),
  };
  console.log(JSON.stringify(entry));
  return entry;
}

export function createLogger(correlationId: string, component = 'BusinessLogicLambda'): Logger {
  return {
    info(operation, message, metadata) {
      return buildEntry(correlationId, component, 'INFO', operation, message, metadata);
    },
    warn(operation, message, metadata) {
      return buildEntry(correlationId, component, 'WARN', operation, message, metadata);
    },
    error(operation, message, metadata) {
      return buildEntry(correlationId, component, 'ERROR', operation, message, metadata);
    },
    lambdaLog(operation, message, payload, processingDurationMs, outcomeStatus, metadata) {
      const payloadHash = createHash('sha256').update(payload).digest('hex');
      const entry: LambdaLogEntry = {
        correlationId,
        timestamp: new Date().toISOString(),
        component,
        operation,
        severity: 'INFO',
        message,
        payloadHash,
        processingDurationMs,
        outcomeStatus,
        ...(metadata && { metadata }),
      };
      console.log(JSON.stringify(entry));
      return entry;
    },
  };
}
