/**
 * Interactive selection of what to test: product → environment → runbook.
 *
 * The three steps form a wizard the user can walk backwards: every step that
 * actually asked something is a valid "back" destination, while steps pinned by
 * configuration (`--product-id`, `--environment-id`, `--alarm-name`) or implied
 * by the scope are resolved silently and skipped on the way back.
 *
 * Watchtower reads are memoized for the whole wizard, so navigating back and
 * forth never repeats a request.
 *
 * When prompts are not allowed (see `allowsPrompt`) the wizard never asks: the
 * environment falls back to every environment in scope, while an ambiguous
 * product or runbook aborts with an explicit error instead of hanging.
 */
import type { Core } from '@go-automation/go-common';
import type { AlarmDto, AlarmEventsQuery, EnvironmentDto, WatchtowerClient } from '@go-automation/go-watchtower-client';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import type { ProductAlarm } from '../types/ProductAlarm.js';
import type { ResolvedEnvironment } from '../types/ResolvedEnvironment.js';
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
}

type WizardStepName = 'PRODUCT' | 'ENVIRONMENT' | 'ALARM';

/**
 * Runs the selection wizard and returns the product, environment and runbook to
 * test.
 *
 * @param script - GOScript (logger + prompts)
 * @param client - Authenticated Watchtower client
 * @param config - Validated script configuration
 * @param allowPrompt - Whether the wizard may ask (see `allowsPrompt`)
 * @returns The selection, or `undefined` when the user aborts or nothing is selectable
 */
export async function selectTarget(
  script: Core.GOScript,
  client: WatchtowerClient,
  config: GoRtaCheckConfig,
  allowPrompt: boolean,
): Promise<SelectedTarget | undefined> {
  const scope = parseScopeTargets(config);
  const reader = memoizedReader(client);
  const products = await client.listProducts();

  let step: WizardStepName = 'PRODUCT';
  let product: SelectedProductState | undefined;
  let environment: SelectedEnvironmentState | undefined;

  for (;;) {
    if (step === 'PRODUCT') {
      const result = await selectProduct(script, products, scope, config, allowPrompt);
      if (result.kind !== 'VALUE') return undefined;
      product = { value: result.value, interactive: result.interactive };
      step = 'ENVIRONMENT';
      continue;
    }

    if (product === undefined) return undefined;

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
      if (result.kind === 'ABORT') return undefined;
      if (result.kind === 'BACK') {
        step = 'PRODUCT';
        continue;
      }
      environment = { value: result.value, interactive: result.interactive };
      step = 'ALARM';
      continue;
    }

    if (environment === undefined) return undefined;
    const result = await selectAlarm({
      script,
      client: reader,
      product: product.value,
      environment: environment.value,
      config,
      allowPrompt,
      canGoBack: environment.interactive || product.interactive,
    });
    if (result.kind === 'ABORT') return undefined;
    if (result.kind === 'BACK') {
      step = environment.interactive ? 'ENVIRONMENT' : 'PRODUCT';
      continue;
    }
    return { target: result.value, environment: environment.value };
  }
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

/** Memoizes the reads issued by the wizard so going back never re-queries Watchtower. */
function memoizedReader(client: WatchtowerClient): AlarmReader & EnvironmentReader {
  const environments = new Map<string, Promise<ReadonlyArray<EnvironmentDto>>>();
  const alarms = new Map<string, Promise<ReadonlyArray<AlarmDto>>>();
  const counts = new Map<string, Promise<number>>();

  return {
    listProductEnvironments: async (productId: string) =>
      await memoize(environments, productId, async () => await client.listProductEnvironments(productId)),
    listProductAlarms: async (productId: string) =>
      await memoize(alarms, productId, async () => await client.listProductAlarms(productId)),
    countAlarmEvents: async (query: AlarmEventsQuery) =>
      await memoize(counts, countKey(query), async () => await client.countAlarmEvents(query)),
  };
}

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

function countKey(query: AlarmEventsQuery): string {
  const environmentId = query.environmentId;
  const environments = environmentId === undefined ? [] : [environmentId].flat();
  return `${query.alarmId ?? ''}|${[...environments].sort().join(',')}`;
}
