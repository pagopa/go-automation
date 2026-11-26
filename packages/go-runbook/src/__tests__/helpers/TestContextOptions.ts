import type { CoverageEntry } from '../../engine/types/CoverageEntry.js';
import type { ErrorRecoveryInfo } from '../../engine/types/ErrorRecoveryInfo.js';
import type { TestServiceOverrides } from '../../toolkits/common/testing/TestServiceOverrides.js';

/** Content of a context built by `createTestContext`; every part defaults to empty. */
export interface TestContextOptions {
  /** Runbook parameters. */
  readonly params?: Readonly<Record<string, string>>;
  /** Context variables. */
  readonly vars?: Readonly<Record<string, string>>;
  /** Outputs of the steps already executed, keyed by step id. */
  readonly stepResults?: Readonly<Record<string, unknown>>;
  /** Stub services, completed by `createTestServiceRegistry`. */
  readonly services?: TestServiceOverrides;
  /** Errors recovered by the steps already executed. */
  readonly recoveredErrors?: ReadonlyArray<ErrorRecoveryInfo>;
  /** Abort signal of the execution. */
  readonly signal?: AbortSignal;
  readonly gaps?: ReadonlyArray<CoverageEntry>;
}
