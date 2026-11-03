/**
 * SEND Dispatch Notifications - Main Logic Module
 *
 * Unified sending of SEND notifications (EVO-SENDNOTIF-OPUS-01): throttled
 * send through the B2B API, optional verification, durable journal with
 * resume, output 1:1 with the input.
 */

import type { Core } from '@go-automation/go-common';

import type { DispatchShutdown } from './libs/DispatchShutdown.js';
import { listEnvironments } from './libs/listEnvironments.js';
import { createEnvironmentLoader, resolveEnvironmentsFile, resolveTarget } from './libs/resolveTarget.js';
import { assertSupportedConfig } from './libs/createSessionOptions.js';
import { runDispatch } from './libs/runDispatch.js';
import type { SendDispatchNotificationsConfig } from './types/SendDispatchNotificationsConfig.js';

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance for logging and prompts
 * @param shutdown - Graceful-stop coordinator, wired to the GOScript cleanup hook
 */
export async function main(script: Core.GOScript, shutdown: DispatchShutdown): Promise<void> {
  const config = await script.getConfiguration<SendDispatchNotificationsConfig>();
  const loader = createEnvironmentLoader(script);

  if (config.listEnvs) {
    const filePath = resolveEnvironmentsFile(script, config);
    if (filePath === undefined) throw new Error('No environments file found (see configs/environments.example.yaml)');
    await listEnvironments(script.logger, loader, filePath);
    return;
  }

  assertSupportedConfig(config);
  const target = await resolveTarget(script, config, loader);
  process.exitCode = await runDispatch(script, config, target, shutdown);
}
