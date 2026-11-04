/**
 * SEND Timeline Service - Handles DynamoDB operations for timeline retrieval
 */

import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { QueryCommand } from '@aws-sdk/client-dynamodb';
import type { AttributeValue, QueryCommandInput, QueryCommandOutput } from '@aws-sdk/client-dynamodb';

import type { SENDParsedIun } from './models/SENDParsedIun.js';
import type { SENDTimelineElement } from './models/SENDTimelineElement.js';
import type { SENDTimelineResult } from './models/SENDTimelineResult.js';

/** Hardcoded table name for pn-Timelines */
const TIMELINES_TABLE_NAME = 'pn-Timelines';

/** Chunk size for concurrent requests */
const CHUNK_SIZE = 10;

/**
 * DynamoDB item structure for timeline elements
 */
interface DynamoDBTimelineItem {
  readonly iun?: { readonly S?: string };
  readonly paId?: { readonly S?: string };
  readonly timelineElementId?: { readonly S?: string };
  readonly category?: { readonly S?: string };
  readonly timestamp?: { readonly S?: string };
  readonly notificationSentAt?: { readonly S?: string };
}

type SENDTimelineProgressHandler = (current: number, total: number) => void;

/** Fractional seconds of an ISO 8601 timestamp (any precision). */
const FRACTION_PATTERN = /\.(\d+)/;

/** Digits of the normalized fraction: nanoseconds. */
const FRACTION_DIGITS = 9;

/** A timeline element with its precomputed sort key. */
interface SortableTimelineElement {
  readonly element: SENDTimelineElement;
  readonly epochMs: number;
  readonly fraction: string;
}

/**
 * Sorts timeline elements chronologically, then by id. Timestamps are
 * compared as instants, not as strings (`…:30.5Z` is after `…:30Z`), with
 * sub-millisecond digits as a tie-break; unparsable timestamps go last.
 * Keys are computed once per element: O(N log N).
 *
 * @param elements - Elements to sort
 * @returns A new sorted array
 */
function sortTimelineElements(elements: ReadonlyArray<SENDTimelineElement>): SENDTimelineElement[] {
  const sortable: SortableTimelineElement[] = elements.map((element) => {
    const parsed = Date.parse(element.timestamp);
    return {
      element,
      epochMs: Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed,
      fraction: (FRACTION_PATTERN.exec(element.timestamp)?.[1] ?? '').padEnd(FRACTION_DIGITS, '0'),
    };
  });
  sortable.sort((a, b) => {
    if (a.epochMs !== b.epochMs) return a.epochMs < b.epochMs ? -1 : 1;
    return (
      a.fraction.localeCompare(b.fraction) ||
      a.element.timestamp.localeCompare(b.element.timestamp) ||
      a.element.timelineElementId.localeCompare(b.element.timelineElementId)
    );
  });
  return sortable.map((item) => item.element);
}

/**
 * Service for interacting with AWS DynamoDB to retrieve SEND notification timelines.
 *
 * Receives a pre-configured DynamoDBClient from AWSClientProvider.
 * The client lifecycle is managed by GOScript, not by this service.
 *
 * @example
 * ```typescript
 * import { SEND } from '@go-automation/go-common';
 *
 * const timelineService = new SEND.SENDTimelineService(script.aws.clients.dynamoDB);
 * const results = await timelineService.queryTimelines(parsedIuns);
 * ```
 */
export class SENDTimelineService {
  constructor(private readonly client: DynamoDBClient) {}

  /**
   * Queries the timeline for a single IUN from DynamoDB
   *
   * @param parsedIun - Parsed IUN with optional date filter
   * @returns SENDTimelineResult for the IUN
   *
   * @example
   * ```typescript
   * const result = await service.queryTimeline({ iun: 'ABC-123', dateFilter: null });
   * ```
   */
  async queryTimeline(parsedIun: SENDParsedIun): Promise<SENDTimelineResult> {
    const input: QueryCommandInput = {
      TableName: TIMELINES_TABLE_NAME,
      KeyConditionExpression: 'iun = :val',
      ExpressionAttributeValues: {
        ':val': { S: parsedIun.iun },
      },
    };

    const items = await this.queryAllPages(input);
    return this.buildTimelineResult(parsedIun, items);
  }

