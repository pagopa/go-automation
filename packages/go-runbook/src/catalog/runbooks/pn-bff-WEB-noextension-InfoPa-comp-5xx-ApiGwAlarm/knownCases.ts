import { knownCase, SEND_DOWNSTREAMS } from '../framework.js';
import type { KnownCase } from '../framework.js';
import { all, any } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals, varExists } from '../common/varConditions.js';
import { slackLink } from '../common/analysisLinks.js';
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
      'Mantenere l’analisi aperta: verificare la ricorrenza, i retry e i tempi delle chiamate Selfcare; ' +
      'condividere le evidenze con i team pn-external-registries e Selfcare. La segnalazione del 28/05/2026 ' +
      'è un riferimento storico: verificarne lo stato attuale. Una risposta 200 successiva non annulla il timeout del BFF. ' +
      'Verificare tutte le richieste 5xx della finestra prima di chiudere l’analisi.',
    level: 'warn',
    details: [['Errore', '{{vars.externalRegistriesErrorMsg}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-external-registries' }],
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      links: [slackLink('https://pagopaspa.slack.com/archives/C087KRMD16E/p1779964062639549', 'Thread del 28/05/2026')],
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
    resolution:
      'Mantenere l’analisi aperta e ricostruire l’ordine temporale di timeout BFF, chiamate Selfcare e risposta tardiva. ' +
      'La risposta committed non prova la consegna completa del body né identifica da sola chi ha chiuso la connessione. ' +
      'Condividere la sequenza con pn-bff e pn-external-registries; chiudere solo dopo aver verificato tutte le richieste fallite.',
    level: 'warn',
    details: [['Errore', '{{vars.externalRegistriesErrorMsg}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-external-registries' }],
    },
  }),
  knownCase({
    id: 'bff-external-registries-read-timeout',
    description: 'Timeout del BFF verso pn-external-registries con causa a valle ancora da verificare',
    priority: 500,
    // Resolve only after downstream traversal, so the BFF symptom cannot hide a more specific cause.
    condition: all(INSTITUTIONS_500, BFF_READ_TIMEOUT, varExists('externalRegistriesLogCount')),
    resolution:
      'Mantenere l’analisi aperta: verificare i log correlati di pn-external-registries e, quando presenti, ' +
      'le chiamate Selfcare. Se i log sono assenti, controllare finestra temporale e identificatori; ' +
      'non attribuire automaticamente il problema a Selfcare o alla rete AWS. ' +
      'Verificare tutte le richieste 5xx della finestra prima di chiudere l’analisi.',
    level: 'warn',
    details: [['Errore', '{{vars.bffErrorMsg}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-external-registries' }],
    },
  }),
];
