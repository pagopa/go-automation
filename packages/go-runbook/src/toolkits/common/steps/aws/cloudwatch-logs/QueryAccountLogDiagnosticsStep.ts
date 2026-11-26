import { executeStep } from '../../../../../engine/index.js';
import type { Step, StepKind, StepResult } from '../../../../../engine/index.js';
import type { AccountScopedContext } from '../../../accounts/AccountScopedContext.js';
import { accountScopedContexts } from '../../../accounts/accountScopedContexts.js';
import type { AwsAccountSelection } from '../../../accounts/AwsAccountSelection.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';
import { ALARM_TIME_RANGE } from '../../../time/ALARM_TIME_RANGE.js';
import { resolveTimeRange } from '../../../time/resolveTimeRange.js';
import { OperationalStep } from '../../OperationalStep.js';
import type { AccountLogDiagnostics } from './AccountLogDiagnostics.js';
import type { AccountLogRead } from './AccountLogRead.js';
import { tryCloudWatchLogsRead } from './tryCloudWatchLogsRead.js';
import type { CloudWatchLogsRows } from './CloudWatchLogsRows.js';

/**
 * Base of the steps that collect the logs of a log group in the logical accounts of a selection: every query in every
 * account, in the time range of the alarm, each read on its own. A failed read leaves its `unavailable` coverage and
 * the others keep their rows; when no read answers, the step fails with the error of the first one. The subclass
 * declares what it reads in {@link diagnostics}, on the prototype so the definition digest never sees it, and turns
 * the reads into its result in {@link summarize}.
 *
 * @example
 * ```typescript
 * export class QueryJobDiagnosticsStep extends QueryAccountLogDiagnosticsStep {
 *   readonly id = 'query-job-diagnostics';
 *   readonly label = 'Log del job';
 *   protected diagnostics(): AccountLogDiagnostics {
 *     return JOB_DIAGNOSTICS;
 *   }
 *   // readSource, summarize …
 * }
 * ```
 */
export abstract class QueryAccountLogDiagnosticsStep
  extends OperationalStep<CloudWatchLogsRows>
  implements Step<CloudWatchLogsRows>
{
  abstract readonly id: string;
  abstract readonly label: string;
  readonly kind: StepKind = 'data';

  /**
   * Operational services this step uses.
   *
   * @returns The required service names
   */
  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs', 'awsAccounts'];
  }

  /**
   * The logical accounts the step reads.
   *
   * @returns The account selection of the diagnosis
   */
  override accountSelections(): ReadonlyArray<AwsAccountSelection> {
    return [this.diagnostics().accounts];
  }

  /**
   * Reads every query in every account of the selection and summarizes the reads.
   *
   * @param context - Operational context
   * @returns The result of {@link summarize}
   */
  override async execute(context: OperationalContext): Promise<StepResult<CloudWatchLogsRows>> {
    const diagnostics = this.diagnostics();
    return executeStep(context, diagnostics.narrative, async () => {
      this.checkOccurrence(context);
      const timeRange = resolveTimeRange(context, ALARM_TIME_RANGE);
      const reads: AccountLogRead[] = [];
      for (const account of accountScopedContexts(context, diagnostics.accounts)) {
        for (const { kind, query } of diagnostics.queries) {
          const read = await tryCloudWatchLogsRead(account.context, {
            logGroups: [diagnostics.logGroup],
            query,
            timeRange,
            options: { paginateResults: true },
            source: this.readSource(account, kind),
          });
          reads.push({ account, queryKind: kind, read });
        }
      }
      if (!reads.some(({ read }) => read.failure === undefined)) {
        throw reads[0]?.read.failure ?? new Error(`${diagnostics.narrative}: no account to read`);
      }
      return this.summarize(context, reads);
    });
  }

  /**
   * Rejects an occurrence the step cannot diagnose, before any read; nothing by default.
   *
   * @param _context - Operational context
   */
  protected checkOccurrence(_context: OperationalContext): void {}

  /** What the step reads. */
  protected abstract diagnostics(): AccountLogDiagnostics;

  /** The source that names the coverage of a failed read. */
  protected abstract readSource(account: AccountScopedContext, queryKind: string): string;

  /** The result of the step from its reads, at least one of which answered. */
  protected abstract summarize(
    context: OperationalContext,
    reads: ReadonlyArray<AccountLogRead>,
  ): StepResult<CloudWatchLogsRows>;
}
