/**
 * Structured fields extracted from a Lambda `REPORT` runtime log line.
 */
export interface LambdaReportInfo {
  readonly requestId?: string;
  readonly durationMs?: number;
  readonly billedDurationMs?: number;
  readonly memorySizeMb?: number;
  readonly maxMemoryUsedMb?: number;
  readonly status?: string;
}

function firstGroup(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text);
  return match?.[1];
}

function firstNumber(text: string, pattern: RegExp): number | undefined {
  const raw = firstGroup(text, pattern);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Parses a Lambda `REPORT` line of the form:
 *
 * ```text
 * REPORT RequestId: <id> Duration: <n> ms Billed Duration: <n> ms
 *   Memory Size: <n> MB Max Memory Used: <n> MB [Init Duration: <n> ms] Status: <status>
 * ```
 *
 * @param message - A log line `@message`
 * @returns The parsed fields, or `undefined` when the line is not a REPORT
 */
export function parseLambdaReportLine(message: string): LambdaReportInfo | undefined {
  const trimmed = message.trim();
  if (!/^REPORT\b/.test(trimmed)) return undefined;

  const requestId = firstGroup(trimmed, /RequestId:\s*([0-9a-fA-F-]{36})/);
  // Negative lookbehind so the standalone `Duration:` is matched, not `Billed Duration:`.
  const durationMs = firstNumber(trimmed, /(?<!Billed )Duration:\s*([\d.]+)\s*ms/i);
  const billedDurationMs = firstNumber(trimmed, /Billed Duration:\s*([\d.]+)\s*ms/i);
  const memorySizeMb = firstNumber(trimmed, /Memory Size:\s*(\d+)\s*MB/i);
  const maxMemoryUsedMb = firstNumber(trimmed, /Max Memory Used:\s*(\d+)\s*MB/i);
  const status = firstGroup(trimmed, /Status:\s*(\S+)/i);

  return {
    ...(requestId !== undefined ? { requestId } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(billedDurationMs !== undefined ? { billedDurationMs } : {}),
    ...(memorySizeMb !== undefined ? { memorySizeMb } : {}),
    ...(maxMemoryUsedMb !== undefined ? { maxMemoryUsedMb } : {}),
    ...(status !== undefined ? { status } : {}),
  };
}
