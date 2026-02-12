/**
 * Executes an async function with exponential backoff retry.
 *
 * @param fn - The async function to execute
 * @param maxRetries - Maximum number of retries (default 3)
 * @param baseDelayMs - Base delay in milliseconds (default 1000)
 * @returns The result of the function
 * @throws The last error after all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
