import { COVERAGE_REASONS, ERROR_CHAIN_INTERRUPTION_REASONS } from '../../engine/index.js';
import { scrubAwsProfileNames } from './scrubAwsProfileNames.js';

/** Deepest nesting walked: runbook outputs and traces are far shallower. */
const MAX_DEPTH = 64;
/** Fields that hold AWS profile names by construction (`profile`, `awsProfiles`, `profileNames`, …): masked whole. */
const PROFILE_FIELDS: ReadonlySet<string> = new Set([
  'profile',
  'profiles',
  'awsprofile',
  'awsprofiles',
  'profilename',
  'profilenames',
]);
/**
 * Machine fields whose values are schema values (states, kinds, reasons, versions), never free text: they are kept,
 * even when a value coincides with a profile name.
 */
const MACHINE_FIELDS: ReadonlySet<string> = new Set([
  'status',
  'kind',
  'type',
  'unit',
  'level',
  'outcome',
  'end',
  'mode',
  'operator',
  'schemaversion',
  'proposedstatus',
  'analysistype',
]);
/** Enum values of the `reason` fields (coverage, interruptions); any other reason is free text. */
const REASON_VALUES: ReadonlySet<string> = new Set([...COVERAGE_REASONS, ...ERROR_CHAIN_INTERRUPTION_REASONS]);
/** A value made only of a timestamp: date, `T` or one space, time, then no other whitespace. */
const WHOLE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}\S*$/u;
/** Replacement of a masked profile name. */
const MASK = '<profile>';

/**
 * Removes local AWS profile names from data that leaves the host as a file or a payload: every string of the
 * value, at any depth, goes through {@link scrubAwsProfileNames}, and the fields that hold profile names by
 * construction (`profile`, `profiles`, `awsProfiles`, `profileNames`, …) are masked whole, whatever the name. Keys are kept; a profile list
 * keeps its length, with each name replaced by `<profile>`.
 *
 * Machine fields (`status`, `kind`, `reason`, …) and timestamps are typed data and are kept, even when a value
 * coincides with a name; any other string is free text and is scrubbed, an exact profile name included.
 *
 * The value is copied, never modified. Complexity: O(S) over the total length of the strings.
 *
 * @param value - JSON-like data (output, trace, report)
 * @param profileNames - Profile names known to the host
 * @returns A copy of the value without profile names
 *
 * @example
 * ```typescript
 * scrubAwsProfileNamesDeep({ awsProfiles: ['my-profile'] }, ['my-profile']);
 * // { awsProfiles: ['<profile>'] }
 * ```
 */
export function scrubAwsProfileNamesDeep<T>(value: T, profileNames: ReadonlyArray<string>): T {
  return scrub(value, profileNames, 0) as T;
}

function scrub(value: unknown, profileNames: ReadonlyArray<string>, depth: number): unknown {
  if (typeof value === 'string') return isTimestamp(value) ? value : scrubAwsProfileNames(value, profileNames);
  if (typeof value !== 'object' || value === null || depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((item: unknown) => scrub(item, profileNames, depth + 1));
  if (value instanceof Date) return value;
  const record = value as Readonly<Record<string, unknown>>;
  return Object.fromEntries(
    Object.entries(record).map(
      ([key, item]) => [key, scrubField(key.toLowerCase(), item, profileNames, depth, record)] as const,
    ),
  );
}

/** A field by its meaning: profile fields masked, machine values kept, everything else scrubbed as free text. */
function scrubField(
  key: string,
  item: unknown,
  profileNames: ReadonlyArray<string>,
  depth: number,
  record: Readonly<Record<string, unknown>>,
): unknown {
  if (PROFILE_FIELDS.has(key)) return mask(item);
  if (MACHINE_FIELDS.has(key) && typeof item === 'string') return item;
  // `reason` is an enum in coverage entries (`complete`) and interruptions (`count`), free text in a failed outcome.
  if (key === 'reason' && typeof item === 'string' && REASON_VALUES.has(item) && isCoverageRecord(record)) return item;
  return scrub(item, profileNames, depth + 1);
}

/** A profile field with every string replaced by the mask. */
function mask(value: unknown): unknown {
  if (typeof value === 'string') return MASK;
  if (Array.isArray(value)) return value.map((item: unknown) => (typeof item === 'string' ? MASK : item));
  return value;
}

/**
 * A whole value that is a timestamp (ISO, or `yyyy-MM-dd HH:mm:ss.SSS` of Logs Insights), typed data never scrubbed
 * token by token: free text that starts with one is not.
 */
function isTimestamp(value: string): boolean {
  return WHOLE_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

/** A coverage entry or a chain interruption, whose `reason` is an enum. */
function isCoverageRecord(record: Readonly<Record<string, unknown>>): boolean {
  return typeof record['complete'] === 'boolean' || typeof record['count'] === 'number';
}
