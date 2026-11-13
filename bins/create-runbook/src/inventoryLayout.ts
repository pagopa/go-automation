import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { INVENTORY_DIR } from './constants.js';
import type { RunbookProduct } from './templates/RunbookProduct.js';

/**
 * Families of each product in the go-runbook inventory
 * (`packages/go-runbook/src/inventory/<product>/<family>/<id>/`, EVO-RBREORG-OPUS-01 §7.5).
 * The folder follows the toolkit the runbook is built with.
 */
export const PRODUCT_FAMILIES: Readonly<Record<RunbookProduct, ReadonlyArray<string>>> = {
  SEND: ['apigw', 'lambda', 'downstream', 'service'],
  INTEROP: ['apigw', 'k8s'],
};

/** Comment that opens the block of a family in a product manifest. */
export const FAMILY_LABELS: Readonly<Record<string, string>> = {
  apigw: 'API Gateway',
  lambda: 'Lambda',
  downstream: 'downstream',
  service: 'log applicativi',
  k8s: 'Kubernetes',
};

/**
 * Inventory folder of a product.
 *
 * @param product - Watchtower product
 * @returns Absolute path of `inventory/<product>/`
 */
function productDir(product: RunbookProduct): string {
  return path.join(INVENTORY_DIR, product.toLowerCase());
}

/**
 * Folder of a runbook in the inventory.
 *
 * @param product - Watchtower product
 * @param family - Family (toolkit) of the runbook
 * @param id - Runbook id
 * @returns Absolute path of `inventory/<product>/<family>/<id>/`
 */
export function runbookDir(product: RunbookProduct, family: string, id: string): string {
  return path.join(productDir(product), family, id);
}

/**
 * Manifest file of a product.
 *
 * @param product - Watchtower product
 * @returns Absolute path of `inventory/<product>/manifest.ts`
 */
export function manifestFile(product: RunbookProduct): string {
  return path.join(productDir(product), 'manifest.ts');
}

/**
 * Name of the manifest array of a product.
 *
 * @param product - Watchtower product
 * @returns `SEND_MANIFEST` or `INTEROP_MANIFEST`
 */
export function manifestConstName(product: RunbookProduct): string {
  return `${product}_MANIFEST`;
}

/**
 * Finds an existing runbook folder with the given id in any product and family.
 * Runbook keys are global, so a new id must be unique across the whole inventory.
 *
 * @param id - Runbook id
 * @returns The existing folder, or `undefined` when the id is free
 */
export async function findExistingRunbookDir(id: string): Promise<string | undefined> {
  for (const [product, families] of Object.entries(PRODUCT_FAMILIES)) {
    for (const family of families) {
      const candidate = path.join(INVENTORY_DIR, product.toLowerCase(), family, id);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // not there: keep looking
      }
    }
  }
  return undefined;
}
