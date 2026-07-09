import { spawn } from 'node:child_process';

import { GetFunctionConfigurationCommand, LambdaClient, ListTagsCommand } from '@aws-sdk/client-lambda';

import { EXECUTE_RUNBOOK_LAMBDA_NAME } from './external.js';

export async function deployRegion(
  region: string,
  environment: string,
  artifactRevision: string,
  regionalEnvironment: Readonly<Record<string, string>>,
): Promise<void> {
  await runCommand('pnpm', ['deploy:execute-runbook'], {
    ...process.env,
    ...regionalEnvironment,
    DEPLOY_ENV: environment,
    DEPLOY_REGION: region,
    EXECUTE_RUNBOOK_ARTIFACT_REVISION: artifactRevision,
  });
}

export async function verifyWorker(region: string, artifactRevision: string): Promise<void> {
  const client = new LambdaClient({ region });
  const worker = await client.send(new GetFunctionConfigurationCommand({ FunctionName: EXECUTE_RUNBOOK_LAMBDA_NAME }));
  if (worker.Environment?.Variables?.['EXECUTE_RUNBOOK_ARTIFACT_REVISION'] !== artifactRevision) {
    throw new Error(`Worker ${region} does not expose artifact revision ${artifactRevision}`);
  }
  if (worker.FunctionArn === undefined) throw new Error(`Worker ${region} has no function ARN`);
  const tags = await client.send(new ListTagsCommand({ Resource: worker.FunctionArn }));
  if (tags.Tags?.['ArtifactRevision'] !== artifactRevision) {
    throw new Error(`Worker ${region} tag does not match artifact revision ${artifactRevision}`);
  }
}

/** Non-throwing variant of verifyWorker used to detect drifted workers on unchanged catalogs. */
export async function workerMatchesRevision(region: string, artifactRevision: string): Promise<boolean> {
  try {
    await verifyWorker(region, artifactRevision);
    return true;
  } catch (error: unknown) {
    console.warn(`Worker ${region} verification failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export async function runCommand(
  command: string,
  args: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with ${signal ?? `exit ${String(code)}`}`));
    });
  });
}
