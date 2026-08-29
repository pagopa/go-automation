/**
 * Known cases for the pn-delivery-push-B2B-ApiGwAlarm runbook.
 */

import type { KnownCase } from '../framework.js';
import { knownCase } from '../framework.js';
import { SEND_DOWNSTREAMS } from '../framework.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'safestorage-file-not-found',
    description: 'Download legal fact richiesto prima che il file sia disponibile su SafeStorage',
    priority: 110,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.apiGwStatusCode', operator: '==', value: '404' },
        {
          type: 'contains',
          ref: 'steps.query-pn-delivery-push',
          regex: 'File not found from safeStorage fileKey=',
        },
      ],
    },
    title: 'File not found from safeStorage fileKey=<filekey>',
    resolution:
      'Chiusura - caso noto. Verificare se la fileKey e il documento sono presenti sul bucket SafeStorage; se la richiesta risulta anticipata, monitorare i cxId rumorosi o nuovi.',
    details: [['Downstream', 'SafeStorage']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-ss' }],
    },
  }),
  knownCase({
    id: 'safestorage-object-restore-already-in-progress',
    description: 'Richiesta duplicata di restore documento su SafeStorage/S3',
    priority: 105,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'contains',
          ref: 'steps.query-pn-safestorage',
          regex: 'Object restore is already in progress.*Status Code: 409',
        },
        {
          type: 'contains',
          ref: 'steps.query-pn-delivery-push',
          regex: 'Object restore is already in progress.*Status Code: 409',
        },
      ],
    },
    title: 'Object restore is already in progress (S3 409)',
    resolution: 'Chiusura - caso noto. Richiesta di restore del documento duplicata.',
    details: [['Downstream', 'SafeStorage/S3']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-ss' }],
    },
  }),
  knownCase({
    id: 'downstream-selfcarepg-503-service-unavailable',
    description: 'SelfcarePG non disponibile durante chiamata da pn-data-vault',
    priority: 100,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'contains',
          ref: 'steps.query-pn-data-vault',
          regex: '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=503 Service Unavailable',
        },
        {
          type: 'contains',
          ref: 'steps.query-pn-delivery-push',
          regex: '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=503 Service Unavailable',
        },
      ],
    },
    title: '[DOWNSTREAM] Service SelfcarePG returned errors=503 Service Unavailable',
    resolution:
      "Chiusura - caso noto. Se l'errore si protrae nel tempo, contattare i riferimenti del downstream Selfcare.",
    details: [['Downstream', 'Selfcare']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
    },
  }),
  knownCase({
    id: 'exception-in-call-getfile-pn-external-legal-facts',
    description: 'Errore durante chiamata getFile, probabilmente legata a indisponibilità Safe Storage',
    priority: 101,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.apiGwStatusCode', operator: '==', value: '403' },
        {
          type: 'pattern',
          ref: 'vars.apiGwErrorMessage',
          regex: 'Invalid key=value pair \\(missing equal-sign\\) in Authorization header',
        },
      ],
    },
    title: 'Exception in call getFile fileKey=PN_EXTERNAL_LEGAL_FACTS',
    resolution:
      "Chiusura - caso noto. Errore probabilmente legato a indisponibilità di SelfcarePG, verificare se il caso è correlato al precedente 'downstream-selfcarepg-503-service-unavailable'.",
    details: [['Downstream', 'Safe Storage']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-ss' }],
    },
  }),
];
