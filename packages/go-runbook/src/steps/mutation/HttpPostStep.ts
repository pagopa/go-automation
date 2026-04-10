import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { RunbookHttpResponse } from '../../services/RunbookHttpService.js';

/**
 * Configuration for the HTTP POST step.
 */
export interface HttpPostConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Target URL for the POST request */
  readonly url: string;
  /** Request body (will be JSON-serialized if object) */
  readonly body: unknown;
  /** Optional HTTP headers */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Mutation step that performs an HTTP POST request.
 * Delegates to the context's HTTP service for request execution.
 *
 * @example
 * ```typescript
 * const step = httpPost({
 *   id: 'create-ticket',
 *   label: 'Create support ticket',
 *   url: 'https://api.example.com/tickets',
 *   body: { title: 'Alarm triggered', severity: 'high' },
 *   headers: { 'Authorization': 'Bearer token' },
 * });
 * ```
 */
class HttpPostStep implements Step<RunbookHttpResponse> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'mutation';

  private readonly url: string;
  private readonly body: unknown;
  private readonly headers: Readonly<Record<string, string>> | undefined;

  constructor(config: HttpPostConfig) {
    this.id = config.id;
    this.label = config.label;
    this.url = config.url;
    this.body = config.body;
    this.headers = config.headers;
  }

  /**
   * Executes the HTTP POST request.
   *
   * @param context - The runbook execution context
   * @returns Step result containing the HTTP response
   */
  async execute(context: RunbookContext): Promise<StepResult<RunbookHttpResponse>> {
    try {
      const response = await context.services.http.request('POST', this.url, this.body, this.headers);

      return { success: true, output: response };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `HTTP POST request failed: ${message}` };
    }
  }
}

/**
 * Factory function for creating an HTTP POST mutation step.
 *
 * @param config - Step configuration
 * @returns A new HttpPostStep instance
 */
export function httpPost(config: HttpPostConfig): Step<RunbookHttpResponse> {
  return new HttpPostStep(config);
}
