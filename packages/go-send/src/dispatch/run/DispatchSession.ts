import { GORateLimiter } from '@go-automation/go-common/core';

import { DispatchError } from '../DispatchError.js';
import { DocumentResolver } from '../documents/DocumentResolver.js';
import { LocalDocumentInspector } from '../documents/LocalDocumentInspector.js';
import { UploadStage } from '../documents/UploadStage.js';
import { assertProductionCoherence, runEnvironmentPreflight } from '../environment/runEnvironmentPreflight.js';
import type { PreflightInput } from '../environment/PreflightInput.js';
import type { PreflightReport } from '../environment/PreflightReport.js';
import { InputReader } from '../input/InputReader.js';
import { Journal } from '../journal/Journal.js';
import { ObservedSink } from '../journal/ObservedSink.js';
import type { JournalSink } from '../journal/JournalSink.js';
import { RowLedger } from '../journal/RowLedger.js';
import { RecordFactory } from '../mapping/RecordFactory.js';
import type { DispatchClock } from '../model/DispatchClock.js';
import type { DocumentRef } from '../model/DocumentRef.js';
import { SystemClock } from '../model/SystemClock.js';
import { RateAdapter } from '../stages/RateAdapter.js';
import { SendStage } from '../stages/SendStage.js';
import { VerifyStage } from '../stages/VerifyStage.js';
import type { GlobalErrorHandler } from '../stages/GlobalErrorHandler.js';
import { RequestIdStage } from '../requestId/RequestIdStage.js';
import type { B2BApi } from '../channels/B2BApi.js';
import { DirectSendStage } from '../direct/DirectSendStage.js';
import type { DirectModeOptions } from './DirectModeOptions.js';
import { DispatchRun } from './DispatchRun.js';
import type { DispatchProgress } from './DispatchProgress.js';
import type { DispatchSessionOptions } from './DispatchSessionOptions.js';
import { materializeRun } from './materializeRun.js';
import { hashFileHex, writeRunInfo } from './runFiles.js';
import { runValidationPass } from './runValidationPass.js';
import type { FailureGroup } from './FailureGroup.js';
import type { SendStatistics } from './SendStatistics.js';
import { groupFailures, sendStatistics } from './summarizeLedger.js';
import type { ValidationSummary } from './ValidationSummary.js';

/** Priorities of the shared B2B limiter (§10.2). */
const PRIORITIES = 2;

/**
 * One dispatch run, wired from resolved options. The script drives it:
 *
 * ```
 * const session = await DispatchSession.open(options);
 * await session.preflight(input);    // groups (skipped in a dry run)
 * await session.prepareDocuments();  // shared document: inspect + upload once
 * const summary = await session.validate();
 * // …show the plan, ask for confirmation…
 * await session.execute();           // send + verify, until done or stop()
 * await session.materialize();
 * await session.close();
 * ```
 *
 * All B2B calls share one rate limiter (priority 0: preflight, preload, send;
 * priority 1: verify). The journal is written only outside dry runs.
 */
export class DispatchSession {
  private readonly controller = new AbortController();
  private readonly limiter: GORateLimiter;
  private readonly rateAdapter: RateAdapter;
  private readonly inspector = new LocalDocumentInspector();
  private readonly factory: RecordFactory;
  private readonly uploadStage: UploadStage | undefined;
  private sharedRefs: ReadonlyArray<DocumentRef> | undefined;
  private verifyStage: VerifyStage | undefined;
  private requestIdStage: RequestIdStage | undefined;
  private globalError: DispatchError | undefined;

