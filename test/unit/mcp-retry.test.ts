import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../lib/utils/mcp-retry';

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, 3, 1);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds on second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, 3, 1);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after all retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(withRetry(fn, 3, 1)).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('respects maxRetries=0 (no retries)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(withRetry(fn, 0, 1)).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
