import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { type AWSAccountDirectoryEntry, parseAwsAccountDirectory } from '@pagopa/go-aws/profiles';

import type { AwsAccountSelection } from '../../../common/accounts/AwsAccountSelection.js';
import { selectAwsAccounts } from '../../../common/accounts/selectAwsAccounts.js';
import type { AwsAccountsPort } from '../../../common/services/ports/AwsAccountsPort.js';
import type { AwsExecutionEnvironment } from '../../../common/telemetry/AwsExecutionEnvironment.js';
import { InMemoryAwsAccountsPort } from '../../../common/testing/InMemoryAwsAccountsPort.js';
import type { InMemoryAwsAccountsPortOptions } from '../../../common/testing/InMemoryAwsAccountsPortOptions.js';

/** Synthetic account ids of the SEND test directory; `unrelated` is in no entry. */
export const SEND_ACCOUNT_IDS = {
  coreProd: '000000000101',
  confinfoProd: '000000000102',
  coreUat: '000000000201',
  confinfoUat: '000000000202',
  unrelated: '000000000999',
} as const;

/** Region of every SEND test execution. */
export const SEND_REGION = 'eu-south-1';

/** Synthetic SEND account directory: core and confinfo in prod and uat. */
const SEND_DIRECTORY: ReadonlyArray<AWSAccountDirectoryEntry> = parseAwsAccountDirectory([
  `send/core/prod=${SEND_ACCOUNT_IDS.coreProd}`,
  `send/confinfo/prod=${SEND_ACCOUNT_IDS.confinfoProd}`,
  `send/core/uat=${SEND_ACCOUNT_IDS.coreUat}`,
  `send/confinfo/uat=${SEND_ACCOUNT_IDS.confinfoUat}`,
]);

/** Execution environment of a local engine run in the SEND test region. */
export const SEND_TEST_ENVIRONMENT: AwsExecutionEnvironment = {
  invokedBy: 'manual',
  awsProfiles: [],
  region: SEND_REGION,
};

/**
 * In-memory account port over {@link SEND_DIRECTORY}.
 *
 * @param options - Occurrence or environment, readers and unreachable accounts
 * @returns The port
 */
export function sendAccountsPort(options: Partial<InMemoryAwsAccountsPortOptions> = {}): InMemoryAwsAccountsPort {
  return new InMemoryAwsAccountsPort({ directory: SEND_DIRECTORY, region: SEND_REGION, ...options });
}

/**
 * Occurrence option of {@link sendAccountsPort} for an account of the directory.
 *
 * @param accountId - Account of the occurrence
 * @param region - Region of the occurrence
 * @returns The occurrence option
 */
export function occurrenceIn(
  accountId: string,
  region: string = SEND_REGION,
): Pick<InMemoryAwsAccountsPortOptions, 'occurrence'> {
  return { occurrence: { accountId, region } };
}

/**
 * Fake CloudWatch Logs reader from a stub implementing `queryWithStatistics` or `query`.
 * Unlike `createTestServiceRegistry`, it derives no missing method, so a stub without
 * `queryWithStatistics` behaves like a reader that reports no statistics.
 *
 * @param stub - Query methods the subject calls
 * @returns The stub, typed as a reader
 */
export function fakeReader(stub: object): AWSCloudWatchLogsQueryService {
  // Safe: the steps under test only call `queryWithStatistics` (optional) or `query`.
  return stub as AWSCloudWatchLogsQueryService;
}

/**
 * Prepares the readers of the accounts the selections read, as the pre-execution
 * check does, for tests that call `step.execute` directly.
 *
 * @param port - Account port of the execution
 * @param selections - Selections of the step under test
 */
export async function prepareSelections(
  port: AwsAccountsPort,
  selections: ReadonlyArray<AwsAccountSelection>,
): Promise<void> {
  await port.prepare(
    selections.flatMap((selection) => selectAwsAccounts(port, selection).map((resolved) => resolved.account)),
  );
}
