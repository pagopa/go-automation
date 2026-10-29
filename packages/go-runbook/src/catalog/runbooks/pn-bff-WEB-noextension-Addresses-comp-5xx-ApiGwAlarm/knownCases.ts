import { knownCase, type KnownCase } from '../framework.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { apiGwPathMatches, apiGwStatusIs } from '../../../apigw/knownCases/conditions.js';

/** Confluence 2865397761 v1-v4 documents this BFF timeout, with no resolution. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'bff-get-addresses-read-timeout',
    description: 'Timeout di lettura del BFF durante getAddressesV1 verso pn-user-attributes',
    priority: 500,
    condition: all(
      apiGwStatusIs('500'),
      varEquals('apiGwHttpMethod', 'GET'),
      apiGwPathMatches('^/(?:bff/)?v1/addresses$'),
      stepEvidenceMatches(
        'query-pn-bff',
        'Ending process _getAddressesV1 with errors=nested exception is io\\.netty\\.handler\\.timeout\\.ReadTimeoutException\\b',
      ),
    ),
    resolution: 'Risoluzione non documentata.',
    level: 'warn',
    details: [
      ['Metodo', '{{vars.apiGwHttpMethod}}'],
      ['Path', '{{vars.apiGwPath}}'],
      ['X-Ray Trace ID', '{{vars.xRayTraceId}}'],
      ['Errore', '{{vars.bffErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-user-attributes' }],
      finalActions: [],
    },
  }),
];