  private constructor(
    private readonly options: DispatchSessionOptions,
    private readonly clock: DispatchClock,
    private readonly ledger: RowLedger,
    private readonly journal: Journal | undefined,
  ) {
    this.limiter = new GORateLimiter({
      ratePerSecond: options.tuning.rate,
      burst: options.tuning.burst,
      priorities: PRIORITIES,
      sleeper: clock,
      now: (): number => clock.now(),
    });
    this.rateAdapter = new RateAdapter(this.limiter, options.tuning.rate, clock, options.tuning.rateAdaptive);
    this.factory = new RecordFactory({
      profile: options.profile,
      cliValues: options.cliValues,
      environmentValues: options.environmentValues,
      ...(options.rowKeyColumn !== undefined && { rowKeyColumn: options.rowKeyColumn }),
      ...(options.direct !== undefined && {
        direct: { runId: options.runId, template: options.direct.requestIdTemplate },
      }),
      context: {
        mode: options.mode ?? 'e2e',
        documentsDir: options.documentsDir,
        sharedDocumentAvailable: options.sharedDocument !== undefined,
        ...(options.attachmentsByPratica !== undefined && {
          knownPratiche: new Set(options.attachmentsByPratica.keys()),
        }),
        ...(options.environmentSenderTaxId !== undefined && {
          environmentSenderTaxId: options.environmentSenderTaxId,
        }),
      },
    });
    this.uploadStage =
      options.dryRun || options.gateway === undefined
        ? undefined
        : new UploadStage({
            gateway: options.gateway,
            limiter: this.limiter,
            ledger,
            clock,
            batchSize: options.tuning.preloadBatchSize,
            uploadConcurrency: options.tuning.uploadConcurrency,
            reuseMaxAgeMs: options.tuning.uploadReuseMaxAgeMs,
            previousUploads: ledger.recordedUploads(),
          });
  }

  /**
   * Opens a session: writes `run.json` and a new journal segment (paths from
   * the caller, resolved through GOPaths) and, on resume, replays the
   * segments of the previous sessions. A resume with a different input file
   * stops.
   *
   * @param options - Resolved options
   * @returns The session
   */
  public static async open(options: DispatchSessionOptions): Promise<DispatchSession> {
    const clock = options.clock ?? new SystemClock();
    const now = (): Date => new Date(clock.now());
    if (options.dryRun) {
      return new DispatchSession(options, clock, new RowLedger(observe(undefined, options), now), undefined);
    }

    const inputSha256 = await hashFileHex(options.input.filePath);
    const previous = options.previousRun;
    if (previous !== undefined && previous.inputSha256 !== inputSha256) {
      throw new DispatchError(
        'RESUME_INPUT_CHANGED',
        `the input file changed since run ${previous.runId}: resume refused`,
      );
    }
    const entries = previous === undefined ? [] : await Journal.read(previous.journalFiles);
    await writeRunInfo(options.files.runInfoPath, {
      runId: options.runId,
      createdAt: now().toISOString(),
      inputPath: options.input.filePath,
      inputSha256,
      journalFiles: [...(previous?.journalFiles ?? []), options.files.journalPath],
      ...(options.previousRunInfoPath !== undefined && { resumedFrom: options.previousRunInfoPath }),
      parameters: options.parameters,
    });
    const journal = await Journal.open(options.files.journalPath);
    const ledger = RowLedger.replay(entries, observe(journal, options), now);
    return new DispatchSession(options, clock, ledger, journal);
  }

  /**
   * Checks API key and group (§7.4.3). Skipped in a dry run, which makes no
   * call at all; the production-host check still runs.
   *
   * @param input - Base path, production flag and group to check
   * @returns The preflight report, or `undefined` in a dry run
   */
  public async preflight(input: PreflightInput): Promise<PreflightReport | undefined> {
    if (this.options.dryRun) {
      assertProductionCoherence(input);
      return undefined;
    }
    const api = this.b2b();
    return runEnvironmentPreflight(input, async () => {
      await this.limiter.acquire(0);
      return api.groups();
    });
  }

  /**
   * Prepares the shared document once (inspection, and upload outside dry runs).
   *
   * @returns The shared references, if the run has a shared document
   */
  public async prepareDocuments(): Promise<ReadonlyArray<DocumentRef> | undefined> {
    if (this.options.sharedDocument === undefined) return undefined;
    this.sharedRefs = await DocumentResolver.prepareShared(
      this.options.sharedDocument,
      this.inspector,
      this.uploadStage,
      this.options.dryRun,
    );
    return this.sharedRefs;
  }

  /**
   * Validation pass (no call): maps, validates and inspects every row.
   *
   * @returns Figures for the send plan
   * @throws DispatchError `CONFIGURATION` when rows have files to upload and
   *   no SafeStorage gateway is configured (outside a dry run)
   */
  public async validate(): Promise<ValidationSummary> {
    const summary = await runValidationPass({
      reader: this.reader(),
      factory: this.factory,
      inspector: this.inspector,
      ledger: this.ledger,
      runId: this.options.runId,
      presetMode: !this.options.send,
    });
    if (!this.options.dryRun && this.options.send && summary.rowFiles > 0 && this.uploadStage === undefined) {
      throw new DispatchError(
        'CONFIGURATION',
        `${summary.rowFiles} row files must be uploaded but the SafeStorage gateway is not configured`,
      );
    }
    return summary;
  }

