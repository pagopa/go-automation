/**
 * SEND Timeline Service - Handles DynamoDB operations for timeline retrieval
 */

import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { QueryCommand } from '@aws-sdk/client-dynamodb';
import type { QueryCommandInput, QueryCommandOutput } from '@aws-sdk/client-dynamodb';

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
 * const timelineService = new SEND.SENDTimelineService(script.aws.dynamoDB);
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

    const command: QueryCommand = new QueryCommand(input);
    const response: QueryCommandOutput = await this.client.send(command);

    const items = (response.Items ?? []) as ReadonlyArray<DynamoDBTimelineItem>;

    return this.buildTimelineResult(parsedIun, items);
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
    onProgress?: (current: number, total: number) => void,
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

    // Sort timeline elements by timestamp
    timelineElements.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      iun: parsedIun.iun,
      paId,
      notificationSentAt,
      timeline: timelineElements,
    };
  }
}
