import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSessionExpired, getOrCreateSession, AgentSessionState } from '../../lib/utils/session-state';

describe('isSessionExpired', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for a timestamp within 24 hours', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(isSessionExpired(oneHourAgo)).toBe(false);
  });

  it('returns true for a timestamp older than 24 hours', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    expect(isSessionExpired(twoDaysAgo)).toBe(true);
  });

  it('returns false for exactly 24 hours ago', () => {
    vi.useFakeTimers();
    const now = new Date('2026-01-15T12:00:00.000Z');
    vi.setSystemTime(now);
    const exactly24h = new Date('2026-01-14T12:00:00.000Z').toISOString();
    expect(isSessionExpired(exactly24h)).toBe(false);
  });
});

describe('getOrCreateSession', () => {
  it('returns fresh state when no existing state is provided', () => {
    const session = getOrCreateSession('sess-123');
    expect(session.sessionId).toBe('sess-123');
    expect(session.turnCount).toBe(0);
    expect(session.isExpired).toBe(false);
    expect(session.memoryId).toBe('');
    expect(session.userId).toBe('');
  });

  it('returns existing state with updated expiry (not expired)', () => {
    const existing: AgentSessionState = {
      sessionId: 'sess-456',
      memoryId: 'mem-1',
      userId: 'user-1',
      lastActiveAt: new Date(Date.now() - 60 * 1000).toISOString(),
      turnCount: 3,
      isExpired: true, // stale value
    };
    const session = getOrCreateSession('sess-456', existing);
    expect(session.isExpired).toBe(false);
    expect(session.turnCount).toBe(3);
  });

  it('marks existing state as expired when inactive > 24h', () => {
    const existing: AgentSessionState = {
      sessionId: 'sess-789',
      memoryId: 'mem-2',
      userId: 'user-2',
      lastActiveAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      turnCount: 5,
      isExpired: false,
    };
    const session = getOrCreateSession('sess-789', existing);
    expect(session.isExpired).toBe(true);
  });
});
