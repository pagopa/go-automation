/**
 * Reads the runbook catalog shipped in this repository.
 *
 * Fully offline: the registry is a static module, so no AWS call, no
 * Watchtower call and no credential is involved.
 */

import { AUTOMATIC_RUNBOOK_REGISTRY, type AutomaticRunbookRegistry } from '@go-automation/go-runbook/catalog';

import type { RunbookCatalogEntry } from '../../types/RunbookCatalogEntry.js';

/** Read surface of the registry used here; keeps the collector testable with a fake. */
export type RunbookCatalogSource = Pick<AutomaticRunbookRegistry, 'listDescriptors' | 'resolveByKey'>;

/**
 * Flattens every registered runbook into a {@link RunbookCatalogEntry}.
 *
 * Each runbook is built once to read its pipeline shape (steps, known cases);
 * builders are pure factories, so this stays a local, side-effect-free read.
 * Complexity: O(R) where R is the number of registered runbooks.
 *
 * @param source - Registry to read; defaults to the shared catalog
 * @returns Catalog entries sorted by runbook key
 *
 * @example
 * ```typescript
 * const entries = collectRunbookCatalogEntries();
 * console.log(entries.length); // number of runbooks in the repository
 * ```
 */
export function collectRunbookCatalogEntries(
  source: RunbookCatalogSource = AUTOMATIC_RUNBOOK_REGISTRY,
): ReadonlyArray<RunbookCatalogEntry> {
  const entries: RunbookCatalogEntry[] = [];

  for (const descriptor of source.listDescriptors()) {
    const resolved = source.resolveByKey(descriptor.key);
    if (resolved === undefined) continue;

    const runbook = resolved.build();
    let annotatedKnownCaseCount = 0;
    for (const knownCase of runbook.knownCases) {
      if (knownCase.analysis !== undefined) annotatedKnownCaseCount += 1;
    }

    entries.push({
      key: descriptor.key,
      name: descriptor.name,
      version: descriptor.version,
      product: resolved.product,
      kind: descriptor.kind,
      categories: descriptor.categories,
      tags: descriptor.tags,
      alarmNames: descriptor.alarmNames,
      stepCount: runbook.steps.length,
      knownCaseCount: runbook.knownCases.length,
      annotatedKnownCaseCount,
    });
  }

  return entries.sort((left, right) => left.key.localeCompare(right.key));
}
