export interface AgentSessionState {
  sessionId: string;
  memoryId: string;
  userId: string;
  lastActiveAt: string;
  turnCount: number;
  isExpired: boolean;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Returns true if the given ISO 8601 timestamp is more than 24 hours ago.
 */
export function isSessionExpired(lastActiveAt: string): boolean {
  const lastActive = new Date(lastActiveAt).getTime();
  const now = Date.now();
  return now - lastActive > TWENTY_FOUR_HOURS_MS;
}

/**
 * Returns the existing session state (with updated expiry) or a fresh empty state
 * when no prior state exists.
 */
export function getOrCreateSession(
  sessionId: string,
  existingState?: AgentSessionState
): AgentSessionState {
  if (existingState) {
    return {
      ...existingState,
      isExpired: isSessionExpired(existingState.lastActiveAt),
    };
  }

  return {
    sessionId,
    memoryId: '',
    userId: '',
    lastActiveAt: new Date().toISOString(),
    turnCount: 0,
    isExpired: false,
  };
}
