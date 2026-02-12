import { describe, it, expect } from 'vitest';
import { evaluateSubmission } from '../../lambda/business-logic/rules';
import { handler } from '../../lambda/business-logic/index';
import { BedrockActionEvent } from '../../lambda/business-logic/types';

describe('evaluateSubmission', () => {
  it('returns pass for valid fields against default rules', () => {
    const results = evaluateSubmission('sub-1', {
      submissionType: 'report',
      description: 'A detailed description of the submission',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.outcome === 'pass')).toBe(true);
    expect(results.every((r) => r.submissionId === 'sub-1')).toBe(true);
    expect(results.every((r) => r.processingDurationMs >= 0)).toBe(true);
  });

  it('returns fail when required field is missing', () => {
    const results = evaluateSubmission('sub-2', { description: 'A long enough description' });
    const failedRule = results.find((r) => r.ruleId === 'R001');

    expect(failedRule).toBeDefined();
    expect(failedRule!.outcome).toBe('fail');
  });

  it('returns fail when field is below minLength', () => {
    const results = evaluateSubmission('sub-3', {
      submissionType: 'report',
      description: 'short',
    });
    const minLengthRule = results.find((r) => r.ruleId === 'R003');

    expect(minLengthRule).toBeDefined();
    expect(minLengthRule!.outcome).toBe('fail');
  });

  it('applies custom rules when provided', () => {
    const results = evaluateSubmission('sub-4', { email: 'test@example.com' }, [
      { ruleId: 'C001', field: 'email', operator: 'pattern', value: '^.+@.+\\..+$' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe('pass');
  });

  it('applies maxLength rule correctly', () => {
    const results = evaluateSubmission('sub-5', { name: 'toolong' }, [
      { ruleId: 'C002', field: 'name', operator: 'maxLength', value: 5 },
    ]);

    expect(results[0].outcome).toBe('fail');
  });
});

describe('handler', () => {
  const baseEvent: BedrockActionEvent = {
    messageVersion: '1.0',
    agent: { name: 'test', id: 'a1', alias: 'v1', version: '1' },
    inputText: 'process submission',
    sessionId: 'sess-1',
    actionGroup: 'BusinessProcessing',
    function: 'evaluateSubmission',
    parameters: [
      { name: 'submissionId', type: 'string', value: 'sub-100' },
      { name: 'fields', type: 'string', value: JSON.stringify({ submissionType: 'report', description: 'A valid description here' }) },
    ],
    sessionAttributes: {},
    promptSessionAttributes: {},
  };

  it('returns a well-formed Bedrock action response', async () => {
    const response = await handler(baseEvent);

    expect(response.messageVersion).toBe('1.0');
    expect(response.response.actionGroup).toBe('BusinessProcessing');
    expect(response.response.function).toBe('evaluateSubmission');
    expect(response.response.functionResponse.responseBody.TEXT.body).toBeDefined();
  });

  it('returns structured error for invalid JSON in fields parameter', async () => {
    const badEvent: BedrockActionEvent = {
      ...baseEvent,
      parameters: [
        { name: 'submissionId', type: 'string', value: 'sub-err' },
        { name: 'fields', type: 'string', value: '{invalid json' },
      ],
    };

    const response = await handler(badEvent);
    const body = JSON.parse(response.response.functionResponse.responseBody.TEXT.body);

    expect(body.error).toBe(true);
    expect(body.errorCode).toBeTruthy();
    expect(body.message).toBeTruthy();
  });
});
