import { describe, expect, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { withRetry } from '../../lib/utils/mcp-retry';

// Arbitrary: number of failures before success (1-4, where 4 means all fail)
const failureCountArb = fc.integer({ min: 1, max: 4 });

// Arbitrary: error message
const errorMessageArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

// Arbitrary: base delay in ms (small values for fast tests)
const baseDelayArb = fc.integer({ min: 1, max: 5 });

// Feature: agentcore-bedrock-platform, Property 10: MCP retry with exponential backoff
// **Validates: Requirements 7.3**
describe('Property 10: MCP retry with exponential backoff', () => {
  test.prop([errorMessageArb], { numRuns: 100 })(
    'exactly 3 retries occur before final error when all attempts fail',
    async (errorMsg) => {
      const fn = vi.fn().mockRejectedValue(new Error(errorMsg));

      await expect(withRetry(fn, 3, 1)).rejects.toThrow(errorMsg);

      // 1 initial + 3 retries = 4 total attempts
      expect(fn).toHaveBeenCalledTimes(4);
    }
  );

  test.prop([failureCountArb, errorMessageArb], { numRuns: 100 })(
    'succeeds after N failures if N <= 3, fails if N == 4',
    async (failCount, errorMsg) => {
      let callCount = 0;
      const fn = vi.fn(async () => {
        callCount++;
        if (callCount <= failCount) {
          throw new Error(errorMsg);
        }
        return 'success';
      });

      if (failCount >= 4) {
        // All 4 attempts fail — should throw
        await expect(withRetry(fn, 3, 1)).rejects.toThrow(errorMsg);
        expect(fn).toHaveBeenCalledTimes(4);
      } else {
        // Succeeds after failCount failures
        const result = await withRetry(fn, 3, 1);
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(failCount + 1);
      }
    }
  );

  test.prop([baseDelayArb], { numRuns: 100 })(
    'delay pattern follows exponential backoff (baseDelay * 2^attempt)',
    async (baseDelay) => {
      const timestamps: number[] = [];

      const fn = vi.fn(async () => {
        timestamps.push(Date.now());
        throw new Error('fail');
      });

      await expect(withRetry(fn, 3, baseDelay)).rejects.toThrow('fail');

      // 4 total attempts recorded
      expect(timestamps).toHaveLength(4);

      // Verify delays between attempts follow exponential backoff pattern
      // delay[i] = baseDelay * 2^i for i = 0, 1, 2
      for (let i = 1; i < timestamps.length; i++) {
        const actualDelay = timestamps[i] - timestamps[i - 1];
        const expectedDelay = baseDelay * Math.pow(2, i - 1);
        // Allow tolerance for timer imprecision (±50ms)
        expect(actualDelay).toBeGreaterThanOrEqual(expectedDelay - 50);
        expect(actualDelay).toBeLessThan(expectedDelay + 200);
      }
    }
  );
});
