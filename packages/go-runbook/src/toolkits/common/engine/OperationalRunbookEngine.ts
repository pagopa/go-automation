import type { GOLogger } from '@pagopa/go-common/logging';

import { assertRequiredServices } from '../../../engine/core/assertRequiredServices.js';
import { RunbookEngine } from '../../../engine/core/RunbookEngine.js';
import type { AwsExecutionEnvironment } from '../telemetry/AwsExecutionEnvironment.js';
import type { Runbook } from '../../../engine/types/Runbook.js';
import type { RunbookExecutionResult } from '../../../engine/types/RunbookExecutionResult.js';
import { ANALYSIS_LOG_ACTION_RENDERER } from '../analysis/reporting/ANALYSIS_LOG_ACTION_RENDERER.js';
import { OPERATIONAL_SERVICE_CAPABILITIES } from '../services/OPERATIONAL_SERVICE_CAPABILITIES.js';
import type { ServiceRegistry } from '../services/ServiceRegistry.js';
import { assertAwsAccounts } from './assertAwsAccounts.js';

/**
 * Engine for operational runbooks (EVO-RBREORG-OPUS-01 §7.1.3 A, RBREORG-19).
 *
 * It composes a private {@link RunbookEngine} configured with the operational
 * service capabilities and the analysis renderer of log actions, and requires a full {@link ServiceRegistry} at compile
 * time. The runtime check covers what the types cannot (casts, hand-built
 * objects): every service a step requires must expose the methods it calls.
 */
export class OperationalRunbookEngine {
  private readonly engine: RunbookEngine;

  /**
   * @param logger - Logger of the execution narrative
   */
  constructor(logger: GOLogger) {
    this.engine = new RunbookEngine(logger, {
      serviceCapabilities: OPERATIONAL_SERVICE_CAPABILITIES,
      logActionRenderer: ANALYSIS_LOG_ACTION_RENDERER,
    });
  }

  /**
   * Executes an operational runbook.
   *
   * @param runbook - Runbook definition to execute
   * @param params - Input parameters
   * @param services - Operational services
   * @param environment - Execution environment, with the AWS profiles and region of the execution
   * @param signal - Abort signal
   * @returns The execution result
   * @throws RunbookMissingServicesError before the first step, if a required service is unusable
   * @throws AwsAccountError before the first step, if the execution cannot serve the declared logical accounts
   */
  async execute(
    runbook: Runbook,
    params: ReadonlyMap<string, string>,
    services: ServiceRegistry,
    environment: AwsExecutionEnvironment,
    signal?: AbortSignal,
  ): Promise<RunbookExecutionResult> {
    // Services first, so a missing account port is reported as a missing service.
    assertRequiredServices(runbook, services, OPERATIONAL_SERVICE_CAPABILITIES);
    await assertAwsAccounts(runbook, services);
    return this.engine.execute(runbook, params, services, environment, signal);
  }
}
