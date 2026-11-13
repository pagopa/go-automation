import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { AwsAccountsDiagnosticFn } from './AwsAccountsDiagnosticFn.js';
import { scrubAwsProfileNames } from './scrubAwsProfileNames.js';

/**
 * Errors of the SDK credential and token providers: their messages name the local
 * profile in many shapes (`Profile x requires …`, `profile=x`, `Profiles visited: …`).
 */
const PROVIDER_ERROR_NAMES: ReadonlySet<string> = new Set([
  'CredentialsProviderError',
  'TokenProviderError',
  'ProviderError',
]);

/** Deepest causes followed when looking for a provider failure. */
const MAX_CAUSE_DEPTH = 8;

/** Methods whose failures reach the runbook output through `executeStep`. */
const QUERY_METHODS: ReadonlySet<PropertyKey> = new Set(['query', 'queryWithStatistics']);

/**
 * Reader of a logical account whose query errors carry no local profile name
 * (EVO-AWSACCT-OPUS-01 §6.1). The original message goes to the local diagnostics;
 * the rethrown error keeps its prototype and own fields (codes), with a clean
 * message and stack and without `cause`.
 *
 * Only identifiable profile references are removed (`(profile: x)`,
 * `profile: [x]`, `profile 'x'`, `Configured profiles:` lists), never words of
 * the message: the text that classifies failures (`access denied`, …) survives
 * whatever the profiles are called. A failure of the SDK credential or token
 * providers, anywhere in the cause chain, has its text replaced by a fixed
 * `[<provider error name>] AWS credentials could not be resolved`: those messages
 * name the profile in too many shapes to be scrubbed.
 *
 * @param reader - Exact reader of the logical account
 * @param diagnose - Local diagnostic sink
 * @returns The same reader, with scrubbed query errors
 */
export function withScrubbedErrors(
  reader: AWSCloudWatchLogsQueryService,
  diagnose: AwsAccountsDiagnosticFn | undefined,
): AWSCloudWatchLogsQueryService {
  return new Proxy(reader, {
    get(target, property): unknown {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      const method = value as (...args: unknown[]) => unknown;
      if (!QUERY_METHODS.has(property)) return method.bind(target);
      return async (...args: unknown[]): Promise<unknown> => {
        try {
          return await method.apply(target, args);
        } catch (error: unknown) {
          throw scrubError(error, diagnose);
        }
      };
    },
  });
}

function scrubError(error: unknown, diagnose: AwsAccountsDiagnosticFn | undefined): unknown {
  if (!(error instanceof Error)) return error;
  const message = scrubAwsProfileNames(withoutProviderText(error));
  if (message === error.message) return error;
  diagnose?.(`logical-account query failed: ${error.message}`);
  // Safe: a clone with the same prototype, so `instanceof` and code guards keep working.
  const clone = Object.create(Object.getPrototypeOf(error) as object) as Error;
  Object.assign(clone, error);
  Object.defineProperty(clone, 'message', { value: message, writable: true, configurable: true });
  // The stack is rebuilt from the clean message: its first lines repeat the original one.
  const frames = (error.stack ?? '').split('\n').filter((line) => line.trimStart().startsWith('at '));
  Object.defineProperty(clone, 'stack', {
    value: [`${error.name}: ${message}`, ...frames].join('\n'),
    writable: true,
    configurable: true,
  });
  return clone;
}

/**
 * The error message with the text of an SDK provider failure replaced by a fixed one.
 *
 * @param error - Error thrown by the reader
 * @returns The message, unchanged when no provider failure is in the cause chain
 */
function withoutProviderText(error: Error): string {
  const provider = providerFailure(error);
  if (provider === undefined) return error.message;
  const safe = `[${provider.name}] AWS credentials could not be resolved`;
  if (provider === error || provider.message === '' || !error.message.includes(provider.message)) return safe;
  return error.message.replace(provider.message, safe);
}

function providerFailure(error: Error): Error | undefined {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current instanceof Error; depth += 1) {
    if (PROVIDER_ERROR_NAMES.has(current.name)) return current;
    current = current.cause;
  }
  return undefined;
}
