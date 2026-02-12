import { describe, expect, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { handler } from '../../lambda/business-logic/index';
import { BedrockActionEvent } from '../../lambda/business-logic/types';

// Mock S3 client to control error injection
vi.mock('../../lambda/business-logic/s3-client', () => ({
  fetchReferenceData: vi.fn(),
  writeOutputArtifact: vi.fn(),
}));

import { writeOutputArtifact } from '../../lambda/business-logic/s3-client';
const mockedWriteOutputArtifact = vi.mocked(writeOutputArtifact);

function makeEvent(overrides: Partial<BedrockActionEvent> = {}): BedrockActionEvent {
  return {
    messageVersion: '1.0',
    agent: { name: 'test', id: 'a1', alias: 'TSTALIASID', version: '1' },
    inputText: 'test',
    sessionId: 'sess-1',
    actionGroup: 'BusinessProcessing',
    function: 'evaluateSubmission',
    parameters: [],
    sessionAttributes: {},
    promptSessionAttributes: {},
    ...overrides,
  };
}

// Arbitrary: non-empty error message strings
const errorMessageArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

// Feature: agentcore-bedrock-platform, Property 8: Lambda error responses are structured
// **Validates: Requirements 5.4**
describe('Property 8: Lambda error responses are structured', () => {
  test.prop([errorMessageArb], { numRuns: 100 })(
    'invalid JSON in fields parameter produces structured error with non-empty errorCode and message',
    async (randomGarbage) => {
      // Ensure writeOutputArtifact won't mask the parse error
      mockedWriteOutputArtifact.mockResolvedValue('artifacts/test.json');

      const event = makeEvent({
        parameters: [
          { name: 'fields', type: 'string', value: `{invalid-json-${randomGarbage}` },
        ],
      });

      const response = await handler(event);
      const body = JSON.parse(response.response.functionResponse.responseBody.TEXT.body);

      expect(body.error).toBe(true);
      expect(typeof body.errorCode).toBe('string');
      expect(body.errorCode.length).toBeGreaterThan(0);
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
    }
  );

  test.prop([errorMessageArb], { numRuns: 100 })(
    'S3 write failures produce structured error with non-empty errorCode and message',
    async (errorMsg) => {
      const s3Error = new Error(`S3 ${errorMsg}`);
      s3Error.name = 'NoSuchKey';
      mockedWriteOutputArtifact.mockRejectedValue(s3Error);

      // Provide valid fields so rule evaluation succeeds but S3 write fails
      const event = makeEvent({
        parameters: [
          { name: 'fields', type: 'string', value: JSON.stringify({ submissionType: 'test', description: 'a valid description here' }) },
        ],
      });

      const response = await handler(event);
      const body = JSON.parse(response.response.functionResponse.responseBody.TEXT.body);

      expect(body.error).toBe(true);
      expect(typeof body.errorCode).toBe('string');
      expect(body.errorCode.length).toBeGreaterThan(0);
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
    }
  );

  test.prop([errorMessageArb], { numRuns: 100 })(
    'generic runtime errors produce structured error with non-empty errorCode and message',
    async (errorMsg) => {
      mockedWriteOutputArtifact.mockRejectedValue(new Error(errorMsg));

      // Valid fields so we get past parsing, but S3 write throws a generic error
      const event = makeEvent({
        parameters: [
          { name: 'fields', type: 'string', value: JSON.stringify({ submissionType: 'test', description: 'a valid description here' }) },
        ],
      });

      const response = await handler(event);
      const body = JSON.parse(response.response.functionResponse.responseBody.TEXT.body);

      expect(body.error).toBe(true);
      expect(typeof body.errorCode).toBe('string');
      expect(body.errorCode.length).toBeGreaterThan(0);
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
    }
  );
});
