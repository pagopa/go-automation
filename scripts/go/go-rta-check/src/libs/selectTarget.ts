/**
 * Interactive selection of what to test: product → environment → runbook.
 *
 * The three steps form a wizard the user can walk backwards: every step that
 * actually asked something is a valid "back" destination, while steps pinned by
 * configuration (`--product-id`, `--environment-id`, `--alarm-name`) or implied
 * by the scope are resolved silently and skipped on the way back.
 *
 * Watchtower reads are memoized for the whole wizard, so navigating back and
 * forth never repeats a request. The memoization lives in a session the caller
 * may keep across runs, which is what makes a second run of the wizard — the
 * "analizza un altro runbook" loop — start instantly.
 *
 * When prompts are not allowed (see `allowsPrompt`) the wizard never asks: the
 * environment falls back to every environment in scope, while an ambiguous
 * product or runbook aborts with an explicit error instead of hanging.
 */
import type { Core } from '@go-automation/go-common';
import type {
  AlarmDto,
  AlarmEventsQuery,
  EnvironmentDto,
  ProductDto,
  WatchtowerClient,
} from '@go-automation/go-watchtower-client';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import type { ProductAlarm } from '../types/ProductAlarm.js';
import type { ResolvedEnvironment } from '../types/ResolvedEnvironment.js';
import type { WizardStep } from '../types/WizardStep.js';
import { parseScopeTargets } from './parseScopeTargets.js';
import { selectAlarm } from './selectAlarm.js';
import type { AlarmReader } from './selectAlarm.js';
import { selectEnvironment } from './selectEnvironment.js';
import type { EnvironmentReader } from './selectEnvironment.js';
import { selectProduct } from './selectProduct.js';
import type { SelectedProduct } from './selectProduct.js';

/** Everything the analyses mode needs to know before fetching the occurrences. */
export interface SelectedTarget {
  readonly target: ProductAlarm;
  readonly environment: ResolvedEnvironment;
  /** State to hand back to `selectTarget` to pick another runbook of the same product. */
  readonly resume: TargetWizardResume;
}

/**
 * Selection to restart the wizard from, skipping the steps already answered.
 *
 * The `interactive` flags travel with it because they decide where "indietro"
 * leads: a step resolved silently (single candidate, pinned by flag) is not a
 * destination the user could act on.
 */
export interface TargetWizardResume {
  readonly product: SelectedProduct;
  readonly productInteractive: boolean;
  readonly environment: ResolvedEnvironment;
  readonly environmentInteractive: boolean;
}

/** Watchtower reads memoized across every run of the wizard. */
export interface TargetWizardSession extends AlarmReader, EnvironmentReader {
  listProducts(): Promise<ReadonlyArray<ProductDto>>;
}

/** Optional inputs that turn a fresh wizard into a resumed one. */
export interface SelectTargetOptions {
  /** Memoized reads to reuse; a private session is created when absent. */
  readonly session?: TargetWizardSession;
  /** Product and environment to keep, jumping straight to the runbook step. */
  readonly resume?: TargetWizardResume;
}

/**
 * Outcome of the wizard.
 *
 * The two non-`VALUE` cases are kept apart because they must not be reported
 * the same way: `CANCELLED` is the user's own decision (already announced by the
 * prompt), `FAILED` is an error whose reason the failing step has logged.
 */
export type TargetSelection =
  ({ readonly kind: 'VALUE' } & SelectedTarget) | { readonly kind: 'CANCELLED' } | { readonly kind: 'FAILED' };

type WizardStepName = 'PRODUCT' | 'ENVIRONMENT' | 'ALARM';

/**
 * Runs the selection wizard and returns the product, environment and runbook to
 * test.
 *
 * @param script - GOScript (logger + prompts)
 * @param client - Authenticated Watchtower client
 * @param config - Validated script configuration
 * @param allowPrompt - Whether the wizard may ask (see `allowsPrompt`)
 * @param options - Memoized session and resume point, when the wizard is run again
 * @returns The selection, or why it could not be completed — every stop has
 *   already been logged by the step that caused it
 */
