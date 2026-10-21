import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'purpose-process-duplicate-event-stream-version',
    description: 'Duplicate key su events_stream_id_version_key gestito tramite retry',
    priority: 100,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'contains',
          ref: 'steps.query-interop-be-backend-for-frontend',
          regex: 'duplicate key value violates unique constraint \\\\?"events_stream_id_version_key\\\\?"',
        },
        {
          type: 'contains',
          ref: 'steps.query-interop-cid-tracker',
          regex: 'duplicate key value violates unique constraint \\\\?"events_stream_id_version_key\\\\?"',
        },
      ],
    },
    title: 'Duplicate key su events_stream_id_version_key gestito tramite retry',
    resolution: 'Nessuna azione necessaria. Questo tipo di errori viene gestito automaticamente dai ms tramite retry.',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopBffCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'bff-invalid-content-disposition-header',
    description: 'Header Content-Disposition non valido nella risposta gestita dal BFF',
    priority: 95,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'contains',
          ref: 'steps.query-interop-be-backend-for-frontend',
          regex: 'Invalid character in header content.*Content-Disposition',
        },
        {
          type: 'contains',
          ref: 'steps.query-interop-cid-tracker',
          regex: 'Invalid character in header content.*Content-Disposition',
        },
      ],
    },
    title: 'Header Content-Disposition non valido nella risposta gestita dal BFF',
    resolution: 'PIN-7865',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopBffCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [
        {
          url: 'https://pagopa.atlassian.net/browse/PIN-7865',
          name: 'PIN-7865',
          type: 'JIRA',
        },
      ],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'bff-adm-zip-invalid-format',
    description: 'Archivio ZIP non valido o troncato ricevuto dal BFF',
    priority: 94,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'contains',
          ref: 'steps.query-interop-be-backend-for-frontend',
          regex: 'ADM-ZIP: Invalid or unsupported zip format\\. No END header found',
        },
        {
          type: 'contains',
          ref: 'steps.query-interop-cid-tracker',
          regex: 'ADM-ZIP: Invalid or unsupported zip format\\. No END header found',
        },
      ],
    },
    title: 'Archivio ZIP non valido o troncato ricevuto dal BFF',
    resolution: 'PIN-9483',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopBffCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [
        {
          url: 'https://pagopa.atlassian.net/browse/PIN-9483',
          name: 'PIN-9483',
          type: 'JIRA',
        },
      ],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'bff-token-expired',
    description: 'Token JWT scaduto',
    priority: 93,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'contains',
          ref: 'steps.query-interop-be-backend-for-frontend',
          regex: 'Token verification failed: TokenExpiredError: jwt expired',
        },
        {
          type: 'contains',
          ref: 'steps.query-interop-cid-tracker',
          regex: 'Token verification failed: TokenExpiredError: jwt expired',
        },
      ],
    },
    title: 'Token JWT scaduto',
    resolution: 'Risoluzione non documentata.',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopBffCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'bff-error-getting-public-key',
    description: 'Errore nel recupero o nella validazione della public key',
    priority: 90,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'contains',
          ref: 'steps.query-interop-be-backend-for-frontend',
          regex: 'Error getting public key|Token verification failed: JsonWebTokenError',
        },
        {
          type: 'contains',
          ref: 'steps.query-interop-cid-tracker',
          regex: 'Error getting public key|Token verification failed: JsonWebTokenError',
        },
      ],
    },
    title: 'Errore nel recupero o nella validazione della public key',
    resolution: 'PIN-7777 Thread Slack 15/07/2026',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopBffCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [
        {
          url: 'https://pagopa.atlassian.net/browse/PIN-7777',
          name: 'PIN-7777',
          type: 'JIRA',
        },
      ],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'bff-agreement-api-econnreset',
    description: 'ECONNRESET nella chiamata agreement API dal BFF',
    priority: 80,
    condition: {
      type: 'and',
      conditions: [
        {
          type: 'or',
          conditions: [
            {
              type: 'contains',
              ref: 'steps.query-interop-be-backend-for-frontend',
              regex: 'errors: 008-9991',
            },
            {
              type: 'contains',
              ref: 'steps.query-interop-cid-tracker',
              regex: 'errors: 008-9991',
            },
          ],
        },
        {
          type: 'or',
          conditions: [
            {
              type: 'contains',
              ref: 'steps.query-interop-be-backend-for-frontend',
              regex: 'read ECONNRESET',
            },
            {
              type: 'contains',
              ref: 'steps.query-interop-cid-tracker',
              regex: 'read ECONNRESET',
            },
          ],
        },
      ],
    },
    title: 'ECONNRESET nella chiamata agreement API dal BFF',
    resolution: '(Da verificare) [PIN-6400] BFF - AgreementApi read ECONNRESET - Jira',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopBffCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      links: [
        {
          url: 'https://pagopa.atlassian.net/browse/PIN-6400',
          name: 'PIN-6400',
          type: 'JIRA',
        },
      ],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'purpose-process-unavailable-econnreset',
    description: 'Errore transitorio verso purpose-process',
    priority: 70,
    condition: {
      type: 'and',
      conditions: [
        {
          type: 'or',
          conditions: [
            {
              type: 'contains',
              ref: 'steps.query-interop-be-backend-for-frontend',
              regex: 'purpose-process',
            },
            {
              type: 'contains',
              ref: 'steps.query-interop-cid-tracker',
              regex: 'purpose-process',
            },
          ],
        },
        {
          type: 'or',
          conditions: [
            {
              type: 'contains',
              ref: 'steps.query-interop-be-backend-for-frontend',
              regex: 'read ECONNRESET|socket hang up',
            },
            {
              type: 'contains',
              ref: 'steps.query-interop-cid-tracker',
              regex: 'read ECONNRESET|socket hang up',
            },
          ],
        },
      ],
    },
    title: 'Errore transitorio verso purpose-process',
    resolution: 'PIN-10449',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopBffCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [
        {
          url: 'https://pagopa.atlassian.net/browse/PIN-10449',
          name: 'PIN-10449',
          type: 'JIRA',
        },
      ],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'bff-tenant-kind-not-found',
    description: 'Tenant kind non trovato',
    priority: 60,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'contains',
          ref: 'steps.query-interop-be-backend-for-frontend',
          regex: 'errors: 004-0004, Tenant kind .* not found',
        },
        {
          type: 'contains',
          ref: 'steps.query-interop-cid-tracker',
          regex: 'errors: 004-0004, Tenant kind .* not found',
        },
      ],
    },
    title: 'Tenant kind non trovato',
    resolution: 'In attesa di feedback dal team di prodotto.',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopBffCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
];
