import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { all, any } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { BFF_ALARM } from './alarmDefinition.js';
import { BFF_EVIDENCE_STEP_ID } from './AnalyzeBffEvidenceStep.js';

const PRODUCTION = { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' } as const;
const BFF_ROWS = `${BFF_EVIDENCE_STEP_ID}.bffRows`;
const DETAILS = [
  ['Ambiente', '{{vars.interopEnvironment}}'],
  ['Log group', '{{vars.interopLogGroup}}'],
  ['Servizio', '{{vars.interopPodApp}}'],
  ['CID analizzati', `{{vars.${BFF_ALARM.varPrefix}CidCount}}`],
] as const;

/** Sources: Confluence 2585559041 v9/v11/v16/v18/v21-v24 and actual 2026-10-06 BFF logs. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'purpose-process-duplicate-event-stream-version',
    description: 'Duplicate key su events_stream_id_version_key gestito tramite retry',
    priority: 10,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(
        `${BFF_EVIDENCE_STEP_ID}.purposeRows`,
        'duplicate key value violates unique constraint[^\\w]+events_stream_id_version_key\\b',
      ),
    ),
    resolution: 'Nessuna azione necessaria. Questo tipo di errori viene gestito automaticamente dai ms tramite retry.',
    details: DETAILS,
    analysis: { proposedStatus: 'COMPLETED', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
  knownCase({
    id: 'bff-invalid-content-disposition-header',
    description: 'Header Content-Disposition non valido nella risposta gestita dal BFF',
    priority: 95,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(BFF_ROWS, 'Invalid character in header content[^\\r\\n]*Content-Disposition'),
    ),
    resolution: 'PIN-7865',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7865', name: 'PIN-7865', type: 'JIRA' }],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'bff-adm-zip-invalid-format',
    description: 'Archivio ZIP non valido o troncato ricevuto dal BFF',
    priority: 94,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(BFF_ROWS, 'ADM-ZIP: Invalid or unsupported zip format\\. No END header found'),
    ),
    resolution: 'PIN-9483',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-9483', name: 'PIN-9483', type: 'JIRA' }],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'bff-token-expired',
    description: 'Token JWT scaduto',
    priority: 93,
    condition: all(
      PRODUCTION,
      any(stepEvidenceMatches(BFF_ROWS, 'Token verification failed: TokenExpiredError: jwt expired'), {
        type: 'exists',
        ref: `steps.${BFF_EVIDENCE_STEP_ID}.expiredNotificationRequests`,
      }),
    ),
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
  knownCase({
    id: 'bff-error-getting-public-key',
    description: 'Errore nel recupero o nella validazione della public key',
    priority: 90,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(
        BFF_ROWS,
        'Error getting public key|Token verification failed: JsonWebTokenError: error in secret or public key callback: Error getting signing key',
      ),
    ),
    resolution: 'PIN-7777. Thread Slack 15/07/2026.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [
        { url: 'https://pagopa.atlassian.net/browse/PIN-7777', name: 'PIN-7777', type: 'JIRA' },
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784123132240289',
          name: 'Thread Slack 15/07/2026',
          type: 'SLACK',
        },
      ],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'bff-agreement-api-econnreset',
    description: 'ECONNRESET segnalato dal BFF; riferimento AgreementApi da verificare',
    title: 'ECONNRESET nella chiamata agreement API dal BFF (da verificare)',
    priority: 80,
    condition: all(PRODUCTION, stepEvidenceMatches(BFF_ROWS, 'errors:\\s*008-9991[^\\r\\n]*read ECONNRESET\\b')),
    resolution: '(Da verificare) [PIN-6400] BFF - AgreementApi read ECONNRESET - Jira',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-6400', name: 'PIN-6400', type: 'JIRA' }],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'purpose-process-unavailable-econnreset',
    description: 'Errore transitorio verso purpose-process',
    priority: 85,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(BFF_ROWS, '(?=[^\\r\\n]*purpose-process)[^\\r\\n]*(?:read ECONNRESET|socket hang up)'),
    ),
    resolution: 'PIN-10449',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-10449', name: 'PIN-10449', type: 'JIRA' }],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'bff-tenant-kind-not-found',
    description: 'Tenant kind non trovato',
    priority: 60,
    condition: all(PRODUCTION, stepEvidenceMatches(BFF_ROWS, 'errors:\\s*004-0004, Tenant kind[^\\r\\n]*not found')),
    resolution: 'In attesa di feedback dal team di prodotto.',
    details: DETAILS,
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
  knownCase({
    id: 'bff-selfcare-users-timeout',
    description: 'Timeout HTTP 504 nel recupero degli utenti del tenant da Selfcare',
    priority: 96,
    condition: all(PRODUCTION, { type: 'exists', ref: `steps.${BFF_EVIDENCE_STEP_ID}.selfcareUsersTimeouts` }),
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'bff-connection-refused-9098',
    description: 'Connessione rifiutata verso la porta 9098',
    priority: 97,
    condition: all(PRODUCTION, stepEvidenceMatches(BFF_ROWS, 'Connection error: connect ECONNREFUSED [^\\s]+:9098\\b')),
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
];
