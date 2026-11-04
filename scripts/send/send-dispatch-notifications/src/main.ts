/**
 * SEND Dispatch Notifications - Main Logic Module
 *
 * Unified sending of SEND notifications (EVO-SENDNOTIF-OPUS-01): throttled
 * send through the B2B API, optional verification, durable journal with
 * resume, output 1:1 with the input.
 */

import type { Core } from '@go-automation/go-common';
import { Dispatch } from '@go-automation/go-send';

import type { DispatchShutdown } from './libs/DispatchShutdown.js';
import { DispatchUsageError } from './libs/DispatchUsageError.js';
import { listEnvironments } from './libs/listEnvironments.js';
import { createEnvironmentLoader, resolveEnvironmentsFile, resolveTarget } from './libs/resolveTarget.js';
import { runDispatch } from './libs/runDispatch.js';
import { validateConfig } from './libs/validateConfig.js';
import type { SendDispatchNotificationsConfig } from './types/SendDispatchNotificationsConfig.js';

/**
 * Main script execution function.
 *
 * Usage errors (parameters, resume with different settings, environments)
 * and errors that stop the run before sending (`DispatchError`: input
 * changed, preflight, configuration) are logged without a stack trace and
 * exit with code 1.
 *
 * @param script - The GOScript instance for logging and prompts
 * @param shutdown - Graceful-stop coordinator, wired to the GOScript cleanup hook
 */
export async function main(script: Core.GOScript, shutdown: DispatchShutdown): Promise<void> {
  const raw = await script.getConfiguration<SendDispatchNotificationsConfig>();
  const loader = createEnvironmentLoader(script);
  try {
    if (raw.listEnvs) {
      const filePath = resolveEnvironmentsFile(script, raw);
      if (filePath === undefined) {
        throw new DispatchUsageError('No environments file found (see configs/environments.example.yaml)');
      }
      await listEnvironments(script.logger, loader, filePath);
      return;
    }
    const config = validateConfig(raw);
    const target = await resolveTarget(script, config, loader);
    process.exitCode = await runDispatch(script, config, target, shutdown);
  } catch (error: unknown) {
    if (error instanceof DispatchUsageError) {
      script.logger.error(error.message);
    } else if (error instanceof Dispatch.DispatchError) {
      script.logger.error(`Run fermato: ${error.code} — ${error.message}`);
    } else {
      throw error;
    }
    process.exitCode = 1;
  }
}
