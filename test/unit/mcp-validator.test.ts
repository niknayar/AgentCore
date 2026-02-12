import { describe, it, expect } from 'vitest';
import { validateDataExtractionResponse, validateActionResponse } from '../../lib/utils/mcp-validator';

describe('validateDataExtractionResponse', () => {
  it('accepts a well-formed response', () => {
    const response = {
      data: [{ id: 1 }],
      metadata: { source: 'legacy-db', recordCount: 1, queryDurationMs: 42 },
    };
    const result = validateDataExtractionResponse(response);
    expect(result.data).toHaveLength(1);
    expect(result.metadata.source).toBe('legacy-db');
  });

  it('rejects null', () => {
    expect(() => validateDataExtractionResponse(null)).toThrow('expected an object');
  });

  it('rejects missing data field', () => {
    expect(() => validateDataExtractionResponse({ metadata: { source: 'x', recordCount: 0, queryDurationMs: 0 } }))
      .toThrow('"data" must be an array');
  });

  it('rejects missing metadata', () => {
    expect(() => validateDataExtractionResponse({ data: [] })).toThrow('"metadata" must be an object');
  });

  it('rejects non-string metadata.source', () => {
    expect(() => validateDataExtractionResponse({ data: [], metadata: { source: 123, recordCount: 0, queryDurationMs: 0 } }))
      .toThrow('"metadata.source" must be a string');
  });
});

describe('validateActionResponse', () => {
  it('accepts a well-formed success response', () => {
    const result = validateActionResponse({ result: { key: 'val' }, status: 'success' });
    expect(result.status).toBe('success');
  });

  it('accepts a response with optional message', () => {
    const result = validateActionResponse({ result: {}, status: 'error', message: 'oops' });
    expect(result.message).toBe('oops');
  });

  it('rejects null', () => {
    expect(() => validateActionResponse(null)).toThrow('expected an object');
  });

  it('rejects invalid status', () => {
    expect(() => validateActionResponse({ result: {}, status: 'unknown' })).toThrow('"status" must be');
  });

  it('rejects array as result', () => {
    expect(() => validateActionResponse({ result: [], status: 'success' })).toThrow('"result" must be an object');
  });

  it('rejects non-string message', () => {
    expect(() => validateActionResponse({ result: {}, status: 'success', message: 42 }))
      .toThrow('"message" must be a string');
  });
});
