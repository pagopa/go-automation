import type { SensitiveFinding } from './types/SensitiveFinding.js';

const DIGITS = /[0-9]/gu;

/**
 * One report line. The value is masked: a CI log must not republish what the gate found.
 *
 * @param scope - Package name and check kind
 * @param finding - The finding
 * @returns `scope file:line rule masked-value`
 */
export function formatFinding(scope: string, finding: SensitiveFinding): string {
  const where = finding.line > 0 ? `${finding.file}:${String(finding.line)}` : finding.file;
  return `${scope} ${where} [${finding.rule}] ${maskValue(finding)}`;
}

/** Masks a finding value, keeping just enough to locate it. */
function maskValue(finding: SensitiveFinding): string {
  switch (finding.rule) {
    case 'account-id':
      return `${finding.value.slice(0, 3)}…${finding.value.slice(-2)}`;
    case 'account-arn':
      return finding.value.replace(DIGITS, '#');
    case 'profile-name':
      // At most a third of the name, so a short name ('dev') is never printed whole.
      return `${finding.value.slice(0, Math.min(4, Math.floor(finding.value.length / 3)))}…`;
    case 'forbidden-entry':
      return 'must not be published';
    case 'unscannable-file':
      return 'text file in an encoding the gate cannot read';
    default:
      throw new Error(`unknown rule: ${String(finding.rule)}`);
  }
}
