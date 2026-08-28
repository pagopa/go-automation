import { AnalyzeInteropApiGwAggregatesStep } from '../../../interop/apigw/steps/AnalyzeInteropApiGwAggregatesStep.js';

/** Backward-compatible Selfcare adapter over the shared INTEROP APIGW aggregate analyzer. */
export class AnalyzeInteropApiGw5xxStep extends AnalyzeInteropApiGwAggregatesStep {
  constructor(config: { readonly id: string; readonly label: string; readonly fromStep: string }) {
    super({ ...config, errorFamilyLabel: '5xx' });
  }
}
