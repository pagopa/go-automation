import type { LambdaErrorCategory } from '../types/LambdaErrorCategory.js';
import type { LambdaReportInfo } from './parseLambdaReportLine.js';

const TIMEOUT_RE = /Status:\s*timeout|Task timed out|timed?\s*out/i;
const OOM_RE = /OutOfMemory|JavaScript heap out of memory|Runtime exited with error:\s*signal:\s*killed/i;
const THROTTLE_RE = /Rate Exceeded|TooManyRequestsException|throttl/i;
const DOWNSTREAM_RE = /External service\s+\S+\s+returned errors/i;
const APPLICATION_ERROR_RE = /\bERROR\b|Exception|Status:\s*error/;

/**
 * Classifies a Lambda invocation error into a {@link LambdaErrorCategory},
 * combining the representative message with the parsed `REPORT` info.
 *
 * Priority: `timeout` → `out-of-memory` → `throttle` → `downstream` →
 * `application-error` → `unknown`.
 *
 * @param message - Representative error message
 * @param report - Parsed REPORT line, when available
 * @returns The error category
 */
export function classifyLambdaError(message: string, report?: LambdaReportInfo): LambdaErrorCategory {
  if (report?.status?.toLowerCase() === 'timeout' || TIMEOUT_RE.test(message)) {
    return 'timeout';
  }

  const memoryExhausted =
    report?.maxMemoryUsedMb !== undefined &&
    report.memorySizeMb !== undefined &&
    report.maxMemoryUsedMb >= report.memorySizeMb;
  if (memoryExhausted || OOM_RE.test(message)) {
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
  return 'unknown';
}
