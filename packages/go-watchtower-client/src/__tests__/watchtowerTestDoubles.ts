import { WatchtowerClient } from '../WatchtowerClient.js';
import type { CompleteExecutionRequest } from '../WatchtowerTypes.js';

/** Base URL every test client talks to; `fetch` is always stubbed. */
export const WATCHTOWER_BASE_URL = 'https://watchtower.internal';

/** Execution id shared by the lifecycle tests. */
export const EXECUTION_ID = '0192c000-0000-7000-8000-000000000001';

/** Body of a minimal lifecycle completion. */
export const COMPLETE_EXECUTION_BODY: CompleteExecutionRequest = {
  attemptId: '0192c000-0000-7000-8000-0000000000e1',
  outcome: 'CAPABILITY_WITHDRAWN',
  runbookKey: 'pn-core-runbook',
  runbookVersion: '1.0.0',
  runbookDigest: `sha256-${'a'.repeat(64)}`,
};

/**
 * Returns the URL a stubbed `fetch` was called with, whatever its input form.
 *
 * @param input - The first argument received by `fetch`
 * @returns The absolute request URL
 */
export function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Builds the response of a successful service login.
 *
 * @returns A fresh JSON response carrying service tokens
 */
export function serviceLoginResponse(): Response {
  return Response.json({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 300,
    serviceId: 'runbook-automation-worker',
    principalType: 'SERVICE',
  });
}

/**
 * Builds a client authenticated with service credentials.
 *
 * @param baseUrl - Base URL of the Watchtower API
 * @returns A client whose requests go through the stubbed `fetch`
 */
export function serviceClient(baseUrl: string = WATCHTOWER_BASE_URL): WatchtowerClient {
  return new WatchtowerClient({
    baseUrl,
    credentials: { kind: 'SERVICE', serviceId: 'runbook-automation-worker', password: 'secret' },
  });
}
