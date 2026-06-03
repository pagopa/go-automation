import type { RunbookTemplate } from './RunbookTemplate.js';
import type { RunbookAnswers } from './RunbookAnswers.js';
import { commonPlaceholders } from './commonPlaceholders.js';
import { API_GW_AUTHORIZER_NAMES } from './apiGatewayAuthorizers.js';
import { deriveVarPrefix } from '../naming/deriveVarPrefix.js';

/** Sentinel value used when no Lambda authorizer is configured. */
const AUTHORIZER_NONE = 'none';

/**
 * Builds the placeholder tokens for the API Gateway template, including the
 * conditional `authorizerFailureCheck` block and the optional
 * `executionLogGroup` line on the entry service.
 *
 * @param answers - Resolved scaffold answers
 * @returns Token map consumed by {@link renderTemplate}
 */
function apiGatewayPlaceholders(answers: RunbookAnswers): ReadonlyMap<string, string> {
  const tokens = commonPlaceholders(answers);
  const { extras } = answers;

  const entryServiceName = extras.get('entry-service') ?? '';

  tokens.set('API_GW_LOG_GROUP', extras.get('api-gw-log-group') ?? '');
  tokens.set('ENTRY_SERVICE_NAME', entryServiceName);
  tokens.set('ENTRY_SERVICE_VAR_PREFIX', extras.get('var-prefix') ?? deriveVarPrefix(entryServiceName));
  tokens.set('ENTRY_SERVICE_LOG_GROUP', extras.get('log-group') ?? `/aws/ecs/${entryServiceName}`);

  const executionLogGroup = (extras.get('execution-log-group') ?? '').trim();
  tokens.set(
    'ENTRY_EXECUTION_LOG_GROUP_LINE',
    executionLogGroup.length > 0 ? `  executionLogGroup: '${executionLogGroup}',\n` : '',
  );

  const authorizer = extras.get('authorizer') ?? AUTHORIZER_NONE;
  tokens.set(
    'AUTHORIZER_BLOCK',
    authorizer === AUTHORIZER_NONE
      ? ''
      : `    authorizerFailureCheck: {\n      defaultAuthorizer: apigw.API_GW_AUTHORIZER_LAMBDAS['${authorizer}'],\n    },\n`,
  );

  return tokens;
}

/**
 * Template for API Gateway alarm runbooks: emits the canonical four-file
 * layout (knownServices, knownUrls, knownCases, runbook) modelled on the
 * existing pn-delivery / pn-address-book runbooks.
 */
export const API_GATEWAY_TEMPLATE: RunbookTemplate = {
  id: 'api-gateway',
  label: 'API Gateway alarm (4 file)',
  description: 'Runbook completo per allarmi API Gateway: knownServices, knownUrls, knownCases, runbook.',
  templateDir: 'api-gateway',
  files: [
    { template: 'knownServices.ts.template', output: 'knownServices.ts' },
    { template: 'knownUrls.ts.template', output: 'knownUrls.ts' },
    { template: 'knownCases.ts.template', output: 'knownCases.ts' },
    { template: 'runbook.ts.template', output: 'runbook.ts' },
  ],
  inputs: [
    {
      name: 'api-gw-log-group',
      message: 'API Gateway AccessLog log group',
      kind: 'text',
      required: true,
    },
    {
      name: 'entry-service',
      message: 'Entry service name (es. pn-delivery)',
      kind: 'text',
      required: true,
    },
    {
      name: 'var-prefix',
      message: 'Entry service varPrefix',
      kind: 'text',
      required: true,
      defaultValue: (context) => deriveVarPrefix(context.collected.get('entry-service') ?? ''),
    },
    {
      name: 'log-group',
      message: 'Entry service application log group',
      kind: 'text',
      required: true,
      defaultValue: (context) => {
        const entryService = context.collected.get('entry-service') ?? '';
        return entryService.length > 0 ? `/aws/ecs/${entryService}` : '';
      },
    },
    {
      name: 'execution-log-group',
      message: 'Entry service API Gateway execution log group (opzionale)',
      kind: 'text',
      required: false,
    },
    {
      name: 'authorizer',
      message: 'Lambda authorizer',
      kind: 'select',
      required: true,
      choices: [
        { value: AUTHORIZER_NONE, label: 'Nessuno' },
        ...API_GW_AUTHORIZER_NAMES.map((name) => ({ value: name, label: name })),
      ],
      defaultValue: () => AUTHORIZER_NONE,
    },
  ],
  buildPlaceholders: apiGatewayPlaceholders,
};
