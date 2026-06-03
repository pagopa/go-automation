/**
 * Known cases for the pn-delivery-push-B2B-ApiGwAlarm runbook.
 */

import type { KnownCase } from '@go-automation/go-runbook';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
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
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] File not found from safeStorage fileKey=<filekey>\n' +
        'Risoluzione: Chiusura - caso noto. Verificare se la fileKey e il documento sono presenti sul bucket SafeStorage; se la richiesta risulta anticipata, monitorare i cxId rumorosi o nuovi.\n' +
        'Downstream: SafeStorage\n',
    },
  },
  {
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
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Object restore is already in progress (S3 409)\n' +
        'Risoluzione: Chiusura - caso noto. Richiesta di restore del documento duplicata.\n' +
        'Downstream: SafeStorage/S3\n',
    },
  },
  {
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
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] [DOWNSTREAM] Service SelfcarePG returned errors=503 Service Unavailable\n' +
        "Risoluzione: Chiusura - caso noto. Se l'errore si protrae nel tempo, contattare i riferimenti del downstream Selfcare.\n" +
        'Downstream: Selfcare\n',
    },
  },
  {
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
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Exception in call getFile fileKey=PN_EXTERNAL_LEGAL_FACTS\n' +
        "Risoluzione: Chiusura - caso noto. Errore probabilmente legato a indisponibilità di SelfcarePG, verificare se il caso è correlato al precedente 'downstream-selfcarepg-503-service-unavailable'.\n" +
        'Downstream: Safe Storage\n',
    },
  },
];
