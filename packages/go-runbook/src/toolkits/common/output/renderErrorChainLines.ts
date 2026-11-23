import type { TreeNode } from '@pagopa/go-common/render';

import type { ErrorChainSummary } from './ErrorChainSummary.js';
import type { ErrorChainNode } from './ErrorChainNode.js';
import type { ErrorChainTreeOptions } from './ErrorChainTreeOptions.js';
import { ERROR_CHAIN_INTERRUPTION_WORDS } from './tree/ERROR_CHAIN_INTERRUPTION_WORDS.js';

/**
 * One line per chain group, in the order of the groups (already the time order):
 * `10:01 A → B (3 volte, fino alle 10:07)`.
 *
 * - The time is the first time of the group, in UTC; a group without time has none.
 * - Each node shows its cases and its label, or `?` with its label and target when no case recognizes it.
 * - A group of more than one chain shows how many errors it holds (and its paths, when fewer errors than paths) and,
 *   when known, its last time.
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
export function renderErrorChainLines(groups: ReadonlyArray<ErrorChainSummary>): ReadonlyArray<string> {
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
        ? ` (${timesText(group)}${group.lastSeenAt === undefined ? '' : `, fino alle ${clock(group.lastSeenAt)}`})`
        : '';
    return `${time}${chain}${interruption === '' ? '' : ` → (${interruption})`}${repeated}${routesSuffix(group, routed, via.length > 0)}`;
  });
}

/**
 * One branch per chain group, in the order of the groups, for a console tree: the branch shows when and how many
 * times, each node of the chain is a child with its case (`✓`) or `?`, and under it the service and the text of the
 * log. A group of one node shows the node on the branch itself.
 *
 * - The text of a log in JSON is its `message` field.
 * - With `maxDetailLength`, a longer detail line ends with `…`; the whole text stays in the output.
 * - The routes and the interruptions of the group are children after the nodes.
 *
 * Complexity: O(G·N) over the groups and their nodes.
 *
 * @param groups - Chain groups of the execution
 * @param options - Length of the detail lines
 * @returns The branches, empty when there is no chain
 *
 * @example
 * ```typescript
 * logger.tree(renderErrorChainTree(output.chains, { maxDetailLength: 100 }));
 * // ├─ 07:30 → 07:36 · 153 volte
 * // │  ├─ ✓ Timeout di connessione
 * // │  │  └─ pn-national-registries · Service INAD returned errors=connection timed out
 * // │  └─ ? non riconosciuto
 * // │     └─ pn-national-registries-trace · can not retrieve digital address from INAD
 * ```
 */
export function renderErrorChainTree(
  groups: ReadonlyArray<ErrorChainSummary>,
  options: ErrorChainTreeOptions = {},
): ReadonlyArray<TreeNode> {
  return groups.map((group) => {
    const nodes = group.nodes.map((node) => chainNode(node, options.maxDetailLength));
    const routed = group.routes.reduce((sum, route) => sum + route.count, 0);
    const routes = group.routes.length === 0 ? [] : [{ label: `via ${routesText(group, routed)}` }];
    const interruptions = group.interruptions.map((entry) => ({
      label: `⋯ ${entry.target ?? 'livello successivo'}: ${ERROR_CHAIN_INTERRUPTION_WORDS[entry.reason]}`,
    }));
    const time = timeRange(group);
    const only = nodes.length === 1 ? nodes[0] : undefined;
    if (only !== undefined) {
      const repeated = group.count > 1 ? ` (${timesText(group)})` : '';
      return {
        label: `${time === '' ? '' : `${time} `}${only.label}${repeated}`,
        children: [...(only.children ?? []), ...routes, ...interruptions],
      };
    }
    const times = timesText(group);
    return { label: time === '' ? times : `${time} · ${times}`, children: [...nodes, ...routes, ...interruptions] };
  });
}

/**
 * How many errors a group holds: `3 volte`, and the paths too when some error is reached by more than one,
 * `45 volte, 4575 percorsi`.
 */
function timesText(group: ErrorChainSummary): string {
  const times = group.errors === 1 ? '1 volta' : `${String(group.errors)} volte`;
  return group.errors < group.count ? `${times}, ${String(group.count)} percorsi` : times;
}

/** A node of a chain: its case or `?`, and the detail line with the service and the text of the log. */
function chainNode(node: ErrorChainNode, maxDetailLength: number | undefined): TreeNode {
  const recognized = node.status === 'recognized';
  const title = recognized ? `✓ ${printable(node.description ?? node.label)}` : '? non riconosciuto';
  const parts: string[] = node.target === 'window' ? [] : [node.target];
  if (!recognized || node.description !== undefined) parts.push(logText(node.label));
  const detail = parts.join(' · ');
  return detail === '' ? { label: title } : { label: title, children: [{ label: shorten(detail, maxDetailLength) }] };
}

/** `07:30`, or `07:30 → 07:36` for a group seen over more than one minute; empty without time. */
function timeRange(group: ErrorChainSummary): string {
  if (group.firstSeenAt === undefined) return '';
  const first = clock(group.firstSeenAt);
  const last = group.lastSeenAt === undefined ? first : clock(group.lastSeenAt);
  return last === first ? first : `${first} → ${last}`;
}

// The `message` of a JSON log line, also when the line was cut before its end.
const JSON_MESSAGE = /"message"\s*:\s*"((?:[^"\\]|\\.)*)/u;

/** The text of a log as one printable line: the `message` field for a JSON log line. */
function logText(label: string): string {
  const text = printable(label);
  if (!text.trimStart().startsWith('{')) return text;
  const message = JSON_MESSAGE.exec(text)?.[1];
  return message === undefined ? text : message.replace(/\\(.)/gu, '$1');
}

/** The text, ending with `…` when longer than `max` characters. */
function shorten(text: string, max: number | undefined): string {
  if (max === undefined) return text;
  const characters = [...text];
  return characters.length <= max ? text : `${characters.slice(0, Math.max(0, max - 1)).join('')}…`;
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
function routesSuffix(group: ErrorChainSummary, routed: number, inline: boolean): string {
  if (inline || group.routes.length === 0) return '';
  const ways = group.routes.map((route) => `via ${route.via.flat().join(', ')}: ${String(route.count)}`);
  if (routed < group.count) ways.push(`diretta: ${String(group.count - routed)}`);
  return ` [${ways.join('; ')}]`;
}

/** The routes of a group: `pn-x` for one route of every chain, `pn-x: 2; diretta: 1` otherwise. */
function routesText(group: ErrorChainSummary, routed: number): string {
  const [route] = group.routes;
  if (group.routes.length === 1 && route !== undefined && routed === group.count) return route.via.flat().join(', ');
  const ways = group.routes.map((entry) => `${entry.via.flat().join(', ')}: ${String(entry.count)}`);
  if (routed < group.count) ways.push(`diretta: ${String(group.count - routed)}`);
  return ways.join('; ');
}
