import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { IPA_IMPORTER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2391015443/k8s-interop-be-ipa-certified-attributes-importer-errors-prod';

/**
 * Builds the k8s-interop-be-ipa-certified-attributes-importer-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza gli errori dell’importer degli attributi certificati IPA, correlando i CID con i servizi tenant, attribute registry e purpose.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'ipa', 'certified-attributes', 'importer'],
    },
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
