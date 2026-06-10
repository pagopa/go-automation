/**
 * Generic context included in a runbook result output.
 *
 * `fields` is intended for dashboards and concise operator views,
 * `evidence` carries bounded supporting samples, and `details` can hold
 * a domain-specific typed payload.
 */
export interface RunbookOutputContext {
  readonly fields: ReadonlyArray<RunbookResultField>;
  readonly evidence: ReadonlyArray<RunbookEvidence>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface RunbookResultField {
  readonly name: string;
  readonly label: string;
  readonly value: string;
}

export interface RunbookEvidence {
  readonly id: string;
  readonly label: string;
  readonly type: 'summary' | 'log-sample' | 'step-output' | 'artifact';
  readonly sourceStep?: string;
  readonly items?: ReadonlyArray<Readonly<Record<string, string>>>;
  readonly truncated?: boolean;
}

export function emptyRunbookOutputContext(): RunbookOutputContext {
  return { fields: [], evidence: [] };
}

/**
 * Widens a typed, domain-specific payload into the generic {@link
 * RunbookOutputContext.details} bag.
 *
 * Centralizes the one unavoidable cast: a typed interface has no implicit index
 * signature, so it is not directly assignable to `Record<string, unknown>`.
 *
 * @param value - The domain-specific output context (e.g. service/apigw/lambda)
 * @returns The same object typed as the generic details record
 */
export function toRunbookOutputDetails<T extends object>(value: T): Readonly<Record<string, unknown>> {
  return value as unknown as Readonly<Record<string, unknown>>;
}
