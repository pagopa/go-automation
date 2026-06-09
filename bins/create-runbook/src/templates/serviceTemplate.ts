import type { RunbookTemplate } from './RunbookTemplate.js';
import type { RunbookAnswers } from './RunbookAnswers.js';
import { commonPlaceholders } from './commonPlaceholders.js';
import { deriveVarPrefix } from '../naming/deriveVarPrefix.js';

function servicePlaceholders(answers: RunbookAnswers): ReadonlyMap<string, string> {
  const tokens = commonPlaceholders(answers);
  const { extras } = answers;

  const serviceName = extras.get('service-name') ?? '';
  tokens.set('SERVICE_NAME', serviceName);
  tokens.set('SERVICE_VAR_PREFIX', extras.get('var-prefix') ?? deriveVarPrefix(serviceName));
  tokens.set('SERVICE_LOG_GROUP', extras.get('log-group') ?? (serviceName.length > 0 ? `/aws/ecs/${serviceName}` : ''));

  return tokens;
}

/**
 * Template for service-log alarm runbooks: emits knownServices, knownCases
 * and runbook files based on `service.createServiceAlarmRunbook`.
 */
export const SERVICE_TEMPLATE: RunbookTemplate = {
  id: 'service',
  label: 'Service log alarm (3 file)',
  description: 'Runbook generico per allarmi diagnosticati dai log applicativi di un servizio.',
  templateDir: 'service',
  files: [
    { template: 'knownServices.ts.template', output: 'knownServices.ts' },
    { template: 'knownCases.ts.template', output: 'knownCases.ts' },
    { template: 'runbook.ts.template', output: 'runbook.ts' },
  ],
  inputs: [
    {
      name: 'service-name',
      message: 'Service name (es. pn-external-channel)',
      kind: 'text',
      required: true,
    },
    {
      name: 'var-prefix',
      message: 'Service varPrefix',
      kind: 'text',
      required: true,
      defaultValue: (context) => deriveVarPrefix(context.collected.get('service-name') ?? ''),
    },
    {
      name: 'log-group',
      message: 'Service application log group',
      kind: 'text',
      required: true,
      defaultValue: (context) => {
        const serviceName = context.collected.get('service-name') ?? '';
        return serviceName.length > 0 ? `/aws/ecs/${serviceName}` : '';
      },
    },
  ],
  buildPlaceholders: servicePlaceholders,
};
