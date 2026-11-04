import type { CanonicalField } from './CanonicalField.js';
import type { EnvironmentFieldSource } from './EnvironmentFieldSource.js';
import type { FieldValues } from './FieldValues.js';

/**
 * Field values contributed by an environment: `sender`, `groupId` and
 * `defaults` (§7.4.2). Explicit fields win over the same key in `defaults`.
 * Pure.
 *
 * @param environment - Selected environment (or a target with the same fields)
 * @returns Field values of the environment layer
 */
export function environmentFieldValues(environment: EnvironmentFieldSource): FieldValues {
  const values = new Map<CanonicalField, string>();
  if (environment.sender !== undefined) {
    values.set('sender.taxId', environment.sender.taxId);
    values.set('sender.denomination', environment.sender.denomination);
  }
  if (environment.groupId !== undefined) values.set('notificationOptions.group', environment.groupId);
  for (const [field, value] of environment.defaults) {
    if (!values.has(field)) values.set(field, value);
  }
  return values;
}