export async function selectTarget(
  script: Core.GOScript,
  client: WatchtowerClient,
  config: GoRtaCheckConfig,
  allowPrompt: boolean,
  options: SelectTargetOptions = {},
): Promise<TargetSelection> {
  const scope = parseScopeTargets(config);
  const reader = options.session ?? createTargetWizardSession(client);
  const resume = options.resume;

  let step: WizardStepName = resume === undefined ? 'PRODUCT' : 'ALARM';
  let product: SelectedProductState | undefined =
    resume === undefined ? undefined : { value: resume.product, interactive: resume.productInteractive };
  let environment: SelectedEnvironmentState | undefined =
    resume === undefined ? undefined : { value: resume.environment, interactive: resume.environmentInteractive };

  for (;;) {
    if (step === 'PRODUCT') {
      const result = await selectProduct(script, await reader.listProducts(), scope, config, allowPrompt);
      if (result.kind !== 'VALUE') return stopped(result);
      product = { value: result.value, interactive: result.interactive };
      step = 'ENVIRONMENT';
      continue;
    }

    if (product === undefined) return { kind: 'FAILED' };

    if (step === 'ENVIRONMENT') {
      const result = await selectEnvironment({
        script,
        client: reader,
        product: product.value,
        scope,
        config,
        allowPrompt,
        canGoBack: product.interactive,
      });
      if (result.kind === 'CANCELLED' || result.kind === 'FAILED') return result;
      if (result.kind === 'BACK') {
        step = 'PRODUCT';
        continue;
      }
      environment = { value: result.value, interactive: result.interactive };
      step = 'ALARM';
      continue;
    }

    if (environment === undefined) return { kind: 'FAILED' };
    const result = await selectAlarm({
      script,
      client: reader,
      product: product.value,
      environment: environment.value,
      config,
      allowPrompt,
      canGoBack: environment.interactive || product.interactive,
    });
    if (result.kind === 'CANCELLED' || result.kind === 'FAILED') return result;
    if (result.kind === 'BACK') {
      step = environment.interactive ? 'ENVIRONMENT' : 'PRODUCT';
      continue;
    }
    return {
      kind: 'VALUE',
      target: result.value,
      environment: environment.value,
      resume: {
        product: product.value,
        productInteractive: product.interactive,
        environment: environment.value,
        environmentInteractive: environment.interactive,
      },
    };
  }
}

/** A first step can only stop the wizard: it has nowhere to go back to. */
function stopped(result: WizardStep<unknown>): TargetSelection {
  return result.kind === 'CANCELLED' ? { kind: 'CANCELLED' } : { kind: 'FAILED' };
}

interface SelectedProductState {
  readonly value: SelectedProduct;
  readonly interactive: boolean;
}

interface SelectedEnvironmentState {
  readonly value: ResolvedEnvironment;
  readonly interactive: boolean;
}

/** Deferred read whose result is memoized by the wizard. */
type LoadFn<T> = () => Promise<T>;

/**
 * Creates the memoized reads shared by the wizard, so neither going back nor
 * running the wizard again ever re-queries Watchtower.
 *
 * @param client - Authenticated Watchtower client
 * @returns A session to pass to `selectTarget` through `options.session`
 *
 * @example
 * ```typescript
 * const session = createTargetWizardSession(client);
 * const first = await selectTarget(script, client, config, true, { session });
 * const second = await selectTarget(script, client, config, true, { session });
 * ```
 */
export function createTargetWizardSession(client: WatchtowerClient): TargetWizardSession {
  const products = new Map<string, Promise<ReadonlyArray<ProductDto>>>();
  const environments = new Map<string, Promise<ReadonlyArray<EnvironmentDto>>>();
  const alarms = new Map<string, Promise<ReadonlyArray<AlarmDto>>>();
  const counts = new Map<string, Promise<number>>();

  return {
    listProducts: async () => await memoize(products, '', async () => await client.listProducts()),
    listProductEnvironments: async (productId: string) =>
      await memoize(environments, productId, async () => await client.listProductEnvironments(productId)),
    listProductAlarms: async (productId: string) =>
      await memoize(alarms, productId, async () => await client.listProductAlarms(productId)),
    countAlarmEvents: async (query: AlarmEventsQuery) =>
      await memoizeSettled(counts, countKey(query), async () => await client.countAlarmEvents(query)),
  };
}

/**
 * Memoizes a read, retrying it after a failure.
 *
 * A failed list read aborts the wizard, so the retry only happens on a fresh
 * attempt, where insisting is the useful behaviour.
 */
async function memoize<T>(cache: Map<string, Promise<T>>, key: string, load: LoadFn<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached !== undefined) return await cached;
  const pending = load();
  cache.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

/**
 * Memoizes a read including its failure.
 *
 * Occurrence counts are optional by design — a failed one simply becomes
 * "conteggio non disponibile" — so retrying them at every back-navigation would
 * only hammer an already broken Watchtower, and would contradict the promise
 * that going back costs nothing.
 */
async function memoizeSettled<T>(cache: Map<string, Promise<T>>, key: string, load: LoadFn<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached !== undefined) return await cached;
  const pending = load();
  cache.set(key, pending);
  return await pending;
}

function countKey(query: AlarmEventsQuery): string {
  const environmentId = query.environmentId;
  const environments = environmentId === undefined ? [] : [environmentId].flat();
  return `${query.alarmId ?? ''}|${[...environments].sort().join(',')}`;
}
