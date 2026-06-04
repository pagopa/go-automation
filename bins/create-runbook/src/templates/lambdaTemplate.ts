import type { RunbookTemplate } from './RunbookTemplate.js';
import type { RunbookAnswers } from './RunbookAnswers.js';
import { commonPlaceholders } from './commonPlaceholders.js';
import { deriveVarPrefix } from '../naming/deriveVarPrefix.js';

/** Event sources offered for the entry Lambda. */
const EVENT_SOURCES: ReadonlyArray<string> = ['unknown', 'api-gateway-authorizer', 'sqs', 'scheduled'];

/**
 * Builds the placeholder tokens for the Lambda template, deriving the log
 * group from the function name and emitting the optional `eventSource` line.
 *
 * @param answers - Resolved scaffold answers
 * @returns Token map consumed by {@link renderTemplate}
 */
function lambdaPlaceholders(answers: RunbookAnswers): ReadonlyMap<string, string> {
  const tokens = commonPlaceholders(answers);
  const { extras } = answers;

  const entryName = extras.get('entry-lambda') ?? '';
  tokens.set('LAMBDA_NAME', entryName);
  tokens.set('LAMBDA_VAR_PREFIX', extras.get('var-prefix') ?? deriveVarPrefix(entryName));
  tokens.set('LAMBDA_LOG_GROUP', entryName !== '' ? `/aws/lambda/${entryName}` : '');

  const eventSource = extras.get('event-source') ?? 'unknown';
  tokens.set(
    'EVENT_SOURCE_LINE',
    eventSource !== '' && eventSource !== 'unknown' ? `  eventSource: '${eventSource}',\n` : '',
  );

  return tokens;
}

/**
 * Template for Lambda `LogInvocationErrors` alarm runbooks: emits the
 * four-file layout (knownServices, knownErrors, knownCases, runbook) built
 * on `lambda.createLambdaAlarmRunbook`.
 */
export const LAMBDA_TEMPLATE: RunbookTemplate = {
  id: 'lambda',
  label: 'Lambda alarm (4 file)',
  description: 'Runbook per allarmi Lambda LogInvocationErrors: knownServices, knownErrors, knownCases, runbook.',
  templateDir: 'lambda',
  files: [
    { template: 'knownServices.ts.template', output: 'knownServices.ts' },
    { template: 'knownErrors.ts.template', output: 'knownErrors.ts' },
    { template: 'knownCases.ts.template', output: 'knownCases.ts' },
    { template: 'runbook.ts.template', output: 'runbook.ts' },
  ],
  inputs: [
    {
      name: 'entry-lambda',
      message: 'Nome della Lambda (es. pn-tokenExchangeLambda)',
      kind: 'text',
      required: true,
    },
    {
      name: 'var-prefix',
      message: 'varPrefix della Lambda',
      kind: 'text',
      required: true,
      defaultValue: (context) => deriveVarPrefix(context.collected.get('entry-lambda') ?? ''),
    },
    {
      name: 'event-source',
      message: 'Event source della Lambda',
      kind: 'select',
      required: true,
      choices: EVENT_SOURCES.map((value) => ({ value, label: value })),
      defaultValue: () => 'unknown',
    },
  ],
  buildPlaceholders: lambdaPlaceholders,
};
