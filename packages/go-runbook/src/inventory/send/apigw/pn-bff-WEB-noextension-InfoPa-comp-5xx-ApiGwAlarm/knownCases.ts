import { BFF_READ_TIMEOUT, BFF_READ_TIMEOUT_VAR } from './bffReadTimeout.js';
import { apiGwPathMatches, apiGwStatusIs, knownCase, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';
import {
  all,
  any,
  anyStepEvidenceMatches,
  BRANCH_OUTCOME_VAR,
  type KnownCase,
  stepEvidenceMatches,
  varEquals,
  varMatches,
} from '../../../../engine/index.js';

const INSTITUTIONS_500 = all(
  apiGwStatusIs('500'),
  varEquals('apiGwHttpMethod', 'GET'),
  apiGwPathMatches('/v1/institutions(?:/products)?$'),
);
/** The read of pn-external-registries, and the other errors of the same request beside the row of a node. */
const EXTERNAL_REGISTRIES = 'query-pn-external-registries';
const EXTERNAL_REGISTRIES_ROWS: ReadonlyArray<string> = [EXTERNAL_REGISTRIES, `${EXTERNAL_REGISTRIES}.siblings`];

/** The BFF timeout of the BFF error above a node of pn-external-registries. */
const BFF_READ_TIMEOUT_ABOVE = varEquals(BFF_READ_TIMEOUT_VAR, 'true');

const SELFCARE_FAILURE_PATTERN =
  '^(?=[\\s\\S]*downstream_http_call)(?=[\\s\\S]*https://api\\.selfcare\\.pagopa\\.it/external/v2/)' +
  '(?=[\\s\\S]*outcome[\\\\"\\s:]+ERROR)(?=[\\s\\S]*WebClientRequestException)';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'selfcare-user-groups-invalid-tenant-context',
    description: 'SelfcarePA restituisce 400 Invalid tenant context durante la lettura dei gruppi PA',
    condition: all(
      apiGwStatusIs('500'),
      varEquals('apiGwHttpMethod', 'GET'),
      apiGwPathMatches('/v1/pa/groups$'),
      // The BFF error above, and the Selfcare 400 of this error with the tenant detail in it or in another error.
      varMatches('bffErrorMsg', '500 Internal Server Error from GET http://[^\\s"\\\\]+/ext-registry/pa/v1/groups\\b'),
      stepEvidenceMatches(
        EXTERNAL_REGISTRIES,
        '\\[DOWNSTREAM\\] Service SelfcarePA returned errors=400 Bad Request from GET https://api\\.selfcare\\.pagopa\\.it/external/v2/user-groups\\b',
      ),
      anyStepEvidenceMatches(EXTERNAL_REGISTRIES_ROWS, 'Invalid tenant context'),
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
    condition: all(
      INSTITUTIONS_500,
      any(
        stepEvidenceMatches(
          'query-pn-external-registries',
          '^(?=[\\s\\S]*Request to GET https://api\\.selfcare\\.pagopa\\.it/external/v2/(?:users|institutions/[^/\\s"\\\\]+/products))' +
            '(?=[\\s\\S]*Caused by: io\\.netty\\.handler\\.timeout\\.ReadTimeoutException\\b)',
        ),
        // The retry timeout of this error, with the failed Selfcare telemetry in it or in another error.
        all(
          stepEvidenceMatches(
            EXTERNAL_REGISTRIES,
            'Caused by: io\\.netty\\.handler\\.timeout\\.ReadTimeoutException\\b',
          ),
          anyStepEvidenceMatches(EXTERNAL_REGISTRIES_ROWS, SELFCARE_FAILURE_PATTERN),
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
    condition: all(
      INSTITUTIONS_500,
      BFF_READ_TIMEOUT_ABOVE,
      // The committed response of this error, with the closed connection in it or in another error.
      anyStepEvidenceMatches(
        EXTERNAL_REGISTRIES_ROWS,
        'reactor\\.netty\\.channel\\.AbortedException: Connection has been closed BEFORE send operation\\b',
      ),
      stepEvidenceMatches(
        EXTERNAL_REGISTRIES,
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
    // A symptom: only when pn-external-registries was read for this error and nothing below explains it.
    condition: all(
      INSTITUTIONS_500,
      BFF_READ_TIMEOUT,
      varEquals('externalRegistriesLookupState', 'queried'),
      varEquals(BRANCH_OUTCOME_VAR, 'undiagnosed'),
    ),
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
