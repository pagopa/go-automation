/**
 * DynamoDB attribute value a runbook can write in a key condition, without SDK types.
 *
 * It is the subset of the SDK `AttributeValue` that runbooks use. Like the SDK
 * union, it is exclusive: each member forbids the other members' properties
 * (`?: never`), so `{ S: 'a', N: '1' }` does not compile. Each member is
 * assignable to the corresponding SDK member.
 */
export type RunbookDynamoDBAttributeValue =
  | { readonly S: string; readonly N?: never; readonly BOOL?: never; readonly NULL?: never }
  | { readonly S?: never; readonly N: string; readonly BOOL?: never; readonly NULL?: never }
  | { readonly S?: never; readonly N?: never; readonly BOOL: boolean; readonly NULL?: never }
  | { readonly S?: never; readonly N?: never; readonly BOOL?: never; readonly NULL: true };
