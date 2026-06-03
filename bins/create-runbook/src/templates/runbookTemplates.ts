import type { RunbookTemplate } from './RunbookTemplate.js';
import { API_GATEWAY_TEMPLATE } from './apiGatewayTemplate.js';
import { LAMBDA_TEMPLATE } from './lambdaTemplate.js';
import { BASE_TEMPLATE } from './baseTemplate.js';

/** All runbook templates available to the scaffolder. */
export const RUNBOOK_TEMPLATES: ReadonlyArray<RunbookTemplate> = [API_GATEWAY_TEMPLATE, LAMBDA_TEMPLATE, BASE_TEMPLATE];

/**
 * Looks up a template by id.
 *
 * @param id - Template id (e.g. `api-gateway`)
 * @returns The matching template, or `undefined` when not found
 */
export function findRunbookTemplate(id: string): RunbookTemplate | undefined {
  return RUNBOOK_TEMPLATES.find((template) => template.id === id);
}
