import { readRowField } from '@go-automation/go-common/aws';
import type { ResultField } from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepResult } from '../../../types/StepResult.js';
import { readStepOutput } from '../../../steps/data/readStepOutput.js';
import { extractLambdaRequestId } from '../../../lambda/helpers/extractLambdaRequestId.js';
import { parseLambdaReportLine } from '../../../lambda/helpers/parseLambdaReportLine.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;

/** Verifies recovery independently for every source account and failed Lambda request. */
export class AnalyzeS3RecoveryStep implements Step<void> {
  readonly id = 'analyze-s3-recovery';
  readonly label = 'Verifica recupero SlowDown S3 per account e request ID';
  readonly kind = 'transform' as const;

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    const errors = readStepOutput<Rows>(context, 'query-lambda-errors');
    if (!errors.ok) return errors.failure;
    const invocations = readStepOutput<Rows>(context, 'query-lambda-invocation');
    const requests = new Set<string>();
    const accounts = new Set<string>();
    let complete = context.vars.get('downstreamMonitoringAccountsChecked') === 'core,confinfo' && invocations.ok;
    for (const row of errors.value) {
      const account = readRowField(row, 'sourceAccount');
      if (account !== undefined) accounts.add(account);
      const key = requestKey(row);
      if (key === undefined || !isS3SlowDown(readRowField(row, '@message') ?? '')) {
        // Another failure, missing correlation or a partial error cannot be closed as a recovered SlowDown.
        complete = false;
      } else {
        requests.add(key);
      }
    }
    let recovered = 0;
    if (invocations.ok) {
      for (const key of requests) {
        if (requestRecovered(invocations.value.filter((row) => requestKey(row) === key))) recovered += 1;
      }
    }
    return {
      success: true,
      vars: {
        downstreamMonitoringErrorAccounts: [...accounts].join(','),
        downstreamMonitoringS3RequestCount: String(requests.size),
        downstreamMonitoringS3RecoveredRequestCount: String(recovered),
        downstreamMonitoringS3Recovery:
          complete && requests.size > 0 && recovered === requests.size ? 'RECOVERED_ALL' : 'UNCONFIRMED',
      },
    };
  }
}

function requestKey(row: ReadonlyArray<ResultField>): string | undefined {
  const account = readRowField(row, 'sourceAccount');
  const requestId =
    (readRowField(row, '@requestId') ?? '').trim() || extractLambdaRequestId(readRowField(row, '@message') ?? '');
  if ((account !== 'core' && account !== 'confinfo') || requestId === undefined || requestId === '') return undefined;
  return `${account}:${requestId}`;
}

function isS3SlowDown(message: string): boolean {
  const marker = /\bInvoke Error\b/.exec(message)?.index;
  if (marker === undefined) return false;
  const start = message.indexOf('{', marker);
  if (start < 0) return false;
  try {
    const error: unknown = JSON.parse(message.slice(start));
    if (typeof error !== 'object' || error === null) return false;
    const value = error as Record<string, unknown>;
    const metadata = value['$metadata'];
    return (
      value['errorType'] === 'SlowDown' &&
      value['errorMessage'] === 'Please reduce your request rate.' &&
      typeof metadata === 'object' &&
      metadata !== null &&
      (metadata as Record<string, unknown>)['httpStatusCode'] === 503 &&
      Array.isArray(value['stack']) &&
      value['stack'].some(
        (line: unknown) => typeof line === 'string' && /S3RestXmlProtocol\b|middleware-sdk-s3\//.test(line),
      )
    );
  } catch {
    return false;
  }
}

function requestRecovered(rows: Rows): boolean {
  if (rows.some((row) => (readRowField(row, '@timestamp') ?? '').trim() === '')) return false;
  const ordered = [...rows].sort((a, b) =>
    (readRowField(a, '@timestamp') ?? '').localeCompare(readRowField(b, '@timestamp') ?? ''),
  );
  let batchSize: number | undefined;
  let failedBatchSize: number | undefined;
  let sawFailure = false;
  let written = false;
  let completed = false;
  for (const row of ordered) {
    const message = (readRowField(row, '@message') ?? '').trim();
    if (/^START RequestId:/.test(message)) {
      batchSize = undefined;
      written = false;
      completed = false;
    }
    const processing = /Processing log group:[^\n]*, events:\s*(\d+)\b/.exec(message);
    if (processing?.[1] !== undefined) batchSize = Number(processing[1]);
    if (isS3SlowDown(message)) {
      sawFailure = true;
      failedBatchSize ??= batchSize;
      written = false;
      completed = false;
    }
    const success = /(?:^|\tINFO\t)Written (\d+) record\(s\) to s3:\/\/\S+/.exec(message);
    if (sawFailure && failedBatchSize !== undefined && failedBatchSize > 0 && success?.[1] !== undefined) {
      written = Number(success[1]) === failedBatchSize && batchSize === failedBatchSize;
      completed = false;
    }
    if (written) {
      const report = parseLambdaReportLine(message);
      if (
        report?.durationMs !== undefined &&
        report.requestId === (readRowField(row, '@requestId') ?? extractLambdaRequestId(message)) &&
        (report.status === undefined || report.status.toLowerCase() === 'success')
      ) {
        completed = true;
      } else if (report !== undefined) {
        written = false;
        completed = false;
      }
    }
  }
  return completed;
}
