import type {
  AlertChannel,
  AlertChannelConfig,
  AlertChannelInput,
  AlertDelivery,
  AlertIncident,
} from "@lens/contracts";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { incidentFromRow } from "./alert-store.js";
import type { LensPostgres } from "./index.js";
import { alertChannel, alertDelivery, alertIncident, alertRule, project } from "./schema.js";

export type StoredAlertChannel = AlertChannel & { config: AlertChannelConfig };

const publicColumns = {
  id: alertChannel.id,
  projectId: alertChannel.projectId,
  type: alertChannel.type,
  name: alertChannel.name,
  createdAt: alertChannel.createdAt,
  updatedAt: alertChannel.updatedAt,
};

type AlertChannelRow = typeof alertChannel.$inferSelect;
type AlertDeliveryRow = typeof alertDelivery.$inferSelect;

function channelFromRow(row: Omit<AlertChannelRow, "config" | "createdBy">): AlertChannel {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function storedChannelFromRow(row: AlertChannelRow): StoredAlertChannel {
  return { ...channelFromRow(row), config: row.config };
}

function deliveryFromRow(row: AlertDeliveryRow): AlertDelivery {
  return {
    id: row.id,
    incidentId: row.incidentId,
    channelId: row.channelId,
    channelName: row.channelName,
    channelType: row.channelType,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
  };
}

export function channelConfigFromInput(input: AlertChannelInput): AlertChannelConfig {
  if (input.type === "slack" || input.type === "discord") return { webhookUrl: input.webhookUrl };
  if (input.type === "telegram") return { botToken: input.botToken, chatId: input.chatId };
  return input.secret === undefined ? { url: input.url } : { url: input.url, secret: input.secret };
}

export async function listAlertChannels(
  db: LensPostgres,
  projectId: string,
): Promise<AlertChannel[]> {
  const rows = await db
    .select(publicColumns)
    .from(alertChannel)
    .where(eq(alertChannel.projectId, projectId))
    .orderBy(asc(alertChannel.name));
  return rows.map(channelFromRow);
}

export async function alertChannelCount(db: LensPostgres, projectId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(alertChannel)
    .where(eq(alertChannel.projectId, projectId));
  return Number(row?.total ?? 0);
}

export async function getAlertChannelWithConfig(
  db: LensPostgres,
  projectId: string,
  channelId: string,
): Promise<StoredAlertChannel | undefined> {
  const [row] = await db
    .select()
    .from(alertChannel)
    .where(and(eq(alertChannel.projectId, projectId), eq(alertChannel.id, channelId)))
    .limit(1);
  return row === undefined ? undefined : storedChannelFromRow(row);
}

export async function createAlertChannel(
  db: LensPostgres,
  projectId: string,
  createdBy: string,
  input: AlertChannelInput,
): Promise<AlertChannel> {
  const [row] = await db
    .insert(alertChannel)
    .values({
      projectId,
      type: input.type,
      name: input.name,
      config: channelConfigFromInput(input),
      createdBy,
    })
    .returning(publicColumns);
  if (row === undefined) throw new Error("Alert channel was not created");
  return channelFromRow(row);
}

export async function updateAlertChannel(
  db: LensPostgres,
  projectId: string,
  channelId: string,
  input: AlertChannelInput,
): Promise<AlertChannel | undefined> {
  const [row] = await db
    .update(alertChannel)
    .set({
      type: input.type,
      name: input.name,
      config: channelConfigFromInput(input),
      updatedAt: new Date(),
    })
    .where(and(eq(alertChannel.projectId, projectId), eq(alertChannel.id, channelId)))
    .returning(publicColumns);
  return row === undefined ? undefined : channelFromRow(row);
}

export async function deleteAlertChannel(
  db: LensPostgres,
  projectId: string,
  channelId: string,
): Promise<boolean> {
  const rows = await db
    .delete(alertChannel)
    .where(and(eq(alertChannel.projectId, projectId), eq(alertChannel.id, channelId)))
    .returning({ id: alertChannel.id });
  if (rows.length === 0) return false;
  // Detach from rules so stored rules never reference a dead channel id.
  await db
    .update(alertRule)
    .set({ channelIds: sql`array_remove(${alertRule.channelIds}, ${channelId})` })
    .where(
      and(eq(alertRule.projectId, projectId), sql`${channelId} = any(${alertRule.channelIds})`),
    );
  return true;
}

export async function listAlertChannelsByIds(
  db: LensPostgres,
  projectId: string,
  ids: string[],
): Promise<StoredAlertChannel[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(alertChannel)
    .where(and(eq(alertChannel.projectId, projectId), inArray(alertChannel.id, ids)));
  return rows.map(storedChannelFromRow);
}

export async function createPendingDeliveries(
  db: LensPostgres,
  projectId: string,
  incidentId: string,
  channels: StoredAlertChannel[],
): Promise<AlertDelivery[]> {
  if (channels.length === 0) return [];
  const rows = await db
    .insert(alertDelivery)
    .values(
      channels.map((channel) => ({
        projectId,
        incidentId,
        channelId: channel.id,
        channelName: channel.name, // snapshot: survives channel rename/deletion
        channelType: channel.type,
      })),
    )
    .returning();
  const byChannel = new Map(rows.map((row) => [row.channelId, row]));
  return channels.flatMap((channel) => {
    const row = byChannel.get(channel.id);
    return row === undefined ? [] : [deliveryFromRow(row)];
  });
}

export async function listIncidentDeliveries(
  db: LensPostgres,
  projectId: string,
  incidentId: string,
): Promise<AlertDelivery[]> {
  const rows = await db
    .select()
    .from(alertDelivery)
    .where(and(eq(alertDelivery.projectId, projectId), eq(alertDelivery.incidentId, incidentId)))
    .orderBy(asc(alertDelivery.createdAt));
  return rows.map(deliveryFromRow);
}

export type DeliveryDispatchPayload = {
  delivery: AlertDelivery;
  channel: StoredAlertChannel | null;
  incident: AlertIncident;
  projectName: string;
};

export async function loadDeliveryForDispatch(
  db: LensPostgres,
  deliveryId: string,
): Promise<DeliveryDispatchPayload | undefined> {
  const [row] = await db
    .select({
      delivery: alertDelivery,
      channel: alertChannel,
      incident: alertIncident,
      projectName: project.name,
    })
    .from(alertDelivery)
    .leftJoin(alertChannel, eq(alertChannel.id, alertDelivery.channelId))
    .innerJoin(alertIncident, eq(alertIncident.id, alertDelivery.incidentId))
    .innerJoin(project, eq(project.id, alertDelivery.projectId))
    .where(eq(alertDelivery.id, deliveryId))
    .limit(1);
  if (row === undefined) return undefined;
  return {
    delivery: deliveryFromRow(row.delivery),
    channel: row.channel === null ? null : storedChannelFromRow(row.channel),
    incident: incidentFromRow(row.incident, new Map()),
    projectName: row.projectName,
  };
}

export async function markDeliveryAttempt(
  db: LensPostgres,
  deliveryId: string,
  attempts: number,
  error: string,
): Promise<void> {
  await db.update(alertDelivery).set({ attempts, error }).where(eq(alertDelivery.id, deliveryId));
}

export async function markDeliveryFinished(
  db: LensPostgres,
  deliveryId: string,
  status: "delivered" | "failed",
  attempts: number,
  error: string | null,
): Promise<void> {
  await db
    .update(alertDelivery)
    .set({
      status,
      attempts,
      error,
      ...(status === "delivered" ? { deliveredAt: new Date() } : {}),
    })
    .where(eq(alertDelivery.id, deliveryId));
}
