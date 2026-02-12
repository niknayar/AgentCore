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

// Arbitrary: non-empty error messages
const errorMessageArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

// Arbitrary: optional metadata representing error context
const errorMetadataArb = fc.option(
  fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.jsonValue(), {
    minKeys: 0,
    maxKeys: 3,
  }),
  { nil: undefined }
);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Feature: agentcore-bedrock-platform, Property 15: Error logs include ERROR severity and correlation ID
// **Validates: Requirements 9.4**
describe('Property 15: Error logs include ERROR severity and correlation ID', () => {
  test.prop(
    [correlationIdArb, componentArb, operationArb, errorMessageArb, errorMetadataArb],
    { numRuns: 100 }
  )(
    'error log entries have severity ERROR and include the originating correlation ID',
    (correlationId, component, operation, message, metadata) => {
      const logger = createLogger(correlationId, component);
      const entry = logger.error(operation, message, metadata);

      // Severity must be ERROR
      expect(entry.severity).toBe('ERROR');

      // Correlation ID must match the one provided at logger creation
      expect(entry.correlationId).toBe(correlationId);
      expect(entry.correlationId).toMatch(UUID_REGEX);
    }
  );
});
