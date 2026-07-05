import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { S3Client } from '@aws-sdk/client-s3';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

import { buildCatalog, diffCatalog, serializeCatalog } from './catalog.js';
import { deployRegion, runCommand, verifyWorker, workerMatchesRevision } from './deploy.js';
import { readEnvironmentFile } from './environment.js';
import type { AutomaticRunbookCatalogV1 } from './external.js';
import {
  accountIdFromArn,
  AUTOMATIC_RUNBOOK_CATALOG_KEY,
  buildAutomaticRunbookCatalogBucketName,
  EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION,
  loadExecuteRunbookDeploymentConfig,
} from './external.js';
import { loadRunbookDescriptors } from './loadRunbookDescriptors.js';
import { parseOptions } from './options.js';
import { publishCatalog, readCurrentCatalog } from './publish.js';
import { waitForWatchtowerDeploymentStatus } from './watchtower.js';

/** Raw env file values for the SST subprocess plus the validated control-plane coordinates. */
interface RegionalDeployment {
  readonly values: Readonly<Record<string, string>>;
  readonly watchtowerInternalUrl: string;
  readonly watchtowerBackendRoleArn: string;
  readonly servicePrincipalSecretArn: string;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const artifactRevision = git('rev-parse', 'HEAD');
  if (options.environment === 'production' && git('status', '--porcelain') !== '') {
    throw new Error('Production deployment requires a clean working tree');
  }
  const regionalDeployments = new Map<string, RegionalDeployment>();
  let expectedWatchtowerUrl: string | undefined;
  let expectedAccountId: string | undefined;
  for (const region of options.regions) {
    const values = await readEnvironmentFile(resolve(options.configDir, `${region}.env`));
    if (values['DEPLOY_ENV'] !== undefined && values['DEPLOY_ENV'] !== options.environment) {
      throw new Error(`${region}.env DEPLOY_ENV differs from --environment`);
    }
    if (values['DEPLOY_REGION'] !== undefined && values['DEPLOY_REGION'] !== region) {
      throw new Error(`${region}.env DEPLOY_REGION differs from its filename`);
    }
    const validated = loadExecuteRunbookDeploymentConfig(
      {
        ...process.env,
        ...values,
        DEPLOY_ENV: options.environment,
        DEPLOY_REGION: region,
        EXECUTE_RUNBOOK_ARTIFACT_REVISION: artifactRevision,
      },
      new Set(options.regions),
    );
    const regionAccountId = accountIdFromArn(validated.watchtowerBackendRoleArn);
    if (expectedWatchtowerUrl !== undefined && expectedWatchtowerUrl !== validated.watchtowerInternalUrl) {
      throw new Error('Regional configs must use the same Watchtower URL');
    }
    if (expectedAccountId !== undefined && expectedAccountId !== regionAccountId) {
      throw new Error('Regional configs must use the same Watchtower control account');
    }
    if (validated.servicePrincipalSecretArn === undefined) {
      throw new Error(`${region}.env must provide WATCHTOWER_SERVICE_PRINCIPAL_SECRET_ARN`);
    }
    expectedWatchtowerUrl = validated.watchtowerInternalUrl;
    expectedAccountId = regionAccountId;
    regionalDeployments.set(region, {
      values,
      watchtowerInternalUrl: validated.watchtowerInternalUrl,
      watchtowerBackendRoleArn: validated.watchtowerBackendRoleArn,
      servicePrincipalSecretArn: validated.servicePrincipalSecretArn,
    });
  }
  logStep(`preflight ok: environment ${options.environment}, regions ${options.regions.join(', ')}`);

  const control = regionalDeployments.get(EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION)!; // Safe: parseOptions requires the control region in --regions
  const accountId = accountIdFromArn(control.watchtowerBackendRoleArn);
  const actorArn = options.dryRun
    ? 'dry-run'
    : (await new STSClient({ region: EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION }).send(new GetCallerIdentityCommand({})))
        .Arn;
  if (actorArn === undefined) throw new Error('STS did not return caller ARN');

  if (!options.dryRun) {
    logStep('running registry and runbook test suites');
    await runCommand('pnpm', ['test:runbooks']);
    await runCommand('pnpm', ['--filter', 'go-analyze-alarm', 'test']);
  }

  const runbooks = loadRunbookDescriptors();
  const finalCatalog = buildCatalog({
    environment: options.environment,
    artifactRevision,
    actorArn,
    changeNote: options.changeNote,
    runbooks,
  });
  if (finalCatalog.runbooks.length === 0 && !options.allowEmptyCatalog) {
    throw new Error('Refusing to publish an empty catalog without --allow-empty-catalog');
  }
  await writeArtifact(finalCatalog);
  logStep(`catalog ${finalCatalog.revision} generated with ${String(finalCatalog.runbooks.length)} runbooks`);

