import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { validateDataExtractionResponse, validateActionResponse } from '../../lib/utils/mcp-validator';

// --- Arbitraries for valid responses ---

const validMetadataArb = fc.record({
  source: fc.string({ minLength: 1, maxLength: 50 }),
  recordCount: fc.nat(),
  queryDurationMs: fc.nat(),
});

const validDataExtractionResponseArb = fc.record({
  data: fc.array(fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.jsonValue()), { minLength: 0, maxLength: 5 }),
  metadata: validMetadataArb,
});

const validActionResponseArb = fc.record({
  result: fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.jsonValue()),
  status: fc.constantFrom('success' as const, 'error' as const),
  message: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
});

// --- Arbitraries for invalid responses ---

// Non-object values that should always be rejected
const nonObjectArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.string(),
  fc.boolean(),
);

// Data extraction response with a missing or wrong-typed field
const invalidDataExtractionArb = fc.oneof(
  // missing data
  fc.record({ metadata: validMetadataArb }).map((r) => r as unknown),
  // data is not an array
  fc.record({ data: fc.string(), metadata: validMetadataArb }).map((r) => r as unknown),
  // missing metadata
  fc.record({ data: fc.array(fc.dictionary(fc.string(), fc.jsonValue())) }).map((r) => r as unknown),
  // metadata.source is not a string
  fc.record({
    data: fc.array(fc.dictionary(fc.string(), fc.jsonValue())),
    metadata: fc.record({ source: fc.integer(), recordCount: fc.nat(), queryDurationMs: fc.nat() }),
  }).map((r) => r as unknown),
  // metadata.recordCount is not a number
  fc.record({
    data: fc.array(fc.dictionary(fc.string(), fc.jsonValue())),
    metadata: fc.record({ source: fc.string(), recordCount: fc.string(), queryDurationMs: fc.nat() }),
  }).map((r) => r as unknown),
  // metadata.queryDurationMs is not a number
  fc.record({
    data: fc.array(fc.dictionary(fc.string(), fc.jsonValue())),
    metadata: fc.record({ source: fc.string(), recordCount: fc.nat(), queryDurationMs: fc.string() }),
  }).map((r) => r as unknown),
);

// Action response with a missing or wrong-typed field
const invalidActionResponseArb = fc.oneof(
  // missing result
  fc.record({ status: fc.constantFrom('success', 'error') }).map((r) => r as unknown),
  // result is an array (not a plain object)
  fc.record({ result: fc.constant([]), status: fc.constantFrom('success', 'error') }).map((r) => r as unknown),
  // invalid status value
  fc.record({
    result: fc.dictionary(fc.string(), fc.jsonValue()),
    status: fc.string().filter((s) => s !== 'success' && s !== 'error'),
  }).map((r) => r as unknown),
  // message is not a string
  fc.record({
    result: fc.dictionary(fc.string(), fc.jsonValue()),
    status: fc.constantFrom('success', 'error'),
    message: fc.integer(),
  }).map((r) => r as unknown),
);

// Feature: agentcore-bedrock-platform, Property 11: MCP response schema validation
// **Validates: Requirements 7.5**
describe('Property 11: MCP response schema validation', () => {
  test.prop([validDataExtractionResponseArb], { numRuns: 100 })(
    'valid data extraction responses are accepted',
    (response) => {
      const result = validateDataExtractionResponse(response);
      expect(result.data).toEqual(response.data);
      expect(result.metadata.source).toBe(response.metadata.source);
      expect(result.metadata.recordCount).toBe(response.metadata.recordCount);
      expect(result.metadata.queryDurationMs).toBe(response.metadata.queryDurationMs);
    }
  );

  test.prop([nonObjectArb], { numRuns: 100 })(
    'non-object values are rejected for data extraction',
    (value) => {
      expect(() => validateDataExtractionResponse(value)).toThrow();
    }
  );

  test.prop([invalidDataExtractionArb], { numRuns: 100 })(
    'invalid data extraction responses are rejected',
    (response) => {
      expect(() => validateDataExtractionResponse(response)).toThrow();
    }
  );

  test.prop([validActionResponseArb], { numRuns: 100 })(
    'valid action responses are accepted',
    (response) => {
      const result = validateActionResponse(response);
      expect(result.status).toBe(response.status);
      expect(result.result).toEqual(response.result);
      if (response.message !== undefined) {
        expect(result.message).toBe(response.message);
      }
    }
  );

  test.prop([nonObjectArb], { numRuns: 100 })(
    'non-object values are rejected for action response',
    (value) => {
      expect(() => validateActionResponse(value)).toThrow();
    }
  );

  test.prop([invalidActionResponseArb], { numRuns: 100 })(
    'invalid action responses are rejected',
    (response) => {
      expect(() => validateActionResponse(response)).toThrow();
    }
  );
});
