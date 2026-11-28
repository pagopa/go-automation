import { SELFCARE_ALARM } from './alarmDefinition.js';
import {
  createInteropApiGwKnownErrorFactory,
  INTEROP_DOWNSTREAMS,
  type InteropEnvironment,
} from '../../../../toolkits/interop/index.js';
import { all, any, anyStepEvidenceMatches, type Condition, type KnownError } from '../../../../engine/index.js';

// Confluence v103: entries without an environment retain their existing scope.
const COMMON_KNOWN_SELFCARE_IDS = [
  '56f4f576-af5e-4a90-8be2-1ac78dec899f',
  'fc7b97a0-e921-454f-b744-4c09ae40c663',
  '1219c34e-9797-45e9-a1e7-da9fb35ed468',
  'acb68e12-103c-4e43-983a-13ae587a6240',
  '02184e01-fff2-4170-9d8c-c52867fca6f6',
  '9357291b-3a55-4351-af16-61dcacf88b80',
] as const;
const KNOWN_SELFCARE_IDS_BY_ENVIRONMENT: Readonly<Record<InteropEnvironment, ReadonlyArray<string>>> = {
  prod: [
    ...COMMON_KNOWN_SELFCARE_IDS,
    '560a56a0-745a-44cf-b228-0493ec48dce8',
    '7467fffd-9e43-40a9-b74f-59e4d661f9fe',
    '0a0da251-1568-4fed-82b5-10d6ccc1de7e',
    '627dc018-0e91-47b5-9532-d0c8832f239f',
    'a4cfa606-8981-4def-84f8-781149adb63d',
    '418ea95f-552d-4a51-8968-5b5c7531f6c9',
    '4ee1cabf-53f4-469b-8b4b-9ac933ec1b4e',
    '987cf14e-e746-4c85-8898-dbe960dbf11c',
  ],
  att: [...COMMON_KNOWN_SELFCARE_IDS, '0a0da251-1568-4fed-82b5-10d6ccc1de7e', '8a8753ef-8adc-4baa-bfb4-22a0b39c2cdd'],
  test: [...COMMON_KNOWN_SELFCARE_IDS, '560a56a0-745a-44cf-b228-0493ec48dce8', '7467fffd-9e43-40a9-b74f-59e4d661f9fe'],
};
const TENANT_NOT_FOUND_PATTERN = 'Tenant with selfcareId[^\\n]*not found|Tenant not found by selfcareId';
const TENANT_EVIDENCE_STEPS = [
  SELFCARE_ALARM.stepIds.queryApiGwAggregates,
  SELFCARE_ALARM.stepIds.queryApplicationLogs,
  SELFCARE_ALARM.stepIds.queryCidTracker,
];
const KNOWN_TENANT_NOT_FOUND_CONDITION: Condition = any(
  ...Object.entries(KNOWN_SELFCARE_IDS_BY_ENVIRONMENT).map(([environment, ids]) =>
    all(
      { type: 'contains', ref: 'vars.interopEnvironment', value: [environment] },
      anyStepEvidenceMatches(
        TENANT_EVIDENCE_STEPS,
        `Tenant with selfcareId[^\\n]*(?:${ids.join('|')})[^\\n]*not found`,
      ),
    ),
  ),
);
const UNKNOWN_TENANT_NOT_FOUND_CONDITION: Condition = any(
  ...Object.entries(KNOWN_SELFCARE_IDS_BY_ENVIRONMENT).map(([environment, ids]) =>
    all(
      { type: 'contains', ref: 'vars.interopEnvironment', value: [environment] },
      anyStepEvidenceMatches(
        TENANT_EVIDENCE_STEPS,
        `Tenant with selfcareId(?![^\\n]*(?:${ids.join('|')}))[^\\n]*not found|` +
          `Tenant not found by selfcareId(?![^\\n]*(?:${ids.join('|')}))`,
      ),
    ),
  ),
);
const knownError = createInteropApiGwKnownErrorFactory({
  apiGatewayStepId: SELFCARE_ALARM.stepIds.queryApiGwAggregates,
  applicationLogsStepId: SELFCARE_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: SELFCARE_ALARM.stepIds.queryCidTracker,
  varPrefix: SELFCARE_ALARM.varPrefix,
  applicationLogsLabel: 'Log applicativi',
});
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  {
    ...knownError({
      code: 'INTEROP_APIGW_IS10A5_TEN-NOT-FOU-KNO-SEL-ID',
      description: 'Tenant non trovato per un SelfcareID esplicitamente censito come noto',
      regex: TENANT_NOT_FOUND_PATTERN,
      resolution:
        'SelfcareID gi\u00E0 elencato nel runbook per l\u2019ambiente: non effettuare la segnalazione prevista per gli identificativi assenti dall\u2019elenco.',
      proposedStatus: 'COMPLETED',
      resources: ['interop-be-tenant-process'],
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7918', name: 'PIN-7918', type: 'JIRA' }],
      finalActions: [],
    }),
    condition: KNOWN_TENANT_NOT_FOUND_CONDITION,
  },
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-UNR-NOT-IN-APP-MAN-UNA',
    description: 'Errore 504 nel recupero delle notifiche non lette da in-app-notification-manager',
    regex:
      'Error while fetching unread notifications:[^\\n]*(?:ECONNREFUSED|ETIMEDOUT|status code 403)|' +
      '10\\.1\\.2\\.37:8088',
    resolution: 'Eseguita hotfix nella stessa giornata. Vedi Thread Slack - #prod_interop_go - 27/01/2026',
    proposedStatus: 'COMPLETED',
    resources: ['interop-be-in-app-notification-manager'],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-9041', name: 'PIN-9041', type: 'JIRA' }],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-S3-LIS-BUC-NOT-AUT',
    description: 'Permesso s3:ListBucket mancante durante il recupero di un documento',
    regex: 'not authorized to perform:\\s*s3:ListBucket|no identity-based policy allows the s3:ListBucket action',
    resolution: 'Probabile riconfigurazione dei permessi da parte del gruppo Infrastruttura.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-9245', name: 'PIN-9245', type: 'JIRA' }],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-SEL-PRO-RET-ERR',
    description: 'Errore nel recupero dei prodotti Selfcare per l’istituzione',
    regex: 'Error retrieving products for institution',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-8874', name: 'PIN-8874', type: 'JIRA' }],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-SEL-USE-504',
    description: 'Timeout 504 di Selfcare durante il recupero degli utenti del tenant',
    regex:
      'api\\.selfcare\\.pagopa\\.it/external/v2/institutions/[^\\s]+/users[^\\n]*504|' +
      'Error while retrieving users corresponding to tenant[^\\n]*status code 504',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    environments: ['prod'],
    downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
    finalActions: [],
    links: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-SEL-USE-500',
    description: 'Errore 500 di Selfcare durante il recupero degli utenti del tenant',
    regex: 'api\\.selfcare\\.pagopa\\.it/external/v2/institutions/[^\\s]+/users\\s+500:Internal Server Error',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    environments: ['prod', 'test'],
    downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1795686536751049',
        name: 'Thread Slack 26/11/2026',
        type: 'SLACK',
      },
    ],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-ESE-DOC-KEY-NOT-FOU',
    description: 'Documento dell’e-service assente nel bucket (delete marker)',
    regex: 'Error getting file eservices/docs/[^\\s]+ in bucket [^\\s:]+: The specified key does not exist',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    environments: ['test'],
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-11572', name: 'PIN-11572', type: 'JIRA' },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1794824145316189',
        name: 'Thread Slack 16/11/2026',
        type: 'SLACK',
      },
    ],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-KAF-LOC-TIM',
    description: 'Timeout temporaneo durante la connessione ai broker Kafka',
    regex: 'KafkaJSLockTimeout: Timeout while acquiring lock|connect to broker[^\\n]+:9098',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    environments: ['test'],
    finalActions: [],
    links: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-SIG-CON-RES-503',
    description: 'Response 503 durante il recupero del contratto firmato',
    regex: 'Response\\s*503\\s*Service Unavailable',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    environments: ['test'],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784212876030559',
        name: 'Thread Response 503 signedContract',
        type: 'SLACK',
      },
    ],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-TEN-KIN-ERR-004-0004',
    description: 'Tenant kind non trovato durante la creazione di un purpose',
    regex: 'errors:\\s*004-0004, Tenant kind for tenant[^\\n]*not found',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    resources: ['interop-be-purpose-process'],
    finalActions: [],
    links: [],
  }),
  {
    ...knownError({
      code: 'INTEROP_APIGW_IS10A5_TEN-NOT-FOU-SEL-ID',
      description: 'Tenant non trovato tramite SelfcareID',
      regex: TENANT_NOT_FOUND_PATTERN,
      resolution:
        'Verificare il tenant nel DB read_model dell\u2019ambiente e applicare le regole di notifica indicate nella sezione Verifiche e azioni finali.',
      proposedStatus: 'IN_PROGRESS',
      resources: ['interop-be-tenant-process'],
      finalActions: [],
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7918', name: 'PIN-7918', type: 'JIRA' }],
    }),
    condition: UNKNOWN_TENANT_NOT_FOUND_CONDITION,
  },
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-SES-TOK-ORI-NOT-ALL',
    description: 'Tenant origin non consentita o SelfcareID fuori allow list',
    regex: 'Tenant origin is not allowed and SelfcareID[^\\n]*does not belong to allow list',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-8726', name: 'PIN-8726', type: 'JIRA' }],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-ERR-CRE-ESE-DES',
    description: 'Errore nella creazione del descriptor di un eService',
    regex: 'Error creating descriptor in EService',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-8720', name: 'PIN-8720', type: 'JIRA' }],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-ERR-CRE-ESE-TEM-DOC',
    description: 'Errore nella creazione del documento INTERFACE del template eService',
    regex: 'Error creating eService template document of kind INTERFACE',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-8244', name: 'PIN-8244', type: 'JIRA' }],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-SEL-ENT-NOT-FIL',
    description: 'Selfcare UserInstitutionResource non valorizzata',
    regex: 'Selfcare entity UserInstitutionResource with field unknown not filled',
    resolution:
      'Comportamento Atteso: Il BFF fallisce volutamente con 500 : fail-fast per segnalare un dato corrotto o non conforme del provider esterno.',
    proposedStatus: 'COMPLETED',
    environments: ['prod', 'test'],
    downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7068', name: 'PIN-7068', type: 'JIRA' }],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-INV-CON-DIS-HEA',
    description: 'Carattere non valido nell’header Content-Disposition',
    regex: 'Invalid character in header content[^\\n]*Content-Disposition',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7865', name: 'PIN-7865', type: 'JIRA' }],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-ADM-ZIP-INV-FOR',
    description: 'Archivio ZIP non valido o troncato durante import eServices',
    regex: 'ADM-ZIP: Invalid or unsupported zip format\\. No END header found',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-9483', name: 'PIN-9483', type: 'JIRA' }],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_PUR-PRO-ECO-OR-SOC-HAN-UP',
    description: 'Purpose-process indisponibile con ECONNRESET o socket hang up',
    regex: 'errors:\\s*008-9991[^\\n]*(?:read ECONNRESET|socket hang up)',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    resources: ['interop-be-purpose-process'],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-10449', name: 'PIN-10449', type: 'JIRA' }],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_PUR-PRO-TEN-KIN-NOT-FOU',
    description: 'Tenant kind non trovato in purpose-process',
    regex: 'Tenant kind for tenant[^\\n]*not found',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    resources: ['interop-be-purpose-process'],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-8719', name: 'PIN-8719', type: 'JIRA' }],
    excludeRegex: 'errors:\\s*004-0004',
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_PUR-PRO-PDF-GEN-TIM',
    description: 'Timeout durante la generazione PDF in purpose-process',
    regex: 'Error during pdf generation[^\\n]*Navigation timeout of 30000 ms exceeded',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    resources: ['interop-be-purpose-process'],
    finalActions: [],
    links: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_TEN-PRO-REA-MOD-CON-REF',
    description: 'Connessione al read_model rifiutata da tenant-process',
    regex: 'connect ECONNREFUSED 10\\.0\\.28\\.230:5432',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    resources: ['interop-be-tenant-process'],
    finalActions: [],
    links: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-SAM-NOT-ON-OR-AFT-NOT-COM',
    description: 'Condizione SAML NotOnOrAfter non conforme',
    regex: 'Conditions NotOnOrAfter are not compliant',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_AUT-PRO-INV-API-ROL',
    description: 'Ruolo api non autorizzato per validateTokenGeneration',
    regex: 'Invalid roles[^\\n]*\\\\?"api\\\\?"[^\\n]*for this operation',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    resources: ['interop-be-authorization-process'],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C06D24MANNN/p1767608380741029',
        name: 'Thread invalid api role',
        type: 'SLACK',
      },
    ],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-TOK-EXP',
    description: 'Token JWT di sessione scaduto',
    regex:
      'Token verification failed: TokenExpiredError: jwt expired|' +
      'Error while fetching unread notifications:[^\\n]*status code 401',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-7962', name: 'PIN-7962', type: 'JIRA' },
      { url: 'https://pagopa.atlassian.net/browse/PIN-7903', name: 'PIN-7903', type: 'JIRA' },
    ],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-ERR-GET-PUB-KEY',
    description: 'Errore nel recupero della public key di firma',
    regex: 'Error getting public key|error in secret or public key callback: Error getting signing key',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7777', name: 'PIN-7777', type: 'JIRA' }],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_BFF-PRI-NOT-TOS-RET-ERR',
    description: 'Errore nel recupero delle privacy notices TOS',
    regex: 'Error retrieving privacy notices for consentType TOS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7979', name: 'PIN-7979', type: 'JIRA' }],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_DUP-EVE-STR-VER',
    description: 'Evento duplicato su events_stream_id_version_key gestito tramite retry',
    regex: 'duplicate key value violates unique constraint[^\\n]*events_stream_id_version_key',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    resources: ['interop-be-purpose-process', 'interop-be-notification-config-process'],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7796', name: 'PIN-7796', type: 'JIRA' }],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IS10A5_API-GAT-BAC-TIM-504',
    description: 'API Gateway ha superato il timeout di 29 secondi del backend',
    regex: 'Execution failed due to a timeout error',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    evidence: 'API_GATEWAY',
    finalActions: [],
    links: [],
  }),
];
