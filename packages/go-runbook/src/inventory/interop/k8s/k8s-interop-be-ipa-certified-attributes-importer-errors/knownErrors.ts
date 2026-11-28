import {
  INTEROP_DOWNSTREAMS,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import { all, anyStepEvidenceMatches, type KnownError, stepEvidenceMatches } from '../../../../engine/index.js';

import { IPA_IMPORTER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
const EVIDENCE_STEPS = [alarm.stepIds.queryApplicationLogs, alarm.stepIds.queryCidTracker];
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBICAIE_IPA-IMP-PUR-EVE-DUP-KEY',
    description: 'Chiave duplicata sullo stream degli eventi di interop-be-purpose-process',
    regex:
      'Error creating event: error: duplicate key value violates unique constraint \\\\*"events_stream_id_version_key',
    resolution: 'Nessuna azione necessaria. Questo tipo di errori viene gestito automaticamente dai ms tramite retry.',
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Violazione del vincolo events_stream_id_version_key in fase di aggiornamento della purpose.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7796', name: 'PIN-7796', type: 'JIRA' }],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBICAIE_IPA-IMP-SOC-HAN-UP',
    description: 'Connessione chiusa durante la chiamata (socket hang up)',
    regex: 'ERROR \\[ipa-certified-attributes-importer\\] - (?:\\[CID=[^\\]]*\\] )?socket hang up\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata. Riferimento: PIN-10964.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'La connessione è stata chiusa prima della risposta (socket hang up).',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-10964', name: 'PIN-10964', type: 'JIRA' },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1789393205647869',
        name: 'Thread Slack 14/09/2026',
        type: 'SLACK',
      },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBICAIE_IPA-IMP-CER-ATT-ALR-ASS',
    description: 'Attributo certificato già assegnato al tenant (409)',
    regex: 'Certified attribute already assigned',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Tentativo di aggiunta di un attributo già presente sul tenant.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1780581718858039',
        name: 'Thread Slack 04/06/2026',
        type: 'SLACK',
      },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBICAIE_IPA-IMP-ATT-ALR-EXI-409',
    description: 'Attributo IPA già esistente in fase di creazione (409)',
    condition: all(
      stepEvidenceMatches(alarm.stepIds.queryApplicationLogs, 'Request failed with status code 409\\b'),
      anyStepEvidenceMatches(
        EVIDENCE_STEPS,
        '003-0002|An attribute with name .+ or code \\S+ and origin IPA already exists',
      ),
    ),
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails:
      'La creazione dell’attributo IPA fallisce con 409 perché un attributo con lo stesso nome o codice esiste già.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1793188101371939',
        name: 'Thread Slack 28/10/2026',
        type: 'SLACK',
      },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBICAIE_IPA-IMP-TOK-EXP-401',
    description: 'Token scaduto nella chiamata (401)',
    regex: 'Token verification failed: TokenExpiredError: jwt expired',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'La chiamata è fallita per un token JWT scaduto.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784105025172559',
        name: 'Thread Slack 15/07/2026',
        type: 'SLACK',
      },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBICAIE_IPA-IMP-TEN-UPS-ATT-NOT-FOU-404',
    description: 'Attributo non trovato durante l’assegnazione al tenant (404)',
    regex:
      'Failed upsert of tenant \\S+ with attributes \\[[^\\]]*\\]\\. status 404, code 005-0001, detail Attribute \\S+ not found',
    evidence: 'APPLICATION_LOGS',
    resolution:
      'Comportamento atteso, che impatta solo gli enti problematici. Il team di sviluppo sta valutando come gestire questo tipo di eventi.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'L’upsert del tenant fallisce con 404 perché l’attributo da assegnare non è stato trovato.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1794817714270449',
        name: 'Thread Slack 17/11/2026',
        type: 'SLACK',
      },
    ],
  }),
];
