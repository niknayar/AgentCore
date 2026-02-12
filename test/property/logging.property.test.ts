import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { createLogger } from '../../lambda/business-logic/logger';

// Arbitrary: UUID-like correlation IDs
const correlationIdArb = fc.uuid();

// Arbitrary: non-empty component names
const componentArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

// Arbitrary: non-empty operation names
const operationArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

// Arbitrary: non-empty messages
const messageArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

// Arbitrary: optional metadata
const metadataArb = fc.option(
  fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.jsonValue(), {
    minKeys: 0,
    maxKeys: 3,
  }),
  { nil: undefined }
);

// Arbitrary: severity level for choosing which log method to call
const severityChoiceArb = fc.constantFrom('info', 'warn', 'error') as fc.Arbitrary<
  'info' | 'warn' | 'error'
>;

// Arbitrary: non-empty payload string for lambdaLog
const payloadArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0);

// Arbitrary: non-negative duration
const durationArb = fc.nat({ max: 30000 });

// Arbitrary: outcome status string
const outcomeArb = fc.constantFrom('success', 'failure', 'error', 'timeout');

// UUID v4 pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ISO 8601 timestamp pattern
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

// Feature: agentcore-bedrock-platform, Property 14: Structured logging contains required fields
// **Validates: Requirements 9.1, 9.2**
describe('Property 14: Structured logging contains required fields', () => {
  test.prop(
    [correlationIdArb, componentArb, operationArb, messageArb, severityChoiceArb, metadataArb],
    { numRuns: 100 }
  )(
    'every log entry contains correlationId (UUID), timestamp (ISO 8601), component, and operation',
    (correlationId, component, operation, message, severityChoice, metadata) => {
      const logger = createLogger(correlationId, component);
      const entry = logger[severityChoice](operation, message, metadata);

      // correlationId is a valid UUID
      expect(entry.correlationId).toBe(correlationId);
      expect(entry.correlationId).toMatch(UUID_REGEX);

      // timestamp is ISO 8601
      expect(entry.timestamp).toMatch(ISO_8601_REGEX);

      // component and operation are present and match inputs
      expect(entry.component).toBe(component);
      expect(entry.operation).toBe(operation);
    }
  );

  test.prop(
    [correlationIdArb, componentArb, operationArb, messageArb, payloadArb, durationArb, outcomeArb, metadataArb],
    { numRuns: 100 }
  )(
    'Lambda log entries additionally contain payloadHash, processingDurationMs, and outcomeStatus',
    (correlationId, component, operation, message, payload, duration, outcome, metadata) => {
      const logger = createLogger(correlationId, component);
      const entry = logger.lambdaLog(operation, message, payload, duration, outcome, metadata);

      // Base fields still present
      expect(entry.correlationId).toBe(correlationId);
      expect(entry.correlationId).toMatch(UUID_REGEX);
      expect(entry.timestamp).toMatch(ISO_8601_REGEX);
      expect(entry.component).toBe(component);
      expect(entry.operation).toBe(operation);

      // Lambda-specific fields
      expect(typeof entry.payloadHash).toBe('string');
      expect(entry.payloadHash).toHaveLength(64); // SHA-256 hex digest

      expect(typeof entry.processingDurationMs).toBe('number');
      expect(entry.processingDurationMs).toBeGreaterThanOrEqual(0);

      expect(typeof entry.outcomeStatus).toBe('string');
      expect(entry.outcomeStatus.length).toBeGreaterThan(0);
    }
  );
});
