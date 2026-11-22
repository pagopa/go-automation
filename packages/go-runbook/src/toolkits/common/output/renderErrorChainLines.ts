import type { ErrorChainGroup } from './ErrorChainGroup.js';
import { ERROR_CHAIN_INTERRUPTION_WORDS } from './tree/ERROR_CHAIN_INTERRUPTION_WORDS.js';

/**
 * One line per chain group, in the order of the groups (already the time order):
 * `10:01 A → B (3 volte, fino alle 10:07)`.
 *
 * - The time is the first time of the group, in UTC; a group without time has none.
 * - Each node shows its cases and its label, or `?` with its label and target when no case recognizes it.
 * - A group of more than one chain shows its count and, when known, its last time.
 * - An interrupted chain ends with where and why it stopped.
 *
 * Complexity: O(G·N) over the groups and their nodes.
 *
 * @param groups - Chain groups of the execution
 * @returns The lines, empty when there is no chain
 *
 * @example
 * ```typescript
 * renderErrorChainLines(output.chains);
 * // ['10:01 Timeout Lambda authorizer (3 volte, fino alle 10:07)']
 * ```
 */
export function renderErrorChainLines(groups: ReadonlyArray<ErrorChainGroup>): ReadonlyArray<string> {
  return groups.map((group) => {
    const time = group.firstSeenAt === undefined ? '' : `${clock(group.firstSeenAt)} `;
    // One route for the whole group is shown inline; several routes are listed with their counts.
    const routed = group.routes.reduce((sum, route) => sum + route.count, 0);
    const via = group.routes.length === 1 && routed === group.count ? (group.routes[0]?.via ?? []) : [];
    const chain = group.nodes
      .map((node, index) => {
        const label = printable(node.label);
        const text =
          node.status !== 'recognized'
            ? `? (${label} in ${node.target})`
            : node.description === undefined
              ? label
              : `${printable(node.description)}: ${label}`;
        // The services traversed without errors before this node.
        const passed = index === 0 ? [] : (via[index - 1] ?? []);
        return passed.length === 0 ? text : `(via ${passed.join(', ')}) → ${text}`;
      })
      .join(' → ');
    const interruption = group.interruptions
      .map((entry) => `${entry.target ?? 'livello successivo'}: ${ERROR_CHAIN_INTERRUPTION_WORDS[entry.reason]}`)
      .join(', ');
    const repeated =
      group.count > 1
        ? ` (${String(group.count)} volte${group.lastSeenAt === undefined ? '' : `, fino alle ${clock(group.lastSeenAt)}`})`
        : '';
    return `${time}${chain}${interruption === '' ? '' : ` → (${interruption})`}${repeated}${routesSuffix(group, routed, via.length > 0)}`;
  });
}

/** The `HH:MM` of an instant. */
function clock(instant: string): string {
  return instant.slice(11, 16);
}

/** A text from the logs as one printable line: a line break or a terminal sequence never alters the line. */
function printable(text: string): string {
  let line = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    line += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : character;
  }
  return line;
}

/** The routes of a group with more than one way, with their counts: `[via pn-external-registries: 2, diretta: 1]`. */
function routesSuffix(group: ErrorChainGroup, routed: number, inline: boolean): string {
  if (inline || group.routes.length === 0) return '';
  const ways = group.routes.map((route) => `via ${route.via.flat().join(', ')}: ${String(route.count)}`);
  if (routed < group.count) ways.push(`diretta: ${String(group.count - routed)}`);
  return ` [${ways.join('; ')}]`;
}
