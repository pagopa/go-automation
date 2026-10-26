import { knownCase, SEND_DOWNSTREAMS } from '../framework.js';
import type { KnownCase } from '../framework.js';
import { all, any } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals, varExists } from '../common/varConditions.js';

import { apiGwPathMatches, apiGwStatusIs } from '../../../apigw/knownCases/conditions.js';
const INSTITUTIONS_500 = all(
  apiGwStatusIs('500'),
  varEquals('apiGwHttpMethod', 'GET'),
  apiGwPathMatches('/v1/institutions(?:/products)?$'),
);
const BFF_READ_TIMEOUT = stepEvidenceMatches(
  'query-pn-bff',
  '^(?=[\\s\\S]*Request to GET http://[^\\s"\\\\]+/ext-registry/pa/v1/(?:user-institutions|institutions/[^/\\s"\\\\]+/products))' +
    '(?=[\\s\\S]*io\\.netty\\.handler\\.timeout\\.ReadTimeoutException\\b)',
);
const SELFCARE_FAILURE = stepEvidenceMatches(
  'query-pn-external-registries',
  '^(?=[\\s\\S]*downstream_http_call)(?=[\\s\\S]*https://api\\.selfcare\\.pagopa\\.it/external/v2/)' +
    '(?=[\\s\\S]*outcome[\\\\"\\s:]+ERROR)(?=[\\s\\S]*WebClientRequestException)',
);
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'selfcare-user-groups-invalid-tenant-context',
    description: 'SelfcarePA restituisce 400 Invalid tenant context durante la lettura dei gruppi PA',
    priority: 650,
    condition: all(
      apiGwStatusIs('500'),
      varEquals('apiGwHttpMethod', 'GET'),
      apiGwPathMatches('/v1/pa/groups$'),
      stepEvidenceMatches(
        'query-pn-bff',
        '500 Internal Server Error from GET http://[^\\s"\\\\]+/ext-registry/pa/v1/groups\\b',
      ),
      stepEvidenceMatches(
        'query-pn-external-registries',
        '\\[DOWNSTREAM\\] Service SelfcarePA returned errors=400 Bad Request from GET https://api\\.selfcare\\.pagopa\\.it/external/v2/user-groups\\b',
      ),
      stepEvidenceMatches('query-pn-external-registries', 'Invalid tenant context'),
    ),
    resolution: 'Risoluzione non documentata.',
    level: 'warn',
    details: [['Errore', '{{vars.externalRegistriesErrorMsg}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-external-registries' }],
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'external-registries-selfcare-read-timeout',
    description: 'Timeout di lettura di pn-external-registries nelle chiamate Selfcare InfoPa',
    priority: 600,
    condition: all(
      INSTITUTIONS_500,
      any(
        stepEvidenceMatches(
          'query-pn-external-registries',
          '^(?=[\\s\\S]*Request to GET https://api\\.selfcare\\.pagopa\\.it/external/v2/(?:users|institutions/[^/\\s"\\\\]+/products))' +
            '(?=[\\s\\S]*Caused by: io\\.netty\\.handler\\.timeout\\.ReadTimeoutException\\b)',
        ),
        all(
          SELFCARE_FAILURE,
          stepEvidenceMatches(
            'query-pn-external-registries',
            'Caused by: io\\.netty\\.handler\\.timeout\\.ReadTimeoutException\\b',
          ),
        ),
      ),
    ),
    resolution:
      "ad oggi risulta aperta una segnalazione verso Selfcare. I timeout si presentano gi\u00E0 da un po' e siamo in attesa di riscontro.",
    level: 'warn',
    details: [['Errore', '{{vars.externalRegistriesErrorMsg}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-external-registries' }],
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1779964062639549',
          name: 'Thread del 28/05/2026',
          type: 'SLACK',
        },
      ],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'external-registries-response-already-committed',
    description: 'Timeout del BFF seguito da connessione chiusa e risposta 200 già committed in pn-external-registries',
    priority: 550,
    condition: all(
      INSTITUTIONS_500,
      BFF_READ_TIMEOUT,
      stepEvidenceMatches(
        'query-pn-external-registries',
        'reactor\\.netty\\.channel\\.AbortedException: Connection has been closed BEFORE send operation\\b',
      ),
      stepEvidenceMatches(
        'query-pn-external-registries',
        'UnsupportedOperationException[\\s\\S]*HTTP GET[\\s\\S]*/ext-registry/pa/v1/' +
          '(?:user-institutions|institutions/[^/\\s"\\\\]+/products)[\\s\\S]*ServerHttpResponse already committed \\(200 OK\\)',
      ),
    ),
    resolution: 'Risoluzione non documentata.',
    level: 'warn',
    details: [['Errore', '{{vars.externalRegistriesErrorMsg}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-external-registries' }],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'bff-external-registries-read-timeout',
    description: 'Timeout del BFF verso pn-external-registries con causa a valle ancora da verificare',
    priority: 500,
    // Resolve only after downstream traversal, so the BFF symptom cannot hide a more specific cause.
    condition: all(INSTITUTIONS_500, BFF_READ_TIMEOUT, varExists('externalRegistriesLogCount')),
    resolution: 'Risoluzione non documentata.',
    level: 'warn',
    details: [['Errore', '{{vars.bffErrorMsg}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-external-registries' }],
      finalActions: [],
      links: [],
    },
  }),
];
