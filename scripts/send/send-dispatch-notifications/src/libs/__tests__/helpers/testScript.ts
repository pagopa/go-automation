import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

import { Core } from '@go-automation/go-common';

import type { SendDispatchNotificationsConfig } from '../../../types/SendDispatchNotificationsConfig.js';

/** Raw configuration with the defaults of config.ts (dry run, e2e, qa-test). */
export const RAW_CONFIG: SendDispatchNotificationsConfig = {
  mode: 'e2e',
  inputFile: '/in.csv',
  mappingProfile: 'qa-test',
  listEnvs: false,
  apiVersion: 'v2.6',
  ecClientId: 'pn-cons-000',
  ecProduction: false,
  directRequestIdTemplate: 'PNMAN.GO-{runId}.{rowKey}.PCRETRY_0',
  uploadConcurrency: 5,
  preloadBatchSize: 15,
  uploadReuseMaxAge: '72h',
  phases: ['send', 'verify'],
  dryRun: true,
  yes: false,
  failFast: false,
  verbose: false,
  retryFailed: false,
  retryUncertain: false,
  sendRetryAmbiguous: true,
  sendTimeout: '10m',
  burst: 1,
  rateAdaptive: true,
  maxInFlight: 40,
  httpTimeout: '60s',
  verifyInitialDelay: '10s',
  verifyTimeout: '15m',
  requestIdCategories: ['PREPARE_ANALOG_DOMICILE', 'PREPARE_DIGITAL_DOMICILE'],
  requestIdSelect: 'per-category',
  requestIdWait: 'any',
  requestIdInitialDelay: '60s',
  requestIdTimeout: '2h',
  dynamodbConcurrency: 10,
  outputIncludeStatus: false,
  outputOnlySuccess: false,
};

/** Header of the qa-test CSV template used by the fixtures. */
export const QA_HEADER = 'ID_Scenario,Scenario,Destinatario,Denomination,CAP,Citta,Indirizzo,Stato,iun';

/**
 * One qa-test CSV row.
 *
 * @param key - Row key (`ID_Scenario`)
 * @param zip - CAP (`12` makes the row invalid)
 * @param iun - IUN column (rows already sent)
 * @returns The CSV line
 */
export function qaRow(key: string, zip = '00100', iun = ''): string {
  return `${key},Scenario ${key},RSSMRA80A01H501U,Mario Rossi,${zip},Roma,Via Roma 1,ITALIA,${iun}`;
}

/** Logger double: records `level: message` lines. */
export class FakeLogger {
  public readonly lines: string[] = [];

  public section(title: string): void {
    this.lines.push(`section: ${title}`);
  }

  public keyValueTable(values: Readonly<Record<string, unknown>>): void {
    for (const [key, value] of Object.entries(values)) this.lines.push(`kv: ${key}=${String(value)}`);
  }

  public simpleTable(rows: ReadonlyArray<Readonly<Record<string, unknown>>>): void {
    this.lines.push(`table: ${rows.length}`);
  }

  public info(message: string): void {
    this.lines.push(`info: ${message}`);
  }

  public success(message: string): void {
    this.lines.push(`success: ${message}`);
  }

  public warning(message: string): void {
    this.lines.push(`warning: ${message}`);
  }

  public error(message: string): void {
    this.lines.push(`error: ${message}`);
  }

  /** Lines of one level, without the prefix. */
  public of(level: string): string[] {
    const prefix = `${level}: `;
    return this.lines.filter((line) => line.startsWith(prefix)).map((line) => line.slice(prefix.length));
  }
}

/**
 * Prompt double: answers `confirm` with a fixed value and records the
 * questions; `onConfirm` runs while the question is open (e.g. a signal).
 */
export class FakePrompt {
  public readonly questions: string[] = [];

  constructor(private readonly answer: boolean | undefined) {}

  public async confirm(message: string): Promise<boolean | undefined> {
    this.questions.push(message);
    this.onConfirm();
    return Promise.resolve(this.answer);
  }

  /** Runs while the question is open: tests replace it (e.g. to simulate a signal). */
  public onConfirm(): void {
    // no-op by default
  }

  public startSpinner(): void {
    // no-op
  }

  public updateSpinner(): void {
    // no-op
  }

  public stopSpinner(): void {
    // no-op
  }
}

/** DynamoDB client double: every timeline query returns no element. */
const EMPTY_DYNAMO = {
  send: async (): Promise<{ Items: [] }> => Promise.resolve({ Items: [] }),
};

/**
 * GOPaths double rooted in a temp directory: one execution directory per
 * script, absolute paths kept, relative paths resolved against the root.
 */
class TestPaths {
  constructor(private readonly root: string) {}

  public createExecutionOutputDir(): string {
    return this.executionDir();
  }

  public getExecutionOutputFilePath(fileName: string): string {
    return path.join(this.executionDir(), fileName);
  }

  public getOutputsBaseDir(): string {
    return path.join(this.root, 'outputs');
  }

  public resolvePath(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.join(this.root, filePath);
  }

  public getConfigFilePathWithInfo(fileName: string): { readonly path: string; readonly source: string } {
    return { path: path.join(this.root, fileName), source: 'none' };
  }

  private executionDir(): string {
    return path.join(this.getOutputsBaseDir(), 'send-dispatch-notifications_test');
  }
}

/** A GOScript double rooted in a temp directory. */
export interface TestScript {
  readonly script: Core.GOScript;
  readonly logger: FakeLogger;
  readonly prompt: FakePrompt;
  readonly dir: string;
}

/**
 * Creates a GOScript double: paths under a fresh temp directory (with the
 * execution directory already created, as GOPaths does), logger and prompt
 * doubles, AWS clients whose DynamoDB returns empty timelines.
 *
 * @param answer - Answer of the confirmation prompt
 * @returns The double and its parts
 */
export async function createTestScript(answer: boolean | undefined = true): Promise<TestScript> {
  const dir = path.join(os.tmpdir(), `send-dispatch-notifications-${randomUUID()}`);
  const paths = new TestPaths(dir);
  await writeFixture(paths.getExecutionOutputFilePath('.keep'), '');
  const logger = new FakeLogger();
  const prompt = new FakePrompt(answer);
  const script = {
    paths,
    logger,
    prompt,
    aws: { clients: { get: () => ({ dynamoDB: EMPTY_DYNAMO }) } },
  } as unknown as Core.GOScript;
  return { script, logger, prompt, dir };
}

/**
 * Writes a text fixture with the go-common exporter (creates parents).
 *
 * @param filePath - Absolute path
 * @param content - Text
 */
export async function writeFixture(filePath: string, content: string): Promise<void> {
  await new Core.GOBinaryFileExporter({ outputPath: filePath }).export(Buffer.from(content, 'utf8'));
}

/**
 * Reads a text fixture with the go-common importer.
 *
 * @param filePath - Absolute path
 * @returns Content, or `undefined` when missing
 */
export async function readFixture(filePath: string): Promise<string | undefined> {
  return new Core.GOTextFileImporter({ inputPath: filePath, optional: true }).import();
}
