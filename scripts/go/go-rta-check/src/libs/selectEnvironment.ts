/**
 * Environment step of the interactive selection.
 *
 * Environments belong to a product, so the options always come from the product
 * selected in the previous step, narrowed by the configured scope. That scope is
 * an operational boundary: `--environment-id` is validated against it and
 * against the product, never taken on trust.
 */
import type { Core } from '@go-automation/go-common';
import type { EnvironmentDto, WatchtowerClient } from '@go-automation/go-watchtower-client';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import type { ResolvedEnvironment } from '../types/ResolvedEnvironment.js';
import type { ScopeTarget } from '../types/ScopeTarget.js';
import type { WizardStep } from '../types/WizardStep.js';
import { scopedEnvironmentIds } from './parseScopeTargets.js';
import { BACK_CHOICE, promptChoice } from './promptChoice.js';
import type { SelectedProduct } from './selectProduct.js';

/** Label used when no environment filter is applied. */
export const ALL_ENVIRONMENTS = 'tutti gli ambienti';

/** Reserved value of the "every environment" entry. */
const ALL_CHOICE = '\u0000all';

/** The read surface of the Watchtower client used here. */
export type EnvironmentReader = Pick<WatchtowerClient, 'listProductEnvironments'>;

export interface SelectEnvironmentOptions {
  readonly script: Core.GOScript;
  readonly client: EnvironmentReader;
  readonly product: SelectedProduct;
  readonly scope: ReadonlyArray<ScopeTarget>;
  readonly config: GoRtaCheckConfig;
  /** Whether the wizard may ask; when false the environment defaults to all in scope. */
  readonly allowPrompt: boolean;
  /** Whether a previous interactive step exists to go back to. */
  readonly canGoBack: boolean;
}

/**
 * Resolves the environment filter: pinned by `--environment-id` (validated
 * against the product and the scope), implied when the scope leaves a single
 * environment, otherwise chosen from the scoped environments (with an "every
 * environment" entry).
 *
 * A restricted scope whose ids are all unknown aborts instead of falling back to
 * "every environment": an invalid scope must never widen the run.
 *
 * Without prompts the omitted `--environment-id` keeps its documented meaning —
 * every environment, narrowed to the scoped ones when the scope restricts them.
 *
 * @param options - Step dependencies and configuration
 * @returns The resolved environment, a back request, or an abort
 */
export async function selectEnvironment(options: SelectEnvironmentOptions): Promise<WizardStep<ResolvedEnvironment>> {
  const { script, config, product } = options;
  const environments = await options.client.listProductEnvironments(product.productId);

  const allowed = scopedEnvironmentIds(options.scope, product.productId);
  const available = availableEnvironments(script.logger, environments, allowed);

  if (config.environmentId !== undefined && config.environmentId !== '') {
    return pinnedEnvironment(script.logger, product, environments, available, config.environmentId);
  }

  if (available.length === 0) {
    if (allowed !== undefined) {
      script.logger.error(
        `Nessun ambiente valido per ${product.productName}: gli id configurati in targets non esistono nel prodotto. ` +
          'Correggi targets invece di eseguire su ambienti fuori scope.',
      );
      return { kind: 'ABORT' };
    }
    return value({ environmentName: ALL_ENVIRONMENTS }, false);
  }
  const single = available[0];
  if (available.length === 1 && single !== undefined) {
    script.logger.info(`Ambiente: ${single.name}`);
    return value({ environmentIds: [single.id], environmentName: single.name }, false);
  }
  if (!options.allowPrompt) {
    const every = everyEnvironment(available, allowed);
    script.logger.info(`Ambiente: ${every.environmentName} (nessun --environment-id, modalità non interattiva)`);
    return value(every, false);
  }

  const choice = await promptChoice<string>(script, `Seleziona l'ambiente (${product.productName})`, [
    ...available.map((environment) => ({ title: environment.name, value: environment.id })),
    { title: `Tutti gli ambienti (${String(available.length)})`, value: ALL_CHOICE },
    ...(options.canGoBack ? [{ title: '← Indietro: cambia prodotto', value: BACK_CHOICE }] : []),
  ]);

  if (choice === BACK_CHOICE) return { kind: 'BACK' };
  if (choice === undefined) return { kind: 'ABORT' };
  if (choice === ALL_CHOICE) return value(everyEnvironment(available, allowed), true);

  const selected = available.find((environment) => environment.id === choice);
  if (selected === undefined) return { kind: 'ABORT' };
  return value({ environmentIds: [selected.id], environmentName: selected.name }, true);
}

/**
 * Validates `--environment-id`: it must belong to the product *and* stay inside
 * the configured scope. An id that only looks plausible would silently produce
 * zero occurrences, so it is rejected instead.
 */
function pinnedEnvironment(
  logger: Core.GOLogger,
  product: SelectedProduct,
  environments: ReadonlyArray<EnvironmentDto>,
  available: ReadonlyArray<EnvironmentDto>,
  environmentId: string,
): WizardStep<ResolvedEnvironment> {
  const selected = available.find((environment) => environment.id === environmentId);
  if (selected !== undefined) {
    return value({ environmentIds: [selected.id], environmentName: selected.name }, false);
  }
  logger.error(
    environments.some((environment) => environment.id === environmentId)
      ? `Ambiente "${environmentId}" fuori dallo scope configurato (targets) per ${product.productName}: aggiungilo a targets, oppure passa --targets per ridefinire il confine.`
      : `Ambiente "${environmentId}" non appartiene al prodotto ${product.productName}.`,
  );
  return { kind: 'ABORT' };
}

/** Environments of the product allowed by the scope, ordered as Watchtower orders them. */
function availableEnvironments(
  logger: Core.GOLogger,
  environments: ReadonlyArray<EnvironmentDto>,
  allowed: ReadonlyArray<string> | undefined,
): ReadonlyArray<EnvironmentDto> {
  const scoped =
    allowed === undefined ? [...environments] : environments.filter((environment) => allowed.includes(environment.id));
  if (allowed !== undefined) {
    for (const environmentId of allowed) {
      if (environments.some((environment) => environment.id === environmentId)) continue;
      logger.warning(`Ambiente "${environmentId}" configurato in targets ma non presente nel prodotto: ignorato.`);
    }
  }
  return scoped.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

/**
 * "Every environment" means no filter when the scope is open, and the scoped ids
 * when the configuration restricts them.
 */
function everyEnvironment(
  available: ReadonlyArray<EnvironmentDto>,
  allowed: ReadonlyArray<string> | undefined,
): ResolvedEnvironment {
  if (allowed === undefined) return { environmentName: ALL_ENVIRONMENTS };
  return {
    environmentIds: available.map((environment) => environment.id),
    environmentName: `${ALL_ENVIRONMENTS} in scope (${available.map((environment) => environment.name).join(', ')})`,
  };
}

function value(environment: ResolvedEnvironment, interactive: boolean): WizardStep<ResolvedEnvironment> {
  return { kind: 'VALUE', value: environment, interactive };
}