  /**
   * Sends (and verifies) the valid rows until every row is concluded, the
   * session is stopped, or a global error occurs.
   *
   * @throws DispatchError when a global error stopped the run
   */
  public async execute(): Promise<void> {
    if (this.options.dryRun) throw new DispatchError('DRY_RUN', 'execute() is not available in a dry run');
    const onGlobalError = (error: DispatchError): void => {
      this.globalError ??= error;
      this.controller.abort();
    };
    const requestIdStage = this.createRequestIdStage();
    this.requestIdStage = requestIdStage;
    const verifyStage = this.options.verify
      ? new VerifyStage({
          api: this.b2b(),
          limiter: this.limiter,
          ledger: this.ledger,
          clock: this.clock,
          apiVersion: this.options.apiVersion,
          initialDelayMs: this.options.tuning.verifyInitialDelayMs,
          timeoutMs: this.options.tuning.verifyTimeoutMs,
          onGlobalError,
          ...(requestIdStage !== undefined && {
            onAccepted: (rowIndex: number, rowKey: string, iun: string): void => {
              requestIdStage.schedule(rowIndex, rowKey, iun);
            },
          }),
          signal: this.controller.signal,
        })
      : undefined;
    this.verifyStage = verifyStage;
    const sendStage = this.options.send
      ? this.options.mode === 'direct'
        ? this.createDirectSendStage(onGlobalError)
        : this.createSendStage(verifyStage, requestIdStage, onGlobalError)
      : undefined;
    await new DispatchRun({
      reader: this.reader(),
      factory: this.factory,
      ledger: this.ledger,
      ...(sendStage !== undefined && { sendStage }),
      ...(verifyStage !== undefined && { verifyStage }),
      ...(requestIdStage !== undefined && { requestIdStage }),
      maxInFlight: this.options.tuning.maxInFlight,
      retryFailed: this.options.tuning.retryFailed,
      retryUncertain: this.options.tuning.retryUncertain,
      failFast: this.options.tuning.failFast,
      controller: this.controller,
    }).execute();
    if (this.globalError !== undefined) throw this.globalError;
  }

  /**
   * Checks that the timeline table can be read (one query on a fake IUN),
   * before any send. Skipped in a dry run and without the requestId phase.
   *
   * @throws The AWS error (credentials, permissions)
   */
  public async checkTimelines(): Promise<void> {
    if (this.options.dryRun || this.options.requestId === undefined) return;
    await this.options.requestId.source.query('AAAA-AAAA-AAAA-000000-A-0');
  }

  /**
   * Checks that pn-external-channels answers through the tunnel (§9.1),
   * before any send. Skipped in a dry run.
   *
   * @throws The transport error (tunnel closed, wrong port)
   */
  public async checkExternalChannels(): Promise<void> {
    if (this.options.dryRun) return;
    await this.directOptions().api.healthCheck();
  }

  /** Whether the requestId phase stopped because the AWS credentials expired. */
  public get requestIdCredentialsExpired(): boolean {
    return this.requestIdStage?.credentialsExpired ?? false;
  }

  /** Stops the run: no new call starts; calls in flight complete and are journaled. */
  public stop(): void {
    this.controller.abort();
  }

  /** Whether {@link stop} was called or a global error stopped the run. */
  public get stopped(): boolean {
    return this.controller.signal.aborted;
  }

  /** Writes output and report from the current state (also after a stop). */
  public async materialize(): Promise<void> {
    const output = this.options.output;
    const rowKeyColumn = this.options.rowKeyColumn ?? this.options.profile.rowKeyColumn;
    await materializeRun({
      reader: this.reader(),
      ledger: this.ledger,
      format: output.format,
      ...(output.delimiter !== undefined && { delimiter: output.delimiter }),
      outputPath: output.outputPath,
      reportPath: output.reportPath,
      ...(output.outputColumns !== undefined && { outputColumns: output.outputColumns }),
      ...(rowKeyColumn !== undefined && { rowKeyColumn }),
      includeStatus: output.includeStatus,
      onlySuccess: output.onlySuccess,
      unsentStatus: this.options.dryRun ? 'DRY_RUN' : 'PENDING',
    });
  }

