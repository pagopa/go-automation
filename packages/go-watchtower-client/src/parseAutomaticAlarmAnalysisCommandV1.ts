import { createRequire } from 'node:module';

import type { Ajv as AjvClass, ErrorObject } from 'ajv';
import type { FormatsPlugin } from 'ajv-formats';

import type { AutomaticAlarmAnalysisCommandV1 } from './generated/AutomaticAlarmAnalysisCommandV1.js';
import schema from './generated/automatic-alarm-analysis-command-v1.schema.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const Ajv = (require('ajv') as { readonly default: typeof AjvClass }).default;
const addFormats = (require('ajv-formats') as { readonly default: FormatsPlugin }).default;
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile<AutomaticAlarmAnalysisCommandV1>(schema);

/** Validates the WT-owned SQS wire command without applying local defaults. */
export function parseAutomaticAlarmAnalysisCommandV1(value: unknown): AutomaticAlarmAnalysisCommandV1 {
  if (validate(value)) return value;
  const details = validate.errors
    ?.map((error: ErrorObject) => `${error.instancePath || '/'} ${error.message ?? 'invalid'}`)
    .join('; ');
  throw new Error(`Invalid AutomaticAlarmAnalysisCommandV1: ${details ?? 'schema validation failed'}`);
}