  const bucket = buildAutomaticRunbookCatalogBucketName(options.environment, accountId);
  const s3 = new S3Client({ region: EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION });
  const current = options.dryRun ? undefined : await readCurrentCatalog(s3, bucket, AUTOMATIC_RUNBOOK_CATALOG_KEY);
  const diff = diffCatalog(current?.catalog, finalCatalog);
  console.log(
    JSON.stringify(
      {
        bucket,
        artifactRevision,
        catalogRevision: finalCatalog.revision,
        diffBaseline: options.dryRun
          ? 'NONE (dry-run does not read the current catalog from S3)'
          : (current?.catalog.revision ?? 'NONE (no catalog published yet)'),
        diff,
      },
      null,
      2,
    ),
  );
  if (options.dryRun) return;

  const orderedRegions = [
    EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION,
    ...options.regions.filter((region) => region !== EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION).sort(),
  ];

  if (diff.kind === 'UNCHANGED') {
    logStep('catalog unchanged: verifying deployed workers');
    const driftedRegions: string[] = [];
    for (const region of orderedRegions) {
      if (!(await workerMatchesRevision(region, artifactRevision))) driftedRegions.push(region);
    }
    for (const region of driftedRegions) {
      logStep(`redeploying drifted region ${region}`);
      // Safe: orderedRegions only contains regions loaded in the preflight loop
      await deployRegion(region, options.environment, artifactRevision, regionalDeployments.get(region)!.values);
      await verifyWorker(region, artifactRevision);
      logStep(`${region} verified at ${artifactRevision}`);
    }
    console.log(JSON.stringify({ status: 'UNCHANGED', redeployedRegions: driftedRegions }, null, 2));
    return;
  }

  let expectedEtag = current?.etag;
  if (diff.kind === 'INCOMPATIBLE') {
    if (current === undefined) throw new Error('Incompatible rollout requires a current catalog');
    const withdrawnKeys = diff.incompatible;
    const withdrawn = new Set(withdrawnKeys);
    const transition = buildCatalog({
      environment: options.environment,
      artifactRevision: current.catalog.worker.artifactRevision,
      actorArn,
      changeNote: `${options.changeNote} [withdraw incompatible capabilities]`,
      runbooks: current.catalog.runbooks.filter(({ key }) => !withdrawn.has(key)),
    });
    logStep(`publishing transition catalog ${transition.revision}; withdrawing ${withdrawnKeys.join(', ')}`);
    const publishedTransition = await publishCatalog(
      s3,
      bucket,
      AUTOMATIC_RUNBOOK_CATALOG_KEY,
      transition,
      expectedEtag,
    );
    expectedEtag = publishedTransition.etag;
    logStep('waiting for Watchtower to observe the transition catalog and drain in-flight executions');
    await waitForWatchtower(control, transition.revision, withdrawnKeys, options.drainTimeoutMs, true);
  }

  for (const region of orderedRegions) {
    logStep(`deploying ${region}`);
    // Safe: orderedRegions only contains regions loaded in the preflight loop
    await deployRegion(region, options.environment, artifactRevision, regionalDeployments.get(region)!.values);
    await verifyWorker(region, artifactRevision);
    logStep(`${region} verified at ${artifactRevision}`);
  }
  const published = await publishCatalog(s3, bucket, AUTOMATIC_RUNBOOK_CATALOG_KEY, finalCatalog, expectedEtag);
  logStep('waiting for Watchtower to observe the final catalog');
  await waitForWatchtower(control, finalCatalog.revision, [], options.drainTimeoutMs, false);
  console.log(JSON.stringify({ status: 'DEPLOYED', versionId: published.versionId, etag: published.etag }, null, 2));
}

async function waitForWatchtower(
  control: RegionalDeployment,
  revision: string,
  runbookKeys: ReadonlyArray<string>,
  timeoutMs: number,
  requireDrained: boolean,
): Promise<void> {
  await waitForWatchtowerDeploymentStatus({
    baseUrl: control.watchtowerInternalUrl,
    secretArn: control.servicePrincipalSecretArn,
    region: EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION,
    catalogRevision: revision,
    runbookKeys,
    timeoutMs,
    requireDrained,
  });
}

function logStep(message: string): void {
  console.log(`[deploy-environment] ${message}`);
}

function git(...args: ReadonlyArray<string>): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function writeArtifact(catalog: AutomaticRunbookCatalogV1): Promise<void> {
  const directory = resolve('artifacts/runbook-catalog');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, `${catalog.revision}.json`), serializeCatalog(catalog), 'utf8');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
