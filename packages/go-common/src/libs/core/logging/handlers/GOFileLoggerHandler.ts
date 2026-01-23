/**
 * File Logger Handler
 * Saves log events to a file using streaming export
 */
import { GOFileListExporter } from '../../exporters/file/GOFileListExporter.js';
import type { GOListExporterStreamWriter } from '../../exporters/GOListExporterStreamWriter.js';
import { GOPaths } from '../../utils/GOPaths.js';
import { GOLogEvent } from '../GOLogEvent.js';
import type { GOLoggerHandler } from '../GOLoggerHandler.js';

import { GOFileLoggerStyle } from './GOFileLoggerStyle.js';

/**
 * File logger handler with streaming support
 */
export class GOFileLoggerHandler implements GOLoggerHandler {
  private style: GOFileLoggerStyle;
  private readonly exporter: GOFileListExporter;
  private writer?: GOListExporterStreamWriter<string> | undefined;
  private isInitialized: boolean = false;
  private isInitializing: boolean = false;
  private isClosing: boolean = false;
  private eventQueue: GOLogEvent[] = [];
  private writeQueue: Promise<void> = Promise.resolve(); // Sequential write queue

  constructor(paths: GOPaths, style?: GOFileLoggerStyle, outputPath?: string) {
    this.style = style ?? new GOFileLoggerStyle();

    // Get output path from GOPaths if not provided
    const logPath = outputPath ?? paths.getExecutionLogFilePath();
    this.exporter = new GOFileListExporter({ outputPath: logPath, encoding: 'utf8', skipInvalidItems: false });
  }

  /**
   * Initialize the stream writer
   */
  private async initialize(): Promise<void> {
    if (!this.isInitialized && !this.isInitializing) {
      this.isInitializing = true;
      this.writer = await this.exporter.exportStream();
      this.isInitialized = true;
      this.isInitializing = false;

      // Flush queued events in order
      while (this.eventQueue.length > 0) {
        const queuedEvent = this.eventQueue.shift();
        if (queuedEvent) {
          this.writeEvent(queuedEvent);
        }
      }

      // Wait for all queued events to be written before returning
      // This ensures initial logs are written before new logs come in
      await this.writeQueue.catch(() => {
        /* Ignore errors during flush */
        console.error('Error while flushing initial log events to file');
      });
    }
  }

  /**
   * Handle a log event and write to file
   */
  public handle(event: GOLogEvent): void {
    // Reject new logs if we're closing
    if (this.isClosing) {
      return;
    }

    // If not initialized, queue the event and start initialization if needed
    if (!this.isInitialized) {
      this.eventQueue.push(event);

      // Start initialization if not already started
      if (!this.isInitializing) {
        this.initialize().catch(error => {
          console.error('Failed to initialize file logger:', error);
        });
      }
    } else {
      // Already initialized, write directly
      this.writeEvent(event);
    }
  }

  /**
   * Write a log event to file
   * Uses a sequential queue to prevent race conditions and ensure logs are written in order
   */
  private writeEvent(event: GOLogEvent): void {
    if (!this.writer) {
      console.error('File logger writer not initialized');
      return;
    }

    const formatted = this.style.format(event);

    // Capture writer reference to avoid race condition if this.writer becomes undefined
    const writer = this.writer;

    // Chain the write operation to the queue to ensure sequential execution
    this.writeQueue = this.writeQueue
      .then(async () => {
        await writer.append(formatted);
      })
      .catch(error => {
        console.error('Failed to write log to file:', error);
      });
  }

  /**
   * Reset the handler (closes and reopens the file)
   * Properly awaits pending operations before resetting state
   */
  public async reset(): Promise<void> {
    // If already closing, wait for close to complete
    if (this.isClosing) {
      return;
    }

    if (this.writer) {
      this.isClosing = true;

      // Capture writer reference before clearing
      const writerToClose = this.writer;

      try {
        // Wait for all pending writes to complete
        await this.writeQueue.catch(() => {
          /* Ignore write errors, we're resetting anyway */
        });

        // Now close the writer
        await writerToClose.close();
      } catch (error) {
        console.error('Failed to close log file during reset:', error);
      }

      // Only reset state AFTER async operations complete
      this.writer = undefined;
      this.isInitialized = false;
      this.isInitializing = false;
      this.eventQueue = [];
      this.writeQueue = Promise.resolve();
      this.isClosing = false; // Reset at the END, after everything is done
    }
  }

  /**
   * Close the log file
   * Waits for all pending writes to complete before closing
   */
  public async close(): Promise<void> {
    if (this.writer) {
      // Mark as closing to reject new logs
      this.isClosing = true;

      // Wait for all pending writes to complete
      await this.writeQueue.catch(() => { /* Ignore errors, we're closing anyway */ });

      // Now close the writer
      await this.writer.close();
      this.writer = undefined;
      this.isInitialized = false;
      this.isInitializing = false;
      this.eventQueue = [];
      this.writeQueue = Promise.resolve(); // Reset the queue
      // Keep isClosing = true, don't reset it
    }
  }

  /**
   * Get current style configuration
   */
  public getStyle(): GOFileLoggerStyle {
    return this.style;
  }

  /**
   * Set custom style configuration
   */
  public setStyle(style: GOFileLoggerStyle): void {
    this.style = style;
  }
}
