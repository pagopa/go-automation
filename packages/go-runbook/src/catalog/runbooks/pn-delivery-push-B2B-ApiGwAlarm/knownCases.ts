import { varMatches } from '../common/varConditions.js';
/**
 * Known cases for the pn-delivery-push-B2B-ApiGwAlarm runbook.
 */
import type { KnownCase } from '../framework.js';
import { knownCase } from '../framework.js';
import { SEND_DOWNSTREAMS } from '../framework.js';
import { all } from '../common/conditions.js';
import { anyStepEvidenceMatches, stepEvidenceMatches } from '../common/evidenceConditions.js';
import { apiGwStatusIs } from '../../../apigw/knownCases/conditions.js';
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'safestorage-file-not-found',
    description: 'Download legal fact richiesto prima che il file sia disponibile su SafeStorage',
    priority: 110,
    condition: all(
      apiGwStatusIs('404'),
      stepEvidenceMatches('query-pn-delivery-push', 'File not found from safeStorage fileKey='),
    ),
    title: 'File not found from safeStorage fileKey=<filekey>',
    resolution:
      'Monitorare l\u2019allarme per individuare i cxId pi\u00F9 frequenti o nuovi. Riferimenti ai thread Slack indicati nella pagina.',
    details: [['Downstream', 'SafeStorage']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-ss' }],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'safestorage-object-restore-already-in-progress',
    description: 'Richiesta duplicata di restore documento su SafeStorage/S3',
    priority: 105,
    condition: anyStepEvidenceMatches(
      ['query-pn-safestorage', 'query-pn-delivery-push'],
      'Object restore is already in progress.*Status Code: 409',
    ),
    title: 'Object restore is already in progress (S3 409)',
    resolution: 'Thread Slack: 26/03/2026',
    details: [['Downstream', 'SafeStorage/S3']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-ss' }],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'downstream-selfcarepg-503-service-unavailable',
    description: 'SelfcarePG non disponibile durante chiamata da pn-data-vault',
    priority: 100,
    condition: anyStepEvidenceMatches(
      ['query-pn-data-vault', 'query-pn-delivery-push'],
      '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=503 Service Unavailable',
    ),
    title: '[DOWNSTREAM] Service SelfcarePG returned errors=503 Service Unavailable',
    resolution:
      'Se l\u2019errore si protrae nel tempo \u00E8 necessario contattare gli opportuni contatti Downstream per Selfcare.',
    details: [['Downstream', 'Selfcare']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'exception-in-call-getfile-pn-external-legal-facts',
    description: 'Errore durante chiamata getFile, probabilmente legata a indisponibilità Safe Storage',
    priority: 101,
    condition: all(
      apiGwStatusIs('403'),
      varMatches('apiGwErrorMessage', 'Invalid key=value pair \\(missing equal-sign\\) in Authorization header'),
    ),
    title: 'Exception in call getFile fileKey=PN_EXTERNAL_LEGAL_FACTS',
    resolution: 'Risoluzione non documentata.',
    details: [['Downstream', 'Safe Storage']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-ss' }],
      finalActions: [],
      links: [],
    },
  }),
];
