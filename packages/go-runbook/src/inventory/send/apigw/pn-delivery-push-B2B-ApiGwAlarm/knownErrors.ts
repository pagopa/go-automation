import {
  all,
  anyStepEvidenceMatches,
  type KnownError,
  stepEvidenceMatches,
  varMatches,
} from '../../../../engine/index.js';
import {
  downstreamMarkerPattern,
  apiGwStatusIs,
  knownError,
  SEND_DOWNSTREAMS,
} from '../../../../toolkits/send/index.js';
/**
 * Known errors for the pn-delivery-push-B2B-ApiGwAlarm runbook.
 */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_APIGW_PDPB2BAGA_SAF-FIL-NOT-FOU',
    description: 'Download legal fact richiesto prima che il file sia disponibile su SafeStorage',
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
  knownError({
    code: 'SEND_APIGW_PDPB2BAGA_SAF-OBJ-RES-ALR-IN-PRO',
    description: 'Richiesta duplicata di restore documento su SafeStorage/S3',
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
  knownError({
    code: 'SEND_APIGW_PDPB2BAGA_DOW-SEL-503-SER-UNA',
    description: 'SelfcarePG non disponibile durante chiamata da pn-data-vault',
    condition: anyStepEvidenceMatches(
      ['query-pn-data-vault', 'query-pn-delivery-push'],
      downstreamMarkerPattern('SelfcarePG', { status: '503 Service Unavailable' }),
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
  knownError({
    code: 'SEND_APIGW_PDPB2BAGA_EXC-IN-CAL-GET-PN-EXT-LEG-FAC',
    description: 'Errore durante chiamata getFile, probabilmente legata a indisponibilità Safe Storage',
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
  knownError({
    code: 'SEND_APIGW_PDPB2BAGA_DEL-PUS-END-REQ-TIM-504',
    description: 'Timeout dell’API Gateway in attesa della risposta del backend',
    condition: all(apiGwStatusIs('504'), varMatches('apiGwErrorMessage', 'Endpoint request timed out')),
    title: 'API Gateway 504 - Endpoint request timed out',
    resolution: 'Risoluzione non documentata.',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
  knownError({
    code: 'SEND_APIGW_PDPB2BAGA_SAF-DOC-KEY-NOT-PRE-IN-DB',
    description: 'File key presente su SafeStorage ma non trovata in fase di recupero',
    condition: anyStepEvidenceMatches(
      ['query-pn-safestorage', 'query-pn-delivery-push'],
      "Document key not present in DB '[^']+'",
    ),
    title: "Document key not present in DB '<filename>'",
    resolution: 'Thread Slack 23/10/2026.',
    details: [['Downstream', 'SafeStorage']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-ss' }],
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1792760901223939',
          name: 'Thread Slack 23/10/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
];
