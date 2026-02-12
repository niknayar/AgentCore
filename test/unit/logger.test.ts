import { describe, it, expect } from 'vitest';
import { createLogger } from '../../lambda/business-logic/logger';

describe('createLogger', () => {
  const logger = createLogger('corr-123', 'TestComponent');

  it('info() produces a log entry with required fields', () => {
    const entry = logger.info('testOp', 'hello');

    expect(entry.correlationId).toBe('corr-123');
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.component).toBe('TestComponent');
    expect(entry.operation).toBe('testOp');
    expect(entry.severity).toBe('INFO');
    expect(entry.message).toBe('hello');
  });

  it('error() sets severity to ERROR', () => {
    const entry = logger.error('failOp', 'something broke');

    expect(entry.severity).toBe('ERROR');
    expect(entry.correlationId).toBe('corr-123');
  });

  it('warn() sets severity to WARN', () => {
    const entry = logger.warn('warnOp', 'heads up');
    expect(entry.severity).toBe('WARN');
  });

  it('lambdaLog() includes payload hash, duration, and outcome', () => {
    const entry = logger.lambdaLog('process', 'done', '{"data":1}', 42, 'success');

    expect(entry.correlationId).toBe('corr-123');
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.component).toBe('TestComponent');
    expect(entry.operation).toBe('process');
    expect(entry.payloadHash).toHaveLength(64); // SHA-256 hex
    expect(entry.processingDurationMs).toBe(42);
    expect(entry.outcomeStatus).toBe('success');
  });

  it('includes metadata when provided', () => {
    const entry = logger.info('op', 'msg', { key: 'value' });
    expect(entry.metadata).toEqual({ key: 'value' });
  });

  it('defaults component to BusinessLogicLambda', () => {
    const defaultLogger = createLogger('corr-456');
    const entry = defaultLogger.info('op', 'msg');
    expect(entry.component).toBe('BusinessLogicLambda');
  });
});
