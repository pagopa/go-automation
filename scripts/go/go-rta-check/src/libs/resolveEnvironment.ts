import type { Core } from '@go-automation/go-common';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import type { EnvironmentDto } from '../types/WatchtowerDtos.js';
import type { WatchtowerClient } from '../watchtower/WatchtowerClient.js';

/** Resolved environment filter (no id = all environments). */
export interface ResolvedEnvironment {
  readonly environmentId?: string;
  /** Display label: the environment name, or "tutti gli ambienti". */
  readonly environmentName: string;
}

const ALL_ENVIRONMENTS = 'tutti gli ambienti';

function nameOf(environments: ReadonlyArray<EnvironmentDto>, environmentId: string): string {
  return environments.find((environment) => environment.id === environmentId)?.name ?? environmentId;
}

/**
 * Resolves the environment filter: from `--environment-id`, or interactively
 * (with a "Tutti gli ambienti" option) when `allowPrompt`, otherwise defaults to
 * all environments. Never fails — no environment means no filter (current behavior).
 *
 * @param script - GOScript (for the prompt)
 * @param client - Watchtower client
 * @param productId - The product whose environments to list
 * @param config - The run configuration
 * @param allowPrompt - Whether to prompt when no environment id is provided
 * @returns The resolved environment (id optional)
 */
export async function resolveEnvironment(
  script: Core.GOScript,
  client: WatchtowerClient,
  productId: string,
  config: GoRtaCheckConfig,
  allowPrompt: boolean,
): Promise<ResolvedEnvironment> {
  if (config.environmentId !== undefined && config.environmentId !== '') {
    const environments = await client.listProductEnvironments(productId);
    return { environmentId: config.environmentId, environmentName: nameOf(environments, config.environmentId) };
  }
  if (!allowPrompt) {
    return { environmentName: ALL_ENVIRONMENTS };
  }

  const environments = await client.listProductEnvironments(productId);
  if (environments.length === 0) {
    return { environmentName: ALL_ENVIRONMENTS };
  }
  const choice = await script.prompt.select<string>("Seleziona l'ambiente", [
    { title: 'Tutti gli ambienti', value: '' },
    ...environments.map((environment) => ({ title: environment.name, value: environment.id })),
  ]);
  if (choice === undefined || choice === '') {
    return { environmentName: ALL_ENVIRONMENTS };
  }
  return { environmentId: choice, environmentName: nameOf(environments, choice) };
}
