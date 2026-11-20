import type { DescendRequest } from '../../../../../engine/types/DescendRequest.js';
import type { RunbookContext } from '../../../../../engine/types/RunbookContext.js';
import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import { boundedText } from '../../../../common/parsing/correlation/boundedText.js';
import type { DescendToServiceConfig } from './DescendToServiceConfig.js';
import { canonicalTraceId } from '../../../../common/parsing/traceIds/canonicalTraceId.js';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u;

/**
 * Decides where a node of a SEND API Gateway runbook looks for the errors of the same request one level below.
 *
 * - A request of the root level descends to the entry service.
 * - A service node descends to the service of the known URL its row calls, when the runbook reads it.
 * - A known URL outside the runbook is a downstream: the chain ends there, with `downstreamTarget`.
 * - A call to the same service, or no known URL, ends the chain.
 *
 * The descent follows the fallback UUID of the call when the node has one, otherwise the trace id; with neither the
 * descent is still requested, and the chain is interrupted as `skipped`.
 *
 * @example
 * ```typescript
 * new DescendToServiceStep({ id: 'descend-api-gateway', label: '…', entryService: 'pn-delivery', ... });
 * ```
 */
export class DescendToServiceStep implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  /**
   * @param config - Entry service or current service, services of the runbook, trace id variable
   */
  constructor(private readonly config: DescendToServiceConfig) {
    this.id = config.id;
    this.label = config.label;
  }

  /**
   * @param context - Context of the node
   * @returns The descent, or the end of the chain
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    const { service } = this.config;
    const errorMessage = service === undefined ? '' : (context.vars.get(`${service.varPrefix}ErrorMsg`) ?? '').trim();
    const lastError = errorMessage !== '' ? { lastErrorMsg: boundedText(errorMessage) } : {};
    const target =
      service === undefined
        ? (this.config.entryService ?? '')
        : (context.vars.get(`${service.varPrefix}NextUrlTarget`) ?? '').trim();

    if (target === '' || target === service?.name) return { success: true, vars: lastError };
    if (!this.config.servicesInRunbook.has(target)) {
      return { success: true, vars: { ...lastError, downstreamTarget: target } };
    }

    // Only a well-formed identifier is looked up: a sentinel (`-`) or a malformed value is a missing one.
    const rawFallback = (context.vars.get('fallbackUuid') ?? '').trim();
    const fallbackUuid = UUID.test(rawFallback) ? rawFallback : '';
    const rawTrace = (context.vars.get(this.config.traceIdContextVar) ?? '').trim();
    // The canonical trace id, without the other fields of an X-Ray header (`;Sampled=1`).
    const traceId = canonicalTraceId(rawTrace.split(';')[0] ?? '') ?? canonicalTraceId(`Root=${rawTrace}`) ?? '';
    const descend: DescendRequest =
      fallbackUuid !== ''
        ? { target, identifier: fallbackUuid, kind: 'fallbackUuid' }
        : { target, identifier: traceId, kind: 'traceId' };
    return { success: true, vars: lastError, descend: [descend] };
  }
}
