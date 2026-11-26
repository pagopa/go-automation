import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AWSCloudWatchLogsQueryService, GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { StepResult } from '../../../../../../engine/types/StepResult.js';
import { CORE, EXTRA, port } from '../../../../accounts/__tests__/fixtures.js';
import type { AccountScopedContext } from '../../../../accounts/AccountScopedContext.js';
import type { OperationalContext } from '../../../../services/OperationalContext.js';
import { createTestServiceRegistry } from '../../../../testing/createTestServiceRegistry.js';
import type { AccountLogDiagnostics } from '../AccountLogDiagnostics.js';
import type { AccountLogRead } from '../AccountLogRead.js';
import { QueryAccountLogDiagnosticsStep } from '../QueryAccountLogDiagnosticsStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';
import { TEST_TIME_RANGE_PARAMS } from '../../../../../../__tests__/helpers/TEST_TIME_RANGE_PARAMS.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
/** Rows of a query of an account; throwing fails the read. */
type RowsForFn = (account: string, query: string) => Rows;

const DIAGNOSTICS: AccountLogDiagnostics = {
  narrative: 'Job diagnostics',
  accounts: { subject: 'job', accounts: [CORE, EXTRA], scope: 'every-account' },
  logGroup: '/aws/ecs/job',
  queries: [
    { kind: 'errors', query: 'errors-query' },
    { kind: 'streams', query: 'streams-query' },
  ],
};

class QueryJobDiagnosticsStep extends QueryAccountLogDiagnosticsStep {
  readonly id = 'query-job-diagnostics';
  readonly label = 'Job diagnostics';
  rejectOccurrence = false;

  protected override diagnostics(): AccountLogDiagnostics {
    return DIAGNOSTICS;
  }

  protected override checkOccurrence(): void {
    if (this.rejectOccurrence) throw new Error('unsupported occurrence');
  }

  protected override readSource(account: AccountScopedContext, queryKind: string): string {
    return `${account.name} ${queryKind}`;
  }

  protected override summarize(_context: OperationalContext, reads: ReadonlyArray<AccountLogRead>): StepResult<Rows> {
    return {
      success: true,
      output: reads.flatMap(({ read }) => read.rows),
      vars: {
        reads: reads
          .map(({ account, queryKind, read }) => `${account.name}:${queryKind}:${String(read.failure === undefined)}`)
          .join(','),
      },
      coverage: reads.flatMap(({ read }) => read.coverage),
    };
  }
}

function reader(account: string, rowsFor: RowsForFn): AWSCloudWatchLogsQueryService {
  return createTestServiceRegistry({
    cloudWatchLogs: {
      // eslint-disable-next-line @typescript-eslint/require-await
      async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
        const rows = rowsFor(account, query);
        return {
          rows,
          statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
          queryExecutions: [],
        };
      },
    },
  }).cloudWatchLogs;
}

async function context(rowsFor: RowsForFn): Promise<OperationalContext> {
  const awsAccounts = port({
    environment: 'prod',
    readers: { [CORE]: reader('core', rowsFor), [EXTRA]: reader('extra', rowsFor) },
  });
  await awsAccounts.prepare([CORE, EXTRA]);
  return createTestContext({ params: TEST_TIME_RANGE_PARAMS, services: { awsAccounts } });
}

describe('QueryAccountLogDiagnosticsStep', () => {
  it('runs every query in every account and hands the reads to the subclass, a failed one included', async () => {
    const step = new QueryJobDiagnosticsStep();
    const result = await step.execute(
      await context((account, query) => {
        if (account === 'extra' && query === 'streams-query') throw new Error('AccessDenied');
        return [logRow({ account, query })];
      }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(
      result.vars?.['reads'],
      'core:errors:true,core:streams:true,extra:errors:true,extra:streams:false',
    );
    assert.deepStrictEqual(result.coverage, [
      { source: 'extra streams', complete: false, reason: 'unavailable', detail: 'AccessDenied' },
    ]);
    assert.deepStrictEqual(step.accountSelections(), [DIAGNOSTICS.accounts]);
    assert.deepStrictEqual(step.requiredServices(), ['cloudWatchLogs', 'awsAccounts']);
  });

  it('fails with the error of the first read when no read answers', async () => {
    const result = await new QueryJobDiagnosticsStep().execute(
      await context((account, query) => {
        throw new Error(`${account} ${query} denied`);
      }),
    );
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /core errors-query denied/u);
  });

  it('rejects the occurrence before any read', async () => {
    const reads: string[] = [];
    const step = new QueryJobDiagnosticsStep();
    step.rejectOccurrence = true;
    const result = await step.execute(
      await context((account, query) => {
        reads.push(`${account} ${query}`);
        return [];
      }),
    );
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /unsupported occurrence/u);
    assert.deepStrictEqual(reads, []);
  });
});
