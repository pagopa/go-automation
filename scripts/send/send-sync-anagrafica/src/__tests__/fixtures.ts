/**
 * Fixture condivise.
 *
 * La configurazione di base legge il `configs/config.json` **spedito**, non una
 * copia: se un valore di guardia viene rinominato, i test si rompono invece di
 * continuare a verificare una costante che il runtime non usa piu'.
 */

import type { GOScript } from '@go-automation/go-script';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AnagraficaTable, SendSyncAnagraficaConfig } from '../types/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Il config.json spedito con lo script. */
interface ShippedConfig {
  readonly accounts: { readonly core: string; readonly confinfo: string };
  readonly configuration: {
    readonly confDir: string;
    readonly dynamodbDir: string;
    readonly tablesFile: string;
  };
  readonly environments: { readonly allowed: ReadonlyArray<string> };
  readonly guard: { readonly prodProfileMarkers: ReadonlyArray<string> };
}

/** Legge `configs/config.json` dalla directory dello script. */
export function readShippedConfig(): ShippedConfig {
  return JSON.parse(fs.readFileSync(path.resolve(HERE, '../../configs/config.json'), 'utf8')) as ShippedConfig;
}

/** Path del `configs/tables.json` spedito. */
export const TABLES_PATH: string = path.resolve(HERE, '../../configs/tables.json');

const SHIPPED = readShippedConfig();

/** Una configurazione valida, su cui ogni test cambia solo cio' che prova. */
export function makeConfig(overrides: Partial<SendSyncAnagraficaConfig> = {}): SendSyncAnagraficaConfig {
  return {
    configPath: '/repo',
    env: 'test',
    awsProfiles: ['send-core-test', 'send-confinfo-test'],
    awsRegion: 'eu-south-1',
    tableNames: [],
    sync: false,
    dryRun: false,
    strictConfiguration: false,
    yes: false,
    outputFile: undefined,
    outputFormat: 'json',
    accountsCore: SHIPPED.accounts.core,
    accountsConfinfo: SHIPPED.accounts.confinfo,
    configurationConfDir: SHIPPED.configuration.confDir,
    configurationDynamodbDir: SHIPPED.configuration.dynamodbDir,
    configurationTablesFile: SHIPPED.configuration.tablesFile,
    environmentsAllowed: SHIPPED.environments.allowed,
    guardProdProfileMarkers: SHIPPED.guard.prodProfileMarkers,
    ...overrides,
  };
}

/** Una tabella dichiarata, su cui i test del confronto lavorano. */
export function makeTable(overrides: Partial<AnagraficaTable> = {}): AnagraficaTable {
  return {
    name: 'pn-EcAnagrafica',
    account: 'confinfo',
    keys: ['cxId'],
    protectedKey: undefined,
    syncMode: 'replace',
    ...overrides,
  };
}

/** Scorciatoia per un attributo stringa. */
export function s(value: string): Record<string, string> {
  return { S: value };
}

/** Righe registrate dal logger finto. */
interface RecordedLogs {
  readonly errors: string[];
  readonly warnings: string[];
  readonly lines: string[];
  readonly sections: string[];
}

/** Come il prompt deve rispondere, . */
export interface FakeScriptOptions {
  /** Valore reso da `prompt.confirm`; `undefined` e' l'annullamento con Ctrl+C. */
  readonly confirm?: boolean | undefined;

  /** Cosa risponde `prompt.text`, in ordine: i profili di produzione digitati a mano. */
  readonly typed?: ReadonlyArray<string | undefined>;

  /** Account a cui risolvono le credenziali di ogni profilo. */
  readonly accountId?: string;

  /** Se c'e' un terminale a cui chiedere. Falso in chain, CI e Lambda */
  readonly canPromptUser?: boolean;
}

/** Uno script finto: logger, paths e prompt. */
export function fakeScript(
  outputDirectory?: string,
  options: FakeScriptOptions = {},
): {
  readonly script: GOScript;
  readonly logs: RecordedLogs;
  readonly questions: string[];
} {
  const logs: RecordedLogs = { errors: [], warnings: [], lines: [], sections: [] };
  const questions: string[] = [];
  const typed = [...(options.typed ?? [])];
  const provider = {
    resolveAccountId: async (): Promise<string> => await Promise.resolve(options.accountId ?? '000000000000'),
  };

  const script = {
    aws: { clients: { profileNames: [], first: provider, getClientProvider: () => provider } },
    logger: {
      section: (text: string) => logs.sections.push(text),
      info: (text: string) => logs.lines.push(text),
      text: (text: string) => logs.lines.push(text),
      success: (text: string) => logs.lines.push(text),
      warning: (text: string) => logs.warnings.push(text),
      error: (text: string) => logs.errors.push(text),
    },
    paths: { resolvePath: (name: string) => path.join(outputDirectory ?? os.tmpdir(), name) },
    prompt: {
      text: async (message: string): Promise<string | undefined> => {
        questions.push(message);
        return await Promise.resolve(typed.shift());
      },
      confirm: async (question: string): Promise<boolean | undefined> => {
        questions.push(question);
        return await Promise.resolve(options.confirm);
      },
    },
    environment: { canPromptUser: options.canPromptUser ?? true },
  } as unknown as GOScript;

  return { script, logs, questions };
}
