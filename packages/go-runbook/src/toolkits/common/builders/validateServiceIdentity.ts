import type { ServiceDescriptor } from '../families/service/types/ServiceDescriptor.js';

/**
 * Allowed characters for the service slug used to build step ids
 * (`query-<name>`, …), referenced by known cases. Flat (single quantifier) form;
 * leading/trailing hyphens are rejected separately to avoid a nested-quantifier
 * regex (the `security/detect-unsafe-regex` ReDoS heuristic).
 */
const SERVICE_NAME_PATTERN = /^[A-Za-z0-9-]+$/;

/** Identifier prefix used to build var names (`<varPrefix>TraceId`, …). */
const VAR_PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * Fails fast on the identity of the service a builder analyses: a non-empty runbook id, a slug name (it builds the
 * step ids), a log group and an identifier prefix (it builds the var names).
 *
 * @param builderName - Builder reported in the error
 * @param id - Runbook id
 * @param service - Name, log group and var prefix of the service
 * @throws Error on the first invalid field
 *
 * @example
 * ```typescript
 * validateServiceIdentity('createServiceAlarmRunbook', config.id, config.service);
 * ```
 */
export function validateServiceIdentity(
  builderName: string,
  id: string,
  service: Pick<ServiceDescriptor, 'name' | 'logGroup' | 'varPrefix'>,
): void {
  if (id.trim() === '') {
    throw new Error(`${builderName}: id must be a non-empty string.`);
  }
  for (const field of ['name', 'logGroup', 'varPrefix'] as const) {
    if (service[field].trim() === '') {
      throw new Error(`${builderName} "${id}": service.${field} must be a non-empty string.`);
    }
  }
  if (!SERVICE_NAME_PATTERN.test(service.name) || service.name.startsWith('-') || service.name.endsWith('-')) {
    throw new Error(
      `${builderName} "${id}": service.name "${service.name}" must be a slug ` +
        '(alphanumeric segments separated by "-"); it is used to build step ids.',
    );
  }
  if (!VAR_PREFIX_PATTERN.test(service.varPrefix)) {
    throw new Error(
      `${builderName} "${id}": service.varPrefix "${service.varPrefix}" must start with a letter ` +
        'and contain only letters and digits; it is used to build var names.',
    );
  }
}