  /** Snapshot for the progress line. */
  public progress(): DispatchProgress {
    return {
      byStatus: this.ledger.countByStatus(),
      ratePerSecond: this.limiter.ratePerSecond,
      throttled: this.rateAdapter.throttledCount,
      verifyPending: this.verifyStage?.pendingCount ?? 0,
      requestIdPending: this.requestIdStage?.pendingCount ?? 0,
      queuedCalls: this.limiter.stats.queued,
    };
  }

  /**
   * Rows with an error, grouped by code (largest first).
   *
   * @param sample - Row keys kept per group (default 5)
   * @returns Failure groups
   */
  public failures(sample: number = 5): ReadonlyArray<FailureGroup> {
    return groupFailures(this.ledger.values(), sample);
  }

  /** Timing of the send phase. */
  public sendStatistics(): SendStatistics {
    return sendStatistics(this.ledger.values());
  }

  /** Closes the journal. */
  public async close(): Promise<void> {
    await this.journal?.close();
  }

  private createRequestIdStage(): RequestIdStage | undefined {
    const settings = this.options.requestId;
    if (settings === undefined) return undefined;
    return new RequestIdStage({
      source: settings.source,
      ledger: this.ledger,
      clock: this.clock,
      selection: settings.selection,
      initialDelayMs: settings.initialDelayMs,
      timeoutMs: settings.timeoutMs,
      concurrency: settings.concurrency,
      isCredentialError: settings.isCredentialError,
      signal: this.controller.signal,
    });
  }

  private createSendStage(
    verifyStage: VerifyStage | undefined,
    requestIdStage: RequestIdStage | undefined,
    onGlobalError: GlobalErrorHandler,
  ): SendStage {
    return new SendStage({
      api: this.b2b(),
      limiter: this.limiter,
      rateAdapter: this.rateAdapter,
      ledger: this.ledger,
      clock: this.clock,
      resolver: this.resolver(),
      runId: this.options.runId,
      apiVersion: this.options.apiVersion,
      retryAmbiguous: this.options.tuning.retryAmbiguous,
      sendTimeoutMs: this.options.tuning.sendTimeoutMs,
      onSent: (rowIndex, rowKey, notificationRequestId): void => {
        if (verifyStage !== undefined) {
          verifyStage.schedule(rowIndex, rowKey, notificationRequestId);
          return;
        }
        const iun = this.ledger.get(rowIndex)?.iun;
        if (iun !== undefined) requestIdStage?.schedule(rowIndex, rowKey, iun);
      },
      onGlobalError,
      signal: this.controller.signal,
    });
  }

  private createDirectSendStage(onGlobalError: GlobalErrorHandler): DirectSendStage {
    return new DirectSendStage({
      api: this.directOptions().api,
      limiter: this.limiter,
      ledger: this.ledger,
      clock: this.clock,
      resolver: this.resolver(),
      onGlobalError,
      signal: this.controller.signal,
    });
  }

  private b2b(): B2BApi {
    if (this.options.api === undefined) throw new DispatchError('CONFIGURATION', 'the SEND B2B API is not configured');
    return this.options.api;
  }

  private directOptions(): DirectModeOptions {
    if (this.options.direct === undefined) {
      throw new DispatchError('CONFIGURATION', 'direct mode requires pn-external-channels settings');
    }
    return this.options.direct;
  }

  private reader(): InputReader {
    return new InputReader(this.options.input);
  }

  private resolver(): DocumentResolver {
    return new DocumentResolver({
      inspector: this.inspector,
      placeholders: this.options.dryRun,
      ...(this.sharedRefs !== undefined && { shared: this.sharedRefs }),
      ...(this.options.attachmentsByPratica !== undefined && {
        attachmentsByPratica: this.options.attachmentsByPratica,
      }),
      ...(this.uploadStage !== undefined && { uploadStage: this.uploadStage }),
    });
  }
}

function observe(journal: JournalSink | undefined, options: DispatchSessionOptions): JournalSink | undefined {
  return options.onTransition === undefined ? journal : new ObservedSink(journal, options.onTransition);
}
