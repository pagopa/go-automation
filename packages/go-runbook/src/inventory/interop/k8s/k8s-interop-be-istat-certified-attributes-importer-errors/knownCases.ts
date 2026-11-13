import {
  INTEROP_DOWNSTREAMS,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';

import { ISTAT_IMPORTER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
const UUID_PATTERN = '[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}';
/** Confluence v7 plus PIN-10543/PIN-10823, checked on 2026-09-17. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'istat-certifier-tenant-not-found',
    description: 'Tenant certificatore ISTAT non trovato',
    priority: 100,
    regex: 'Certifier tenant ISTAT not found',
    resolution: 'PIN-10543',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails:
      'Il flusso non individua il tenant certificatore ISTAT; la causa specifica richiede verifica dei log correlati.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-10543', name: 'PIN-10543', type: 'JIRA' }],
  }),
  interopK8sKnownCase(REFS, {
    id: 'istat-discrete-certified-attribute-already-assigned',
    description: 'Attributo certificato discreto già assegnato al tenant (409)',
    priority: 90,
    regex:
      `Certified Discrete Attribute\\s+${UUID_PATTERN}\\s+already assigned to tenant\\s+${UUID_PATTERN}\\b|` +
      'Error on internalAssignDiscreteCertifiedAttribute\\. Reason: Request failed with status code 409\\b',
    resolution: '[VEDI COMMENTI] PIN-10543: Certifier tenant ISTAT not found',
    // Deployment version/severity are not proven by matching the message alone.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Assegnazione duplicata già gestita; l’emissione come ERROR o stderr può attivare l’allarme.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-10543', name: 'PIN-10543', type: 'JIRA' },
      { url: 'https://pagopa.atlassian.net/browse/PIN-10823', name: 'PIN-10823', type: 'JIRA' },
    ],
  }),
];
