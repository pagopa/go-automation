import type { MappingFillTransform } from './MappingFillTransform.js';
import type { MappingTransform } from './MappingTransform.js';
import type { MappingTransformOp } from './MappingTransformOp.js';

const NORMALIZE_OPS: ReadonlySet<MappingTransformOp> = new Set<MappingTransformOp>([
  'trim',
  'upper',
  'emptyIfIn',
  'map',
]);
const FILL_OPS: ReadonlySet<MappingTransformOp> = new Set<MappingTransformOp>(['constantIfPresent', 'default']);
const ALL_OPS: ReadonlySet<string> = new Set<string>([...NORMALIZE_OPS, ...FILL_OPS]);

/**
 * Type guard for transform operation names.
 *
 * @param value - Untrusted value (the `op` of a parsed profile)
 * @returns Whether `value` is one of the supported operations
 */
export function isMappingTransformOp(value: unknown): value is MappingTransformOp {
  return typeof value === 'string' && ALL_OPS.has(value);
}

/**
 * Whether a transform only fills an empty field (`constantIfPresent`,
 * `default`), and therefore runs after the merge of row, CLI and environment.
 *
 * @param step - Transform step
 * @returns Whether the step is a fill transform
 */
export function isFillTransform(step: MappingTransform): step is MappingFillTransform {
  return FILL_OPS.has(step.op);
}
