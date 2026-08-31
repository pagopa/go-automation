import { Core } from '@go-automation/go-common';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import { BACK_SHORTCUT_HINT } from './promptChoice.js';

/** Lazily prompts for a value when not supplied via config. */
type PromptFn = () => Promise<string | undefined>;

/** Question shown above the period presets. */
const PERIOD_MESSAGE = 'Periodo di analisi (su firedAt)';

/** Resolved analysis period (firedAt range). */
interface ResolvedPeriod {
  readonly dateFrom: string;
  readonly dateTo: string;
}

/**
 * Outcome of the period step.
 *
 * `BACK` is kept apart from a resolved period because it is not an answer: the
 * caller has to reopen the runbook selection instead of running anything.
 */
export type PeriodOutcome = ({ readonly kind: 'VALUE' } & ResolvedPeriod) | { readonly kind: 'BACK' };

/**
 * Period presets offered before asking for explicit bounds.
 *
 * Month start is computed in UTC, the time zone every bound of this script is
 * resolved in, so the preset agrees with the dates typed by hand.
 */
const PERIOD_PRESETS: ReadonlyArray<Core.GOPromptDateRangePreset> = [
  { title: 'Ultime 24 ore', from: (now) => shift(now, -24 * 3_600_000), to: (now) => new Date(now.getTime()) },
  { title: 'Ultimi 7 giorni', from: (now) => shift(now, -7 * 86_400_000), to: (now) => new Date(now.getTime()) },
  { title: 'Ultimi 30 giorni', from: (now) => shift(now, -30 * 86_400_000), to: (now) => new Date(now.getTime()) },
  {
    title: 'Mese corrente',
    from: (now) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    to: (now) => new Date(now.getTime()),
  },
  { title: 'Nessun limite' },
  { title: 'Personalizzato…', custom: true },
];

/** Shifts an instant by a signed amount of milliseconds, without mutating it. */
function shift(value: Date, millis: number): Date {
  return new Date(value.getTime() + millis);
}

/** Returns the config value, or the prompted value, trimmed (empty when absent). */
export async function resolveInput(value: string | undefined, prompt: PromptFn): Promise<string> {
  return (value ?? (await prompt()) ?? '').trim();
}

/**
 * Resolves the analysis period from config, prompting only when allowed.
 *
 * With nothing pinned by flags the user picks a preset — the common windows
 * need no typing at all — and only the custom branch asks for the two bounds.
 * A bound given by flag is normalized through the same lenient parser, so
 * `--date-from -7d` and `--date-from 24/08/2026` reach Watchtower as ISO 8601.
 *
 * Without prompts a missing bound keeps its documented meaning — no limit —
 * instead of hanging on a question nobody can answer.
 *
 * @param script - GOScript (prompt)
 * @param config - Validated script configuration
 * @param allowPrompt - Whether the missing bounds may be asked for
 * @param canGoBack - Whether the preset menu may send the user back to the runbook step
 * @returns The resolved period (empty string = unbounded), or `BACK`
 * @throws Error when a bound given by flag cannot be parsed
 */
export async function resolvePeriod(
  script: Core.GOScript,
  config: GoRtaCheckConfig,
  allowPrompt: boolean,
  canGoBack: boolean = false,
): Promise<PeriodOutcome> {
  if (allowPrompt && config.dateFrom === undefined && config.dateTo === undefined) {
    const period = await askPeriod(script, canGoBack);
    if (period === Core.GO_PROMPT_BACK) return { kind: 'BACK' };
    return {
      kind: 'VALUE',
      dateFrom: period?.from?.toISOString() ?? '',
      dateTo: period?.to?.toISOString() ?? '',
    };
  }

  return {
    kind: 'VALUE',
    dateFrom: await resolveBound(script, config.dateFrom, 'start', allowPrompt, 'Data inizio'),
    dateTo: await resolveBound(script, config.dateTo, 'end', allowPrompt, 'Data fine'),
  };
}

/** Asks for the period, offering the way back only where there is one. */
async function askPeriod(
  script: Core.GOScript,
  canGoBack: boolean,
): Promise<Core.GOPromptDateRange | typeof Core.GO_PROMPT_BACK | undefined> {
  if (!canGoBack) return await script.prompt.dateRange(PERIOD_MESSAGE, { presets: PERIOD_PRESETS });

  return await script.prompt.dateRangeWithBack(PERIOD_MESSAGE, {
    presets: PERIOD_PRESETS,
    backLabel: `← Indietro: cambia runbook${BACK_SHORTCUT_HINT}`,
  });
}

/**
 * Resolves one bound: normalized from config, asked for, or left unbounded.
 *
 * @param script - GOScript (prompt)
 * @param value - Bound as given by flag, when present
 * @param boundary - Edge of the day a date without a time resolves to
 * @param allowPrompt - Whether the missing bound may be asked for
 * @param label - Question shown to the user
 * @returns The bound as ISO 8601, or an empty string when unbounded
 * @throws Error when `value` cannot be parsed
 */
async function resolveBound(
  script: Core.GOScript,
  value: string | undefined,
  boundary: Core.GODateBoundary,
  allowPrompt: boolean,
  label: string,
): Promise<string> {
  if (value !== undefined) {
    const trimmed = value.trim();
    if (trimmed === '') return '';

    const parsed = Core.tryParseDateInput(trimmed, { boundary });
    if (parsed === undefined) {
      throw new Error(`${label} non valida: "${trimmed}". Formati accettati: ${Core.describeDateInputFormats()}`);
    }
    return parsed.iso;
  }

  if (!allowPrompt) return '';

  const answer = await script.prompt.date(`${label} (vuoto = nessun limite)`, { boundary, allowEmpty: true });
  return answer?.toISOString() ?? '';
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
