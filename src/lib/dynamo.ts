import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { PendingUpload, Share } from "@/lib/shares";

function database() {
  const region = process.env.CLOUD_DROP_REGION;
  const table = process.env.CLOUD_DROP_TABLE;
  if (!region || !table) throw new Error("DynamoDB requires CLOUD_DROP_REGION and CLOUD_DROP_TABLE.");
  return { client: DynamoDBDocumentClient.from(new DynamoDBClient({ region })), table };
}

export async function putPending(pending: PendingUpload) {
  const { client, table } = database();
  await client.send(new PutCommand({
    TableName: table,
    Item: { pk: `PENDING#${pending.id}`, ...pending, ttl: Math.floor(new Date(pending.createdAt).getTime() / 1000) + 600 },
    ConditionExpression: "attribute_not_exists(pk)",
  }));
}

export async function readPending(id: string): Promise<PendingUpload | null> {
  const { client, table } = database();
  const result = await client.send(new GetCommand({ TableName: table, Key: { pk: `PENDING#${id}` }, ConsistentRead: true }));
  return result.Item ? result.Item as PendingUpload : null;
}

export async function commitShare(pending: PendingUpload, share: Share) {
  const { client, table } = database();
  await client.send(new TransactWriteCommand({
    TransactItems: [
      { Put: { TableName: table, Item: { pk: `SHARE#${share.id}`, ...share, ttl: Math.floor(new Date(share.expiresAt).getTime() / 1000) }, ConditionExpression: "attribute_not_exists(pk)" } },
      { Delete: { TableName: table, Key: { pk: `PENDING#${pending.id}` }, ConditionExpression: "attribute_exists(pk)" } },
    ],
  }));
}

export async function readShare(id: string): Promise<Share | null> {
  const { client, table } = database();
  const result = await client.send(new GetCommand({ TableName: table, Key: { pk: `SHARE#${id}` }, ConsistentRead: true }));
  return result.Item ? result.Item as Share : null;
}
