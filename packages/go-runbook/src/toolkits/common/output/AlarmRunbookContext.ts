import type { ApiGwRunbookContext } from '../families/apigw/output/ApiGwRunbookContext.js';
import type { LambdaRunbookContext } from '../families/lambda/output/LambdaRunbookContext.js';
import type { ServiceRunbookContext } from '../families/service/output/ServiceRunbookContext.js';

/**
 * Structured context of an alarm runbook, discriminated by `kind`: the output
 * builders of the families read it (EVO-RBREORG-OPUS-01 P20).
 */
export type AlarmRunbookContext = ApiGwRunbookContext | LambdaRunbookContext | ServiceRunbookContext;
