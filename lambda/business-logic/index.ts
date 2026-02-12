import { BedrockActionEvent, BedrockActionResponse } from './types';
import { evaluateSubmission } from './rules';
import { writeOutputArtifact } from './s3-client';

function buildResponse(
  event: BedrockActionEvent,
  body: string
): BedrockActionResponse {
  return {
    messageVersion: '1.0',
    response: {
      actionGroup: event.actionGroup,
      function: event.function,
      functionResponse: {
        responseBody: { TEXT: { body } },
      },
    },
    sessionAttributes: event.sessionAttributes ?? {},
    promptSessionAttributes: event.promptSessionAttributes ?? {},
  };
}

function buildErrorResponse(
  event: BedrockActionEvent,
  errorCode: string,
  message: string
): BedrockActionResponse {
  return buildResponse(
    event,
    JSON.stringify({ error: true, errorCode, message })
  );
}

export async function handler(event: BedrockActionEvent): Promise<BedrockActionResponse> {
  try {
    const submissionId =
      event.sessionAttributes?.submissionId ??
      event.parameters?.find((p) => p.name === 'submissionId')?.value ??
      `sub-${Date.now()}`;

    const fieldsParam = event.parameters?.find((p) => p.name === 'fields');
    const fields: Record<string, string> = fieldsParam
      ? JSON.parse(fieldsParam.value)
      : {};

    const results = evaluateSubmission(submissionId, fields);

    const hasFailures = results.some((r) => r.outcome === 'fail');
    if (hasFailures) {
      return buildResponse(event, JSON.stringify({
        submissionId,
        status: 'completed',
        results,
        summary: 'One or more business rules failed',
      }));
    }

    // Write results artifact to S3
    const artifactKey = await writeOutputArtifact(
      `${submissionId}/results.json`,
      JSON.stringify(results)
    );

    // Attach artifact key to results
    const enrichedResults = results.map((r) => ({
      ...r,
      outputArtifactKey: artifactKey,
    }));

    return buildResponse(event, JSON.stringify({
      submissionId,
      status: 'completed',
      results: enrichedResults,
      summary: 'All business rules passed',
    }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error occurred';

    if (isValidationError(err)) {
      return buildErrorResponse(event, 'VALIDATION_ERROR', message);
    }
    if (isStorageError(err)) {
      return buildErrorResponse(event, 'STORAGE_ERROR', message);
    }
    return buildErrorResponse(event, 'INTERNAL_ERROR', message);
  }
}

function isValidationError(err: unknown): boolean {
  return err instanceof SyntaxError || (err instanceof Error && err.message.includes('validation'));
}

function isStorageError(err: unknown): boolean {
  return err instanceof Error && (
    err.name === 'NoSuchKey' ||
    err.name === 'AccessDenied' ||
    err.message.includes('S3') ||
    err.message.includes('storage')
  );
}
