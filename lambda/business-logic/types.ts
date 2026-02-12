export interface BedrockActionEvent {
  messageVersion: '1.0';
  agent: { name: string; id: string; alias: string; version: string };
  inputText: string;
  sessionId: string;
  actionGroup: string;
  function: string;
  parameters: Array<{ name: string; type: string; value: string }>;
  sessionAttributes: Record<string, string>;
  promptSessionAttributes: Record<string, string>;
}

export interface BedrockActionResponse {
  messageVersion: '1.0';
  response: {
    actionGroup: string;
    function: string;
    functionResponse: {
      responseBody: {
        TEXT: { body: string };
      };
    };
  };
  sessionAttributes: Record<string, string>;
  promptSessionAttributes: Record<string, string>;
}

export interface BusinessRuleResult {
  submissionId: string;
  ruleId: string;
  outcome: 'pass' | 'fail' | 'review';
  details: string;
  outputArtifactKey?: string;
  processingDurationMs: number;
}

export interface BusinessRule {
  ruleId: string;
  field: string;
  operator: 'required' | 'minLength' | 'maxLength' | 'pattern';
  value: string | number;
}
