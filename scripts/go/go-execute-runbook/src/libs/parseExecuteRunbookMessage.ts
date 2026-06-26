import {
  parseAutomaticAlarmAnalysisCommandV1,
  type AutomaticAlarmAnalysisCommandV1,
} from '@go-automation/go-watchtower-client';

export function parseExecuteRunbookMessage(body: string): AutomaticAlarmAnalysisCommandV1 {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw commandFailure('INVALID_COMMAND', `SQS command is not valid JSON: ${message}`);
  }
  try {
    return parseAutomaticAlarmAnalysisCommandV1(value);
  } catch (error: unknown) {
    const version = commandVersion(value);
    const code = version !== undefined && version !== '1.0.0' ? 'UNSUPPORTED_COMMAND_VERSION' : 'INVALID_COMMAND';
    const message = error instanceof Error ? error.message : String(error);
    throw commandFailure(code, message);
  }
}

export function recoverValidExecutionId(body: string): string | undefined {
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value !== 'object' || value === null || !('executionId' in value)) return undefined;
    return typeof value.executionId === 'string' && isUuid(value.executionId) ? value.executionId : undefined;
  } catch {
    return undefined;
  }
}

function commandVersion(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('schemaVersion' in value)) return undefined;
  return typeof value.schemaVersion === 'string' ? value.schemaVersion : undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function commandFailure(
  workerFailureCode: 'INVALID_COMMAND' | 'UNSUPPORTED_COMMAND_VERSION',
  message: string,
): Error & { readonly workerFailureCode: 'INVALID_COMMAND' | 'UNSUPPORTED_COMMAND_VERSION' } {
  return Object.assign(new Error(message), { workerFailureCode });
}
