import type { ScanRules } from './types/ScanRules.js';
import type { SensitiveDataConfig } from './types/SensitiveDataConfig.js';
import type { SensitiveDataRule } from './types/SensitiveDataRule.js';
import type { SensitiveFinding } from './types/SensitiveFinding.js';

const ACCOUNT_ID = /(?<![0-9])[0-9]{12}(?![0-9])/gu;
const ACCOUNT_ARN = /arn:aws[a-z-]*:[a-z0-9-]+:[a-z0-9-]*:([0-9]{12}):/gu;
const NAME_CHARACTER = '[A-Za-z0-9_.-]';

/**
 * Compiles the configuration into the rules applied to every file of one package.
 *
 * @param config - Gate configuration
 * @param packageName - Published package the rules scan: only its exceptions apply
 * @returns Rules to pass to `scanText`
 */
export function compileScanRules(config: SensitiveDataConfig, packageName: string): ScanRules {
  const profileNames = alternation(config.profileNames.map(escapeRegExp), '');
  const profilePrefixes = alternation(config.profilePrefixes.map(escapeRegExp), `${NAME_CHARACTER}+`);
  return {
    allowedAccountIds: new Set(config.allowedAccountIds.map((allowed) => allowed.value)),
    ...(profileNames !== undefined ? { profileNames } : {}),
    ...(profilePrefixes !== undefined ? { profilePrefixes } : {}),
    exceptions: new Set(
      config.exceptions
        .filter((exception) => exception.package === packageName)
        .map((exception) => `${exception.file}\u0000${exception.value}`),
    ),
  };
}

/**
 * Finds account ids, ARNs with an account and AWS profile names in a text file.
 * Complexity: O(N) in the text length per rule.
 *
 * @param file - Path relative to the scanned root, used for the exceptions and the report
 * @param text - File content
 * @param rules - Compiled rules
 * @returns The findings, in file order per rule
 */
export function scanText(file: string, text: string, rules: ScanRules): ReadonlyArray<SensitiveFinding> {
  const lineStarts = lineStartsOf(text);
  const findings: SensitiveFinding[] = [];
  const report = (rule: SensitiveDataRule, value: string, index: number): void => {
    if (rules.exceptions.has(`${file}\u0000${value}`)) return;
    findings.push({ file, line: lineAt(lineStarts, index), rule, value });
  };
  for (const match of text.matchAll(ACCOUNT_ID)) {
    if (!rules.allowedAccountIds.has(match[0])) report('account-id', match[0], match.index);
  }
  for (const match of text.matchAll(ACCOUNT_ARN)) {
    const account = match[1] ?? '';
    if (!rules.allowedAccountIds.has(account)) report('account-arn', match[0], match.index);
  }
  for (const pattern of [rules.profileNames, rules.profilePrefixes]) {
    if (pattern === undefined) continue;
    for (const match of text.matchAll(pattern)) report('profile-name', match[0], match.index);
  }
  return findings;
}

/** A global, whole-token alternation, or `undefined` when there is nothing to match. */
function alternation(parts: ReadonlyArray<string>, suffix: string): RegExp | undefined {
  if (parts.length === 0) return undefined;
  return new RegExp(`(?<!${NAME_CHARACTER})(?:${parts.join('|')})${suffix}(?!${NAME_CHARACTER})`, 'gu');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function lineStartsOf(text: string): ReadonlyArray<number> {
  const starts = [0];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) starts.push(index + 1);
  return starts;
}

/** 1-based line of `index`, by binary search on the line starts. */
function lineAt(lineStarts: ReadonlyArray<number>, index: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((lineStarts[middle] ?? 0) <= index) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}
