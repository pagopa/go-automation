import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { RunbookHttpResponse } from '../../services/RunbookHttpService.js';
import { interpolateTemplate } from './interpolateTemplate.js';
import { executeStep } from './executeStep.js';

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
   * Returns resolved HTTP request configuration for the execution trace.
   *
   * @param context - The runbook execution context
   * @returns Trace info with resolved method, URL, headers, and body
   */
  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const info: Record<string, unknown> = {
      method: this.method,
      url: interpolateTemplate(this.url, context),
    };
    if (this.headers !== undefined) {
      info['headers'] = maskSensitiveHeaders(resolveHeaders(this.headers, context));
    }
    if (this.body !== undefined) {
      info['body'] = resolveBody(this.body, context);
    }
    return info;
  }

  /**
   * Executes the HTTP request with interpolated URL, headers, and body.
   * URL values are encoded with `encodeURIComponent` to prevent SSRF.
   * Header values are validated to reject control characters.
   *
   * @param context - The runbook execution context
   * @returns Step result containing the HTTP response
   */
  async execute(context: RunbookContext): Promise<StepResult<RunbookHttpResponse>> {
    return executeStep('HTTP request', async () => {
      const resolvedUrl = interpolateTemplate(this.url, context, encodeURIComponent);
      const resolvedHeaders = this.headers !== undefined ? resolveHeaders(this.headers, context) : undefined;
      const resolvedBody = this.body !== undefined ? resolveBody(this.body, context) : undefined;

      const response = await context.services.http.request(
        this.method,
        resolvedUrl,
        resolvedBody,
        resolvedHeaders,
        undefined,
        context.signal,
      );

      return { success: true, output: response };
    });
  }
}

/** Header names whose values must be redacted in execution traces. */
const SENSITIVE_HEADERS: ReadonlySet<string> = new Set([
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
  'proxy-authorization',
]);

/** Redaction placeholder for sensitive header values in traces. */
const REDACTED = '***REDACTED***';

/** Pattern matching control characters that must not appear in HTTP header values. */
const HEADER_CONTROL_CHARS = /[\r\n\0]/;

/**
 * Resolves template placeholders in header values.
 * Validates that resolved values do not contain control characters (CR, LF, NUL)
 * to prevent header injection attacks.
 *
 * @param headers - Header key-value pairs with template placeholders
 * @param context - The runbook execution context
 * @returns Resolved headers with interpolated and validated values
 */
function resolveHeaders(headers: Readonly<Record<string, string>>, context: RunbookContext): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const interpolated = interpolateTemplate(value, context);
    if (HEADER_CONTROL_CHARS.test(interpolated)) {
      throw new Error(`Invalid header value for '${key}': contains control characters`);
    }
    resolved[key] = interpolated;
  }
  return resolved;
}

/**
 * Replaces values of sensitive headers (Authorization, API keys, cookies) with a
 * redaction placeholder. Used in `getTraceInfo` to prevent credential leakage in traces.
 */
function maskSensitiveHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    masked[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
  }
  return masked;
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
