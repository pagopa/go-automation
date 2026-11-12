import type { DispatchSender } from '../model/DispatchSender.js';
import type { FieldValues } from './FieldValues.js';

/**
 * The parts of an environment that contribute field values (§7.4.2).
 * Satisfied by `EnvironmentDefinition` and by any resolved send target with
 * the same fields.
 */
export interface EnvironmentFieldSource {
  readonly sender?: DispatchSender;
  readonly groupId?: string;
  readonly defaults: FieldValues;
}
