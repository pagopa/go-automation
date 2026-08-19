/**
 * Product step of the interactive selection.
 *
 * `targets` is an operational boundary, not a mere suggestion for the prompt:
 * `--product-id` is resolved *inside* the scope, so a pinned product outside it
 * fails instead of silently escaping the configured limits.
 */
import type { Core } from '@go-automation/go-common';
import type { ProductDto } from '@go-automation/go-watchtower-client';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import type { ScopeTarget } from '../types/ScopeTarget.js';
import type { WizardStep } from '../types/WizardStep.js';
import { promptChoice } from './promptChoice.js';

/** A product the run can target. */
export interface SelectedProduct {
  readonly productId: string;
  readonly productName: string;
}

/**
 * Resolves the product: pinned by `--product-id` (which must fall inside the
 * configured scope), implied when the scope leaves a single candidate, otherwise
 * chosen from the scoped products by name.
 *
 * @param script - GOScript (logger + prompt)
 * @param products - Products readable on Watchtower
 * @param scope - Configured selection scope (empty = every product)
 * @param config - Validated script configuration
 * @param allowPrompt - Whether the wizard may ask; when false an ambiguous product aborts
 * @returns The selected product, or an abort when nothing can be selected
 */
export async function selectProduct(
  script: Core.GOScript,
  products: ReadonlyArray<ProductDto>,
  scope: ReadonlyArray<ScopeTarget>,
  config: GoRtaCheckConfig,
  allowPrompt: boolean,
): Promise<WizardStep<SelectedProduct>> {
  const logger = script.logger;
  if (products.length === 0) {
    logger.error('Nessun prodotto disponibile in Watchtower.');
    return { kind: 'ABORT' };
  }

  const candidates = scopedProducts(logger, products, scope);
  if (candidates.length === 0) {
    logger.error('Nessun prodotto disponibile: controlla lo scope configurato (targets).');
    return { kind: 'ABORT' };
  }

  if (config.productId !== undefined && config.productId !== '') {
    const pinned = candidates.find((product) => product.id === config.productId);
    if (pinned === undefined) {
      logger.error(
        products.some((product) => product.id === config.productId)
          ? `Prodotto "${config.productId}" fuori dallo scope configurato (targets): aggiungilo a targets, oppure passa --targets per ridefinire il confine.`
          : `Prodotto "${config.productId}" non trovato in Watchtower.`,
      );
      return { kind: 'ABORT' };
    }
    return value({ productId: pinned.id, productName: pinned.name }, false);
  }

  const single = candidates[0];
  if (candidates.length === 1 && single !== undefined) {
    logger.info(`Prodotto: ${single.name}`);
    return value({ productId: single.id, productName: single.name }, false);
  }
  if (!allowPrompt) {
    logger.error(
      `Prodotto ambiguo (${String(candidates.length)} candidati) in modalità non interattiva: passa --product-id o restringi targets.`,
    );
    return { kind: 'ABORT' };
  }

  const productId = await promptChoice<string>(
    script,
    'Seleziona il prodotto',
    candidates.map((product) => ({
      title: product.name,
      value: product.id,
      ...(product.description !== null && product.description !== undefined
        ? { description: product.description }
        : {}),
    })),
  );
  const selected = candidates.find((product) => product.id === productId);
  if (selected === undefined) {
    return { kind: 'ABORT' };
  }
  return value({ productId: selected.id, productName: selected.name }, true);
}

/** Applies the configured scope, keeping its declaration order and reporting unknown ids. */
function scopedProducts(
  logger: Core.GOLogger,
  products: ReadonlyArray<ProductDto>,
  scope: ReadonlyArray<ScopeTarget>,
): ReadonlyArray<ProductDto> {
  if (scope.length === 0) return [...products].sort((left, right) => left.name.localeCompare(right.name));

  const byId = new Map(products.map((product) => [product.id, product] as const));
  const scoped: ProductDto[] = [];
  for (const target of scope) {
    const product = byId.get(target.productId);
    if (product === undefined) {
      logger.warning(`Prodotto "${target.productId}" configurato in targets ma non presente in Watchtower: ignorato.`);
      continue;
    }
    scoped.push(product);
  }
  return scoped;
}

function value(selected: SelectedProduct, interactive: boolean): WizardStep<SelectedProduct> {
  return { kind: 'VALUE', value: selected, interactive };
}