  /**
   * Queries only `timelineElementId`, `category` and `timestamp` of the
   * timeline of an IUN (all pages), sorted by timestamp.
   *
   * Lighter than {@link queryTimeline}: used by polling loops that check the
   * timeline many times (e.g. the requestId stage of `Dispatch`).
   *
   * @param iun - Notification IUN
   * @returns Timeline elements sorted by instant (not by string), then by id
   */
  async queryTimelineElements(iun: string): Promise<ReadonlyArray<SENDTimelineElement>> {
    const items = await this.queryAllPages({
      TableName: TIMELINES_TABLE_NAME,
      KeyConditionExpression: 'iun = :val',
      ExpressionAttributeValues: { ':val': { S: iun } },
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ProjectionExpression: 'timelineElementId, category, #ts',
    });
    const elements: SENDTimelineElement[] = [];
    for (const item of items) {
      const timelineElementId = item.timelineElementId?.S;
      const category = item.category?.S;
      const timestamp = item.timestamp?.S;
      if (timelineElementId && category && timestamp) elements.push({ timelineElementId, category, timestamp });
    }
    return sortTimelineElements(elements);
  }

  /**
   * Runs a query following `LastEvaluatedKey` until the last page.
   */
  private async queryAllPages(input: QueryCommandInput): Promise<ReadonlyArray<DynamoDBTimelineItem>> {
    const items: DynamoDBTimelineItem[] = [];
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;
    do {
      const command: QueryCommand = new QueryCommand({
        ...input,
        ...(exclusiveStartKey !== undefined && { ExclusiveStartKey: exclusiveStartKey }),
      });
      const response: QueryCommandOutput = await this.client.send(command);
      items.push(...((response.Items ?? []) as ReadonlyArray<DynamoDBTimelineItem>));
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);
    return items;
  }

  /**
   * Queries timelines for multiple IUNs with concurrent chunked requests
   *
   * Uses Promise.all with chunking for controlled concurrency (10 concurrent requests).
   * Complexity: O(N) where N is the number of IUNs
   *
   * @param parsedIuns - Array of parsed IUNs to query
   * @param onProgress - Optional callback for progress updates
   * @returns Array of SENDTimelineResult objects
   *
   * @example
   * ```typescript
   * const results = await service.queryTimelines(parsedIuns, (current, total) => {
   *   console.log(`Processed ${current}/${total}`);
   * });
   * ```
   */
  async queryTimelines(
    parsedIuns: ReadonlyArray<SENDParsedIun>,
    onProgress?: SENDTimelineProgressHandler,
  ): Promise<ReadonlyArray<SENDTimelineResult>> {
    const total = parsedIuns.length;
    const results: SENDTimelineResult[] = [];
    let processed = 0;

    // Process in chunks of CHUNK_SIZE
    for (let i = 0; i < parsedIuns.length; i += CHUNK_SIZE) {
      const chunk = parsedIuns.slice(i, i + CHUNK_SIZE);

      const chunkResults = await Promise.all(chunk.map(async (parsedIun) => this.queryTimeline(parsedIun)));

      results.push(...chunkResults);
      processed += chunk.length;

      if (onProgress) {
        onProgress(processed, total);
      }
    }

    return results;
  }

  /**
   * Builds a SENDTimelineResult from DynamoDB items
   *
   * @param parsedIun - The parsed IUN being processed
   * @param items - Raw DynamoDB items
   * @returns Formatted SENDTimelineResult
   */
  private buildTimelineResult(
    parsedIun: SENDParsedIun,
    items: ReadonlyArray<DynamoDBTimelineItem>,
  ): SENDTimelineResult {
    const timelineElements: SENDTimelineElement[] = [];
    let paId: string | null = null;
    let notificationSentAt: string | null = null;

    for (const item of items) {
      // Extract paId from first item
      if (paId === null && item.paId?.S) {
        paId = item.paId.S;
      }

      // Extract notificationSentAt
      if (item.notificationSentAt?.S) {
        notificationSentAt = item.notificationSentAt.S;
      }

      const timelineElementId = item.timelineElementId?.S;
      const category = item.category?.S;
      const timestamp = item.timestamp?.S;

      // Skip if missing required fields
      if (!timelineElementId || !category || !timestamp) {
        continue;
      }

      // Apply date filter if present
      if (parsedIun.dateFilter) {
        const itemDate = timestamp.substring(0, 10);
        const filterDate = parsedIun.dateFilter.substring(0, 10);

        // Skip items older than the filter date
        if (itemDate < filterDate) {
          continue;
        }
      }

      timelineElements.push({
        timelineElementId,
        category,
        timestamp,
      });
    }

    return {
      iun: parsedIun.iun,
      paId,
      notificationSentAt,
      timeline: sortTimelineElements(timelineElements),
    };
  }
}
