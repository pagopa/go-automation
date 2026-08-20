import type { Core } from '@go-automation/go-common';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';

/** Lazily prompts for a value when not supplied via config. */
type PromptFn = () => Promise<string | undefined>;

/** Resolved analysis period (firedAt range). */
export interface ResolvedPeriod {
  readonly dateFrom: string;
  readonly dateTo: string;
}

/** Returns the config value, or the prompted value, trimmed (empty when absent). */
export async function resolveInput(value: string | undefined, prompt: PromptFn): Promise<string> {
  return (value ?? (await prompt()) ?? '').trim();
}

/**
 * Resolves the analysis period from config, prompting only when allowed.
 *
 * Without prompts a missing bound keeps its documented meaning — no limit —
 * instead of hanging on a question nobody can answer.
 *
 * @param script - GOScript (prompt)
 * @param config - Validated script configuration
 * @param allowPrompt - Whether the missing bounds may be asked for
 * @returns The resolved period (empty string = unbounded)
 */
export async function resolvePeriod(
  script: Core.GOScript,
  config: GoRtaCheckConfig,
  allowPrompt: boolean,
): Promise<ResolvedPeriod> {
  const dateFrom = await resolveInput(config.dateFrom, async () =>
    allowPrompt ? await script.prompt.text('Data inizio (ISO 8601, vuoto = nessun limite)') : undefined,
  );
  const dateTo = await resolveInput(config.dateTo, async () =>
    allowPrompt ? await script.prompt.text('Data fine (ISO 8601, vuoto = nessun limite)') : undefined,
  );
  return { dateFrom, dateTo };
}

/**
 * Confirms the run, auto-confirming whenever prompts are not allowed: an
 * unattended invocation already stated its intent through the flags.
 *
 * @param script - GOScript (prompt)
 * @param count - Occurrences that would be processed
 * @param allowPrompt - Whether the confirmation may be asked for
 * @returns `true` when the run is confirmed
 */
export async function confirmRun(script: Core.GOScript, count: number, allowPrompt: boolean): Promise<boolean> {
  if (!allowPrompt) return true;
  return (await script.prompt.confirm(`Eseguo il runbook su ${count} occorrenze?`)) ?? false;
}
