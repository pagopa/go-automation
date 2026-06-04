import type { LambdaErrorCategory } from '../types/LambdaErrorCategory.js';
import type { LambdaReportInfo } from './parseLambdaReportLine.js';

const TIMEOUT_RE = /Status:\s*timeout|Task timed out|timed?\s*out/i;
const OOM_RE = /OutOfMemory|JavaScript heap out of memory|Runtime exited with error:\s*signal:\s*killed/i;
const THROTTLE_RE = /Rate Exceeded|TooManyRequestsException|throttl/i;
const DOWNSTREAM_RE = /External service\s+\S+\s+returned errors/i;
const APPLICATION_ERROR_RE = /\bERROR\b|Exception|Status:\s*error/;

/**
 * Whether the REPORT shows the invocation peaked at or above its configured
 * memory. Used only as **secondary** evidence: peaking at the limit is common
 * for near-limit invocations and is not, on its own, an out-of-memory kill.
 */
function isMemorySaturated(report: LambdaReportInfo | undefined): boolean {
  return (
    report?.maxMemoryUsedMb !== undefined &&
    report.memorySizeMb !== undefined &&
    report.maxMemoryUsedMb >= report.memorySizeMb
  );
}

/**
 * Classifies a Lambda invocation error into a {@link LambdaErrorCategory},
 * combining the representative message with the parsed `REPORT` info.
 *
 * Priority: `timeout` → `out-of-memory` (explicit signature) → `throttle` →
 * `downstream` → `application-error` → `out-of-memory` (memory saturation as a
 * last-resort signal) → `unknown`.
 *
 * Memory saturation (`Max Memory Used >= Memory Size`) is intentionally a
 * last-resort signal: it never overrides an explicit application / downstream
 * / timeout error, so a logic error that merely peaked at the memory limit is
 * not mislabelled as OOM.
 *
 * @param message - Representative error message
 * @param report - Parsed REPORT line, when available
 * @returns The error category
 */
export function classifyLambdaError(message: string, report?: LambdaReportInfo): LambdaErrorCategory {
  if (report?.status?.toLowerCase() === 'timeout' || TIMEOUT_RE.test(message)) {
    return 'timeout';
  }
  if (OOM_RE.test(message)) {
    return 'out-of-memory';
  }
  if (THROTTLE_RE.test(message)) {
    return 'throttle';
  }
  if (DOWNSTREAM_RE.test(message)) {
    return 'downstream';
  }
  if (APPLICATION_ERROR_RE.test(message)) {
    return 'application-error';
  }
  // Secondary evidence: no explicit signature, but the invocation saturated
  // its memory — likely an OOM that did not log a recognizable line.
  if (isMemorySaturated(report)) {
    return 'out-of-memory';
  }
  return 'unknown';
}
