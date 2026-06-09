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

/** Resolves the analysis period from config or interactive prompts. */
export async function resolvePeriod(script: Core.GOScript, config: GoRtaCheckConfig): Promise<ResolvedPeriod> {
  const dateFrom = await resolveInput(config.dateFrom, async () =>
    script.prompt.text('Data inizio (ISO 8601, vuoto = nessun limite)'),
  );
  const dateTo = await resolveInput(config.dateTo, async () =>
    script.prompt.text('Data fine (ISO 8601, vuoto = nessun limite)'),
  );
  return { dateFrom, dateTo };
}

/** Confirms the run; auto-confirms when fully flag-driven (alarm + dateFrom provided). */
export async function confirmRun(script: Core.GOScript, config: GoRtaCheckConfig, count: number): Promise<boolean> {
  if (config.alarmName !== undefined && config.dateFrom !== undefined) return true;
  return (await script.prompt.confirm(`Eseguo il runbook su ${count} occorrenze?`)) ?? false;
}
