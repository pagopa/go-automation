/**
 * Extracts and validates DynamoDB table/index key schema information.
 */

import { AWS } from '@go-automation/go-common';

/**
 * Schema information for a DynamoDB table or index.
 */
interface SchemaInfo {
  readonly partitionKey: string;
  readonly sortKey: string | undefined;
}

/**
 * Extracts schema info (PK and optionally SK) for the table or specified index.
 *
 * @param table - DynamoDB table description (via go-common to avoid direct AWS SDK dependency)
 * @param indexName - Optional GSI/LSI name; omit for the base table
 * @returns Schema info with partition key and optional sort key
 * @throws If the index or key schema is not found
 */
export function getSchemaInfo(table: AWS.TableDescription, indexName?: string): SchemaInfo {
  let keySchema = table.KeySchema;

  if (indexName) {
    const gsi = table.GlobalSecondaryIndexes?.find((i) => i.IndexName === indexName);
    const lsi = table.LocalSecondaryIndexes?.find((i) => i.IndexName === indexName);
    const index = gsi ?? lsi;

    if (!index) {
      throw new Error(`Index ${indexName} not found in table description`);
    }
    keySchema = index.KeySchema;
  }

  if (!keySchema) {
    throw new Error(`No key schema found for ${indexName ? `index ${indexName}` : 'table'}`);
  }

  const pk = keySchema.find((k) => k.KeyType === 'HASH')?.AttributeName;
  const sk = keySchema.find((k) => k.KeyType === 'RANGE')?.AttributeName;

  if (!pk) {
    throw new Error(`Could not find partition key in ${indexName ? `index ${indexName}` : 'table'} schema`);
  }

  return { partitionKey: pk, sortKey: sk };
}

/**
 * Validates that the script configuration matches the actual table schema.
 *
 * @param schema - Schema info from getSchemaInfo
 * @param tableKey - Configured partition key name
 * @param tableSortKey - Configured sort key name (optional)
 * @param tableSortValue - Configured sort key value (optional)
 * @throws If the configuration does not match the schema
 */
export function validateSchemaConfig(
  schema: SchemaInfo,
  tableKey: string,
  tableSortKey?: string,
  tableSortValue?: string,
): void {
  if (tableKey !== schema.partitionKey) {
    throw new Error(`Configured table.key (${tableKey}) does not match schema partition key (${schema.partitionKey})`);
  }

  if (schema.sortKey && (!tableSortKey || !tableSortValue)) {
    throw new Error(
      `Table/Index requires a sort key (${schema.sortKey}), but table.sort-key or table.sort-value is missing`,
    );
  }

  if (tableSortKey && tableSortKey !== schema.sortKey) {
    throw new Error(
      `Configured table.sort-key (${tableSortKey}) does not match schema sort key (${schema.sortKey ?? 'none'})`,
    );
  }
}
