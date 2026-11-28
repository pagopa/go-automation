import { knownError, lambda, lambdaLogEvidenceMatches } from '../../../../toolkits/send/index.js';
import type { KnownError } from '../../../../engine/index.js';

export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_LAMBDA_PMSULESMA_MET-STA-UPD-CON-REQ-FAI',
    description: 'Scrittura condizionale fallita per un record Kinesis già elaborato',
    condition: lambdaLogEvidenceMatches(
      'Error The conditional request failed processing record with sequenceNumber:\\s*\\d+',
    ),
    title: 'Record Kinesis già elaborato: scrittura condizionale fallita',
    resolution:
      'Verificare se nei log precedenti una richiesta uguale è andata in OK. In caso positivo, aprire un task Jira di pulizia bucket, scaricare dal bucket pn-esm-kinesis-failure-notifications-eu-south-1-<account> i file che hanno causato l’allarme, allegarli al task ed eliminarli definitivamente (hard delete). In caso negativo, riportare il caso al team di competenza.',
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'La condizione di scrittura non è soddisfatta per un record Kinesis già elaborato (Delete failed: iun does not match).',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1794322187704329',
          name: 'Thread Slack 10/11/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_ERRORS,
];
