import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const POLL_INTERVAL_MS = 15_000;

interface DeploymentStatus {
  readonly catalogRevisionObserved: boolean;
  readonly inFlightExecutions: number;
  readonly byStatus: Readonly<Record<string, number>>;
}

type PollResult =
  | { readonly kind: 'status'; readonly status: DeploymentStatus }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'transient'; readonly detail: string };

type LoginResult =
  { readonly kind: 'token'; readonly token: string } | { readonly kind: 'transient'; readonly detail: string };

/**
 * Polls the Watchtower deployment-status endpoint until the catalog revision is observed
 * (and, when required, all executions for the withdrawn keys are drained) or the timeout expires.
 * Drain waits can last hours, so expired tokens are refreshed and transient failures
 * (network errors, HTTP 5xx, malformed bodies) are retried until the deadline.
 */
export async function waitForWatchtowerDeploymentStatus(input: {
  readonly baseUrl: string;
  readonly secretArn: string;
  readonly region: string;
  readonly catalogRevision: string;
  readonly runbookKeys: ReadonlyArray<string>;
  readonly timeoutMs: number;
  readonly requireDrained: boolean;
}): Promise<void> {
  const password = await loadSecret(input.secretArn, input.region);
  const query = new URLSearchParams({ catalogRevision: input.catalogRevision });
  if (input.runbookKeys.length > 0) query.set('runbookKeys', input.runbookKeys.join(','));
  const statusUrl = `${normalizeBaseUrl(input.baseUrl)}/api/internal/automatic-runbooks/deployment-status?${query.toString()}`;
  const deadline = Date.now() + input.timeoutMs;
  let token: string | undefined;
  let tokenWasJustRefreshed = false;
  let lastTransientDetail: string | undefined;
  let lastProgressSummary: string | undefined;
  while (Date.now() < deadline) {
    if (token === undefined) {
      const loginResult = await login(input.baseUrl, password);
      if (loginResult.kind === 'transient') {
        lastTransientDetail = loginResult.detail;
        console.warn(`Watchtower service login not available yet: ${loginResult.detail}; retrying until timeout`);
        await delay(POLL_INTERVAL_MS);
        continue;
      }
      token = loginResult.token;
    }
    const result = await pollDeploymentStatus(statusUrl, token);
    if (result.kind === 'unauthorized') {
      if (tokenWasJustRefreshed) throw new Error('Watchtower rejected a freshly issued service token');
      token = undefined;
      tokenWasJustRefreshed = true;
      continue;
    }
    if (result.kind === 'transient') {
      lastTransientDetail = result.detail;
      console.warn(`Watchtower deployment status unavailable: ${result.detail}; retrying until timeout`);
      await delay(POLL_INTERVAL_MS);
      continue;
    }
    tokenWasJustRefreshed = false;
    const status = result.status;
    if (status.catalogRevisionObserved && (!input.requireDrained || status.inFlightExecutions === 0)) return;
    const progress = status.catalogRevisionObserved
      ? `catalog ${input.catalogRevision} observed; waiting for drain: ${String(status.inFlightExecutions)} in-flight executions`
      : `catalog ${input.catalogRevision} not yet observed by Watchtower`;
    if (progress !== lastProgressSummary) {
      console.log(`[deploy-environment] ${progress}`);
      lastProgressSummary = progress;
    }
    await delay(POLL_INTERVAL_MS);
  }
  const transientSuffix = lastTransientDetail === undefined ? '' : ` (last transient error: ${lastTransientDetail})`;
  throw new Error(`Timed out waiting for Watchtower catalog ${input.catalogRevision}${transientSuffix}`);
}

async function pollDeploymentStatus(url: string, token: string): Promise<PollResult> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  } catch (error: unknown) {
    return { kind: 'transient', detail: errorMessage(error) };
  }
  if (response.status === 401 || response.status === 403) return { kind: 'unauthorized' };
  if (response.status >= 500) {
    return { kind: 'transient', detail: `deployment status returned HTTP ${String(response.status)}` };
  }
  if (!response.ok) throw new Error(`Watchtower deployment status returned ${String(response.status)}`);
  try {
    return { kind: 'status', status: (await response.json()) as DeploymentStatus };
  } catch (error: unknown) {
    return { kind: 'transient', detail: errorMessage(error) };
  }
}

async function loadSecret(secretArn: string, region: string): Promise<string> {
  const response = await new SecretsManagerClient({ region }).send(new GetSecretValueCommand({ SecretId: secretArn }));
  const value = response.SecretString?.trim();
  if (value === undefined || value === '') throw new Error('Watchtower service secret is empty or binary');
  return value;
}

async function login(baseUrl: string, password: string): Promise<LoginResult> {
  let response: Response;
  try {
    response = await fetch(`${normalizeBaseUrl(baseUrl)}/auth/service/login`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ serviceId: 'runbook-automation-worker', password }),
    });
  } catch (error: unknown) {
    return { kind: 'transient', detail: errorMessage(error) };
  }
  if (response.status >= 500)
    return { kind: 'transient', detail: `service login returned HTTP ${String(response.status)}` };
  if (!response.ok) throw new Error(`Watchtower service login returned ${String(response.status)}`);
  const body = (await response.json()) as { readonly accessToken?: string };
  if (body.accessToken === undefined) throw new Error('Watchtower service login did not return an access token');
  return { kind: 'token', token: body.accessToken };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/u, '').replace(/\/api$/u, '');
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
