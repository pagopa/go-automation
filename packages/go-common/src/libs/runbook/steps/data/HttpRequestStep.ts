import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { RunbookHttpResponse } from '../../services/RunbookHttpService.js';
import { interpolateTemplate } from './interpolateTemplate.js';

/**
 * Configuration for the HTTP request data step.
 */
export interface HttpRequestConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  readonly method: string;
  /** Full URL (supports {{params.xxx}} and {{vars.xxx}} templates) */
  readonly url: string;
  /** Optional request headers (values support template interpolation) */
  readonly headers?: Readonly<Record<string, string>>;
  /** Optional request body (string values support template interpolation) */
  readonly body?: unknown;
}

/**
 * Data step that executes an HTTP request.
 * Supports template interpolation in the URL, header values, and string body.
 *
 * @example
 * ```typescript
 * const step = httpRequest({
 *   id: 'fetch-status',
 *   label: 'Fetch service status',
 *   method: 'GET',
 *   url: 'https://api.example.com/status/{{params.serviceId}}',
 *   headers: { 'Authorization': 'Bearer {{vars.token}}' },
 * });
 * ```
 */
export class HttpRequestStep implements Step<RunbookHttpResponse> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly method: string;
  private readonly url: string;
  private readonly headers: Readonly<Record<string, string>> | undefined;
  private readonly body: unknown;

  constructor(config: HttpRequestConfig) {
    this.id = config.id;
    this.label = config.label;
    this.method = config.method;
    this.url = config.url;
    this.headers = config.headers;
    this.body = config.body;
  }

  /**
   * Executes the HTTP request with interpolated URL, headers, and body.
   *
   * @param context - The runbook execution context
   * @returns Step result containing the HTTP response
   */
  async execute(context: RunbookContext): Promise<StepResult<RunbookHttpResponse>> {
    try {
      const resolvedUrl = interpolateTemplate(this.url, context);
      const resolvedHeaders = this.headers !== undefined ? resolveHeaders(this.headers, context) : undefined;
      const resolvedBody = resolveBody(this.body, context);

      const response = await context.services.http.request(this.method, resolvedUrl, resolvedBody, resolvedHeaders);

      return { success: true, output: response };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `HTTP request failed: ${message}` };
    }
  }
}

/**
 * Resolves template placeholders in header values.
 */
function resolveHeaders(headers: Readonly<Record<string, string>>, context: RunbookContext): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = interpolateTemplate(value, context);
  }
  return resolved;
}

/**
 * Resolves template placeholders in the request body.
 * Only string bodies are interpolated; other types are passed through unchanged.
 */
function resolveBody(body: unknown, context: RunbookContext): unknown {
  if (typeof body === 'string') {
    return interpolateTemplate(body, context);
  }
  return body;
}

/**
 * Factory function for creating an HTTP request data step.
 *
 * @param config - Step configuration
 * @returns A new HttpRequestStep instance
 */
export function httpRequest(config: HttpRequestConfig): HttpRequestStep {
  return new HttpRequestStep(config);
}
