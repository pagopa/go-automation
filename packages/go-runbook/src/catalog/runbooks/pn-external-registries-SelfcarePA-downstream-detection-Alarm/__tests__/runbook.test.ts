import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { assertAnalysisAnnotations } from '../../../../validation/assertAnalysisAnnotations.js';
import { computeRunbookTimeRange } from '../../../computeRunbookTimeRange.js';
import { SEND_DOWNSTREAMS } from '../../framework.js';
import { SERVICE } from '../knownServices.js';
import { EXTERNAL_REGISTRIES_SELFCARE_PA_DOWNSTREAM_DETECTION_ALARM_REGISTRATION as REGISTRATION } from '../registration.js';
import { buildRunbook } from '../runbook.js';

const ROOT = '1-6ad40439-4ab60ee8773327196205da73';
const TRACE_HEADER = `Self=1-6ad40439-05b2025543d2e23f042ddf60;Root=${ROOT};Parent=f23cf74b4e3a3bc6;Sampled=0`;
const TIMEOUT = '[DOWNSTREAM] Service SelfcarePA returned errors=io.netty.handler.timeout.ReadTimeoutException';
const ENDPOINT = 'https://api.selfcare.pagopa.it/external/v2/user-groups';
const INVALID_TENANT = `[DOWNSTREAM] Service SelfcarePA returned errors=400 Bad Request from GET ${ENDPOINT};{"detail":"Invalid tenant context"}`;
const RATE_TOO_LARGE = `[DOWNSTREAM] Service SelfcarePA returned errors=500 Internal Server Error from GET ${ENDPOINT};{"detail":"Command failed with error 16500 (RequestRateTooLarge): TooManyRequests (429)"}`;

interface TestExecution {
  readonly result: RunbookExecutionResult;
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly queries: ReadonlyArray<string>;
}

async function execute(
  messages: ReadonlyArray<string>,
  trackerMessages: ReadonlyArray<string> = [],
  traceHeader: string = TRACE_HEADER,
): Promise<TestExecution> {
  const queries: string[] = [];
  const services = createTestServiceRegistry({
    cloudWatchLogs: {
      async query(groups: ReadonlyArray<string>, query: string): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> {
        await Promise.resolve();
        assert.deepStrictEqual(groups, ['/aws/ecs/pn-external-registries']);
        queries.push(query);
        return (queries.length === 1 ? messages : trackerMessages).map((message) => [
          { field: 'level', value: 'ERROR' },
          { field: 'message', value: message },
          { field: 'trace_id', value: traceHeader },
          { field: '@message', value: JSON.stringify({ level: 'ERROR', message, trace_id: traceHeader }) },
        ]);
      },
    },
  });
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['startTime', '2026-10-17T23:21:36.959Z'],
      ['endTime', '2026-10-18T00:06:36.959Z'],
    ]),
    services,
  );
  return { result, draft: buildAnalysisDraft(runbook, result), queries };
}

describe('external-registries SelfcarePA downstream runbook', () => {
  it('registers a read-only SEND downstream runbook with valid census references', () => {
    assert.strictEqual(REGISTRATION.product, 'SEND');
    assert.strictEqual(REGISTRATION.kind, 'DOWNSTREAM');
    assert.deepStrictEqual(REGISTRATION.alarmNames, [REGISTRATION.key]);
    const runbook = buildRunbook();
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.doesNotThrow(() => assertAnalysisAnnotations(runbook, 'SEND'));
    assert.match(runbook.analysisDefaults?.links?.[0]?.url ?? '', /3414851586/u);
  });

  it('includes the observed errors more than 34 minutes before the event', () => {
    assert.deepStrictEqual(
      computeRunbookTimeRange(buildRunbook(), { kind: 'single', at: '2026-10-18T00:01:36.959Z' }),
      { startTime: '2026-10-17T23:21:36.959Z', endTime: '2026-10-18T00:06:36.959Z' },
    );
  });

  it('filters structured ERROR messages for SelfcarePA and accommodates the observed September volume', () => {
    const query = SERVICE.queryOverride ?? '';
    assert.match(query, /level = 'ERROR'/u);
    assert.match(query, /(?<![@\w])message like '\[DOWNSTREAM\] Service SelfcarePA returned errors='/u);
    assert.match(query, /fields @timestamp, level, trace_id, message/u);
    assert.doesNotMatch(query, /@message/u);
    assert.match(query, /limit 10000/u);
    assert.doesNotMatch(query, /SelfCare|SelfcarePG|not like/u);
  });

  for (const [message, id] of [
    [TIMEOUT, 'selfcare-pa-read-timeout'],
    [INVALID_TENANT, 'selfcare-pa-invalid-tenant-context'],
    [RATE_TOO_LARGE, 'selfcare-pa-user-groups-rate-too-large'],
  ] as const) {
    it(`correlates q2 before classifying ${id}, keeping the analysis open`, async () => {
      const { result, draft, queries } = await execute([message], ['INFO - Downstream request completed']);
      assert.strictEqual(result.stepsExecuted, 4);
      assert.strictEqual(queries.length, 2);
      assert.ok(queries[1]?.includes(`filter @message like '${ROOT}'`));
      assert.ok(!queries[1]?.includes('Self='));
      assert.deepStrictEqual(
        result.matchedCases.map(({ id: caseId }) => caseId),
        [id],
      );
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.deepStrictEqual(draft.downstreams, [SEND_DOWNSTREAMS.SELFCARE]);
      assert.deepStrictEqual(draft.finalActions, []);
      assert.ok(draft.conclusionNotes?.startsWith('Risoluzione non documentata.'));
    });
  }

  it('does not infer a persistent incident or unconditional escalation from the timeout signature', async () => {
    const { draft } = await execute([TIMEOUT]);
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.ok(draft.conclusionNotes?.includes('Se il problema si protrae nel tempo'));
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(draft.finalActions, []);
  });

  it('handles the observed September volume without dropping the log count', async () => {
    const { result, draft } = await execute(Array.from({ length: 3967 }, () => INVALID_TENANT));
    assert.strictEqual(result.finalContext.vars.get('externalRegistriesLogCount'), '3967');
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('can identify a documented signature without a trace, recording that q2 has no logs', async () => {
    const { result, queries, draft } = await execute([TIMEOUT], [], '');
    assert.strictEqual(queries.length, 1);
    assert.strictEqual(result.finalContext.vars.get('externalRegistriesTraceLogCount'), '0');
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('does not use errors from q2, other downstreams or split rows to manufacture a case', async () => {
    for (const messages of [
      [],
      [TIMEOUT.replace('SelfcarePA', 'SelfcarePG')],
      [TIMEOUT.replace('SelfcarePA', 'IO')],
      ['[DOWNSTREAM] Service SelfcarePA returned errors=503 Service Unavailable'],
      [
        `[DOWNSTREAM] Service SelfcarePA returned errors=400 Bad Request from GET ${ENDPOINT};{}`,
        'Invalid tenant context',
      ],
      [
        `[DOWNSTREAM] Service SelfcarePA returned errors=500 Internal Server Error from GET ${ENDPOINT};{}`,
        'RequestRateTooLarge TooManyRequests (429)',
      ],
    ]) {
      const { result, draft } = await execute(messages, [TIMEOUT, INVALID_TENANT, RATE_TOO_LARGE]);
      assert.deepStrictEqual(result.matchedCases, []);
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    }
  });
});
