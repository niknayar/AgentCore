export interface MCPDataExtractionResponse {
  data: Record<string, unknown>[];
  metadata: {
    source: string;
    recordCount: number;
    queryDurationMs: number;
  };
}

export interface MCPActionResponse {
  result: Record<string, unknown>;
  status: 'success' | 'error';
  message?: string;
}

/**
 * Validates that a response conforms to the MCPDataExtractionResponse schema.
 * Throws if required fields are missing or have invalid types.
 */
export function validateDataExtractionResponse(response: unknown): MCPDataExtractionResponse {
  if (response === null || typeof response !== 'object') {
    throw new Error('Invalid MCP data extraction response: expected an object');
  }

  const obj = response as Record<string, unknown>;

  if (!Array.isArray(obj.data)) {
    throw new Error('Invalid MCP data extraction response: "data" must be an array');
  }

  if (obj.metadata === null || typeof obj.metadata !== 'object') {
    throw new Error('Invalid MCP data extraction response: "metadata" must be an object');
  }

  const metadata = obj.metadata as Record<string, unknown>;

  if (typeof metadata.source !== 'string') {
    throw new Error('Invalid MCP data extraction response: "metadata.source" must be a string');
  }

  if (typeof metadata.recordCount !== 'number') {
    throw new Error('Invalid MCP data extraction response: "metadata.recordCount" must be a number');
  }

  if (typeof metadata.queryDurationMs !== 'number') {
    throw new Error('Invalid MCP data extraction response: "metadata.queryDurationMs" must be a number');
  }

  return obj as unknown as MCPDataExtractionResponse;
}

/**
 * Validates that a response conforms to the MCPActionResponse schema.
 * Throws if required fields are missing or have invalid types.
 */
export function validateActionResponse(response: unknown): MCPActionResponse {
  if (response === null || typeof response !== 'object') {
    throw new Error('Invalid MCP action response: expected an object');
  }

  const obj = response as Record<string, unknown>;

  if (obj.result === null || typeof obj.result !== 'object' || Array.isArray(obj.result)) {
    throw new Error('Invalid MCP action response: "result" must be an object');
  }

  if (obj.status !== 'success' && obj.status !== 'error') {
    throw new Error('Invalid MCP action response: "status" must be "success" or "error"');
  }

  if (obj.message !== undefined && typeof obj.message !== 'string') {
    throw new Error('Invalid MCP action response: "message" must be a string if present');
  }

  return obj as unknown as MCPActionResponse;
}
