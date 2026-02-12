import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { isSessionExpired, getOrCreateSession } from '../../lib/utils/session-state';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// Arbitrary: offset in ms within 24 hours (0 to 24h inclusive)
const withinDayOffsetArb = fc.integer({ min: 0, max: TWENTY_FOUR_HOURS_MS });

// Arbitrary: offset in ms beyond 24 hours (24h+1ms to 48h)
const beyondDayOffsetArb = fc.integer({ min: TWENTY_FOUR_HOURS_MS + 1, max: TWENTY_FOUR_HOURS_MS * 2 });

// Arbitrary: non-empty session ID
const sessionIdArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

// Feature: agentcore-bedrock-platform, Property 9: Session state reflects freshness and expiry
// **Validates: Requirements 6.3, 6.4**
describe('Property 9: Session state reflects freshness and expiry', () => {
  test.prop([withinDayOffsetArb], { numRuns: 100 })(
    'sessions within 24h are not expired',
    (offsetMs) => {
      const timestamp = new Date(Date.now() - offsetMs).toISOString();
      expect(isSessionExpired(timestamp)).toBe(false);
    }
  );

  test.prop([beyondDayOffsetArb], { numRuns: 100 })(
    'sessions beyond 24h are expired',
    (offsetMs) => {
      const timestamp = new Date(Date.now() - offsetMs).toISOString();
      expect(isSessionExpired(timestamp)).toBe(true);
    }
  );

  test.prop([sessionIdArb], { numRuns: 100 })(
    'new session IDs produce fresh empty state',
    (sessionId) => {
      const session = getOrCreateSession(sessionId);
      expect(session.sessionId).toBe(sessionId);
      expect(session.turnCount).toBe(0);
      expect(session.isExpired).toBe(false);
      expect(session.memoryId).toBe('');
      expect(session.userId).toBe('');
    }
  );
});
