import { pool } from "../db/pool.js";
import { emitToUser } from "../realtime/socket.js";
import { sendNotificationEmail } from "./email.service.js";
import { sendBrowserPush } from "./webPush.service.js";

export const NOTIFICATION_TYPES = Object.freeze([
  "PARCEL_ARRIVAL",
  "PARCEL_OVERDUE",
  "DISPUTE_UPDATED"
]);

const NOTIFICATION_TYPE_SET = new Set(NOTIFICATION_TYPES);
const ROLE_NOTIFICATION_POLICY = Object.freeze({
  RESIDENT: Object.freeze({
    notificationTypes: NOTIFICATION_TYPES,
    optionalChannels: Object.freeze([
      "email_enabled",
      "browser_push_enabled"
    ])
  }),
  ADMIN: Object.freeze({
    notificationTypes: Object.freeze(["DISPUTE_UPDATED"]),
    optionalChannels: Object.freeze(["email_enabled", "browser_push_enabled"])
  }),
  GUARD: Object.freeze({
    notificationTypes: Object.freeze(["DISPUTE_UPDATED"]),
    optionalChannels: Object.freeze(["email_enabled", "browser_push_enabled"])
  }),
  SUPER_ADMIN: Object.freeze({
    notificationTypes: Object.freeze(["DISPUTE_UPDATED"]),
    optionalChannels: Object.freeze(["email_enabled", "browser_push_enabled"])
  })
});
const MAX_NOTIFICATION_TITLE_LENGTH = 160;
const MAX_NOTIFICATION_MESSAGE_LENGTH = 1000;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value || ""
  );
}

function normalizeText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function normalizeEmailSubject(value) {
  return typeof value === "string"
    ? value.replace(/[\r\n]+/g, " ").trim().slice(0, 200)
    : "";
}

function toPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

function toSafeNotification(row) {
  return {
    notification_id: row.notification_id,
    type: row.type,
    title: row.title,
    message: row.message,
    related_parcel_id: row.related_parcel_id,
    is_read: Boolean(row.is_read),
    read_at: row.read_at,
    created_at: row.created_at
  };
}

function getRoleNotificationPolicy(role) {
  return ROLE_NOTIFICATION_POLICY[role] || null;
}

function toSafePreference(row) {
  return {
    notification_type: row.notification_type,
    in_app_enabled: true,
    email_enabled: Boolean(row.email_enabled),
    browser_push_enabled: Boolean(row.browser_push_enabled)
  };
}

async function getNotificationRecipient(userId, client = pool) {
  const result = await client.query(
    `
      SELECT user_id, email, role
      FROM users
      WHERE user_id = $1
        AND status <> 'DEACTIVATED'
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function ensurePreferenceRows(recipient, client = pool) {
  const policy = getRoleNotificationPolicy(recipient?.role);

  if (!policy) {
    return;
  }

  await client.query(
    `
      INSERT INTO notification_preferences (
        user_id,
        notification_type,
        in_app_enabled,
        email_enabled,
        whatsapp_enabled,
        browser_push_enabled
      )
      SELECT $1, notification_type, TRUE, TRUE, FALSE, FALSE
      FROM UNNEST($2::text[]) AS notification_type
      ON CONFLICT (user_id, notification_type) DO NOTHING
    `,
    [recipient.user_id, policy.notificationTypes]
  );
}

async function getPreferenceRows(recipient, client = pool) {
  await ensurePreferenceRows(recipient, client);

  const result = await client.query(
    `
      SELECT
        notification_type,
        in_app_enabled,
        email_enabled,
        whatsapp_enabled,
        browser_push_enabled
      FROM notification_preferences
      WHERE user_id = $1
      ORDER BY CASE notification_type
        WHEN 'PARCEL_ARRIVAL' THEN 1
        WHEN 'PARCEL_OVERDUE' THEN 2
        WHEN 'DISPUTE_UPDATED' THEN 3
        ELSE 4
      END
    `,
    [recipient.user_id]
  );

  return result.rows;
}

async function deliverInApp(envelope) {
  const delivered = emitToUser(
    envelope.recipient.user_id,
    "notification:created",
    envelope.notification
  );

  return {
    channel: "IN_APP",
    delivered
  };
}

async function deliverEmail(envelope) {
  const result = await sendNotificationEmail({
    to: envelope.recipient.email,
    title: envelope.notification.title,
    message: envelope.notification.message,
    subject: envelope.emailSubject || undefined
  });

  return {
    channel: "EMAIL",
    delivered: Boolean(result.sent),
    skipped: Boolean(result.skipped)
  };
}

async function deliverBrowserPush(envelope) {
  return sendBrowserPush({
    userId: envelope.recipient.user_id,
    notification: envelope.notification
  });
}

const CHANNEL_ADAPTERS = Object.freeze([
  {
    channel: "IN_APP",
    preference: "in_app_enabled",
    deliver: deliverInApp
  },
  {
    channel: "EMAIL",
    preference: "email_enabled",
    deliver: deliverEmail
  },
  {
    channel: "BROWSER_PUSH",
    preference: "browser_push_enabled",
    deliver: deliverBrowserPush
  }
]);

export async function persistNotification({
  client = pool,
  recipientUserId,
  type,
  title,
  message,
  relatedParcelId = null,
  deduplicationKey = null,
  emailSubject = null
}) {
  if (!NOTIFICATION_TYPE_SET.has(type)) {
    throw new Error(`Unsupported notification type: ${type}`);
  }

  const normalizedTitle = normalizeText(title, MAX_NOTIFICATION_TITLE_LENGTH);
  const normalizedMessage = normalizeText(message, MAX_NOTIFICATION_MESSAGE_LENGTH);

  if (!normalizedTitle || !normalizedMessage) {
    throw new Error("Notification title and message are required.");
  }

  const recipient = await getNotificationRecipient(recipientUserId, client);

  if (!recipient) {
    return null;
  }

  const policy = getRoleNotificationPolicy(recipient.role);

  if (!policy?.notificationTypes.includes(type)) {
    throw new Error(`Notification type ${type} is not supported for role ${recipient.role}.`);
  }

  const preferences = await getPreferenceRows(recipient, client);
  const preference = preferences.find((item) => item.notification_type === type);
  const insertResult = await client.query(
    `
      INSERT INTO notifications (
        recipient_user_id,
        type,
        title,
        message,
        related_parcel_id,
        deduplication_key
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (deduplication_key)
        WHERE deduplication_key IS NOT NULL
        DO NOTHING
      RETURNING
        notification_id,
        type,
        title,
        message,
        related_parcel_id,
        is_read,
        read_at,
        created_at
    `,
    [
      recipient.user_id,
      type,
      normalizedTitle,
      normalizedMessage,
      relatedParcelId,
      deduplicationKey
    ]
  );

  if (!insertResult.rows[0]) {
    return null;
  }

  return {
    notification: toSafeNotification(insertResult.rows[0]),
    recipient,
    preferences: toSafePreference(preference),
    emailSubject: normalizeEmailSubject(emailSubject)
  };
}

export async function deliverPersistedNotification(envelope) {
  if (!envelope?.notification || !envelope?.recipient) {
    return [];
  }

  const enabledAdapters = CHANNEL_ADAPTERS.filter(
    (adapter) => envelope.preferences?.[adapter.preference] === true
  );

  const results = await Promise.all(
    enabledAdapters.map(async (adapter) => {
      try {
        return await adapter.deliver(envelope);
      } catch (error) {
        console.error(
          `Notification ${adapter.channel} delivery failed for notification ${envelope.notification.notification_id}.`
        );

        return {
          channel: adapter.channel,
          delivered: false,
          failed: true
        };
      }
    })
  );

  return results;
}

export async function createAndDeliverNotification(input) {
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const envelope = await persistNotification({
      ...input,
      client
    });

    await client.query("COMMIT");
    transactionOpen = false;

    if (!envelope) {
      return {
        created: false,
        duplicate: true
      };
    }

    const delivery = await deliverPersistedNotification(envelope);

    return {
      created: true,
      notification: envelope.notification,
      delivery
    };
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function persistParcelArrivalNotification({
  client,
  parcelId,
  unitId,
  trackingNumber,
  courierName
}) {
  const residentResult = await client.query(
    `
      SELECT user_id
      FROM users
      WHERE unit_id = $1
        AND role = 'RESIDENT'
        AND status <> 'DEACTIVATED'
      LIMIT 1
    `,
    [unitId]
  );
  const resident = residentResult.rows[0];

  if (!resident) {
    return null;
  }

  return persistNotification({
    client,
    recipientUserId: resident.user_id,
    type: "PARCEL_ARRIVAL",
    title: "Parcel arrived",
    message: `Your ${courierName} parcel (${trackingNumber}) is ready for collection.`,
    relatedParcelId: parcelId,
    deduplicationKey: `parcel-arrival:${parcelId}`,
    emailSubject: `Parcel Arrived — ${courierName} ${trackingNumber}`
  });
}

export async function listNotifications({ requester, filters = {} }) {
  if (!requester?.user_id) {
    return { error: "FORBIDDEN" };
  }

  const page = toPositiveInteger(filters.page, 1, 100000);
  const limit = toPositiveInteger(filters.limit, 20, 100);
  const offset = (page - 1) * limit;
  const unreadFilter = filters.unread_only;

  if (unreadFilter !== undefined && !["true", "false", true, false].includes(unreadFilter)) {
    return { error: "INVALID_UNREAD_FILTER" };
  }

  const unreadOnly = unreadFilter === true || unreadFilter === "true";
  const params = [requester.user_id];
  const whereClauses = ["recipient_user_id = $1"];

  if (unreadOnly) {
    whereClauses.push("is_read = FALSE");
  }

  params.push(limit, offset);
  const result = await pool.query(
    `
      SELECT
        notification_id,
        type,
        title,
        message,
        related_parcel_id,
        is_read,
        read_at,
        created_at,
        COUNT(*) OVER() AS total_count
      FROM notifications
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY created_at DESC, notification_id DESC
      LIMIT $2 OFFSET $3
    `,
    params
  );
  const total = Number(result.rows[0]?.total_count || 0);
  const countsResult = await pool.query(
    `
      SELECT
        COUNT(*)::int AS all_count,
        COUNT(*) FILTER (WHERE is_read = FALSE)::int AS unread_count,
        COUNT(*) FILTER (
          WHERE type IN ('PARCEL_ARRIVAL', 'PARCEL_OVERDUE')
        )::int AS parcel_count,
        COUNT(*) FILTER (WHERE type = 'DISPUTE_UPDATED')::int AS dispute_count
      FROM notifications
      WHERE recipient_user_id = $1
    `,
    [requester.user_id]
  );
  const counts = countsResult.rows[0] || {};

  return {
    notifications: result.rows.map(toSafeNotification),
    counts: {
      all: Number(counts.all_count || 0),
      unread: Number(counts.unread_count || 0),
      parcels: Number(counts.parcel_count || 0),
      disputes: Number(counts.dispute_count || 0)
    },
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    }
  };
}

export async function getUnreadNotificationCount({ requester }) {
  if (!requester?.user_id) {
    return { error: "FORBIDDEN" };
  }

  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS unread_count
      FROM notifications
      WHERE recipient_user_id = $1
        AND is_read = FALSE
    `,
    [requester.user_id]
  );

  return {
    unread_count: Number(result.rows[0]?.unread_count || 0)
  };
}

export async function markNotificationRead({ requester, notificationId }) {
  if (!requester?.user_id) {
    return { error: "FORBIDDEN" };
  }

  if (!isUuid(notificationId)) {
    return { error: "INVALID_NOTIFICATION_ID" };
  }

  const result = await pool.query(
    `
      UPDATE notifications
      SET
        is_read = TRUE,
        read_at = COALESCE(read_at, NOW())
      WHERE notification_id = $1
        AND recipient_user_id = $2
      RETURNING
        notification_id,
        type,
        title,
        message,
        related_parcel_id,
        is_read,
        read_at,
        created_at
    `,
    [notificationId, requester.user_id]
  );

  if (!result.rows[0]) {
    return { error: "NOTIFICATION_NOT_FOUND" };
  }

  return {
    notification: toSafeNotification(result.rows[0])
  };
}

export async function markAllNotificationsRead({ requester }) {
  if (!requester?.user_id) {
    return { error: "FORBIDDEN" };
  }

  const result = await pool.query(
    `
      UPDATE notifications
      SET
        is_read = TRUE,
        read_at = NOW()
      WHERE recipient_user_id = $1
        AND is_read = FALSE
      RETURNING notification_id
    `,
    [requester.user_id]
  );

  return {
    updated_count: result.rowCount
  };
}

export async function getNotificationPreferences({ requester }) {
  if (!requester?.user_id) {
    return { error: "FORBIDDEN" };
  }

  const recipient = await getNotificationRecipient(requester.user_id);

  if (!recipient) {
    return { error: "FORBIDDEN" };
  }

  const preferences = await getPreferenceRows(recipient);

  return {
    preferences: preferences.map((preference) =>
      toSafePreference(preference)
    )
  };
}

function normalizePreferenceUpdates(input, role) {
  const policy = getRoleNotificationPolicy(role);

  if (!policy) {
    return { error: "FORBIDDEN" };
  }

  const preferences = Array.isArray(input?.preferences)
    ? input.preferences
    : input?.notification_type
      ? [input]
      : [];

  if (preferences.length === 0) {
    return { error: "PREFERENCES_REQUIRED" };
  }

  const normalized = [];
  const seenTypes = new Set();

  for (const preference of preferences) {
    const type = typeof preference.notification_type === "string"
      ? preference.notification_type.trim().toUpperCase()
      : "";

    if (!NOTIFICATION_TYPE_SET.has(type)) {
      return { error: "INVALID_NOTIFICATION_TYPE" };
    }

    if (!policy.notificationTypes.includes(type)) {
      return { error: "INVALID_NOTIFICATION_TYPE_FOR_ROLE" };
    }

    if (seenTypes.has(type)) {
      return { error: "DUPLICATE_NOTIFICATION_TYPE" };
    }

    seenTypes.add(type);

    if (Object.hasOwn(preference, "in_app_enabled") && preference.in_app_enabled !== true) {
      return { error: "IN_APP_REQUIRED" };
    }

    const optionalChannels = [
      "email_enabled",
      "whatsapp_enabled",
      "browser_push_enabled"
    ];
    const update = {
      notification_type: type,
      email_enabled: null,
      whatsapp_enabled: null,
      browser_push_enabled: null
    };
    let hasUpdate = false;

    for (const channel of optionalChannels) {
      if (!Object.hasOwn(preference, channel)) {
        continue;
      }

      if (!policy.optionalChannels.includes(channel)) {
        return { error: "UNSUPPORTED_NOTIFICATION_CHANNEL" };
      }

      if (typeof preference[channel] !== "boolean") {
        return { error: "INVALID_PREFERENCE_VALUE" };
      }

      update[channel] = preference[channel];
      hasUpdate = true;
    }

    if (!hasUpdate && !Object.hasOwn(preference, "in_app_enabled")) {
      return { error: "PREFERENCE_UPDATE_REQUIRED" };
    }

    normalized.push(update);
  }

  return { value: normalized };
}

export async function updateNotificationPreferences({ requester, input }) {
  if (!requester?.user_id) {
    return { error: "FORBIDDEN" };
  }

  const recipient = await getNotificationRecipient(requester.user_id);

  if (!recipient) {
    return { error: "FORBIDDEN" };
  }

  const validation = normalizePreferenceUpdates(input, recipient.role);

  if (validation.error) {
    return validation;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensurePreferenceRows(recipient, client);

    for (const preference of validation.value) {
      await client.query(
        `
          UPDATE notification_preferences
          SET
            in_app_enabled = TRUE,
            email_enabled = COALESCE($1::boolean, email_enabled),
            whatsapp_enabled = COALESCE($2::boolean, whatsapp_enabled),
            browser_push_enabled = COALESCE($3::boolean, browser_push_enabled)
          WHERE user_id = $4
            AND notification_type = $5
        `,
        [
          preference.email_enabled,
          preference.whatsapp_enabled,
          preference.browser_push_enabled,
          requester.user_id,
          preference.notification_type
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getNotificationPreferences({ requester });
}

export async function findOverdueNotificationCandidates({ limit = 100 } = {}) {
  const safeLimit = toPositiveInteger(limit, 100, 500);
  const result = await pool.query(
    `
      SELECT
        p.parcel_id,
        p.tracking_number,
        c.courier_name,
        resident.user_id AS recipient_user_id
      FROM parcels p
      INNER JOIN courier_companies c ON c.courier_id = p.courier_id
      INNER JOIN users resident
        ON resident.unit_id = p.unit_id
        AND resident.role = 'RESIDENT'
        AND resident.status <> 'DEACTIVATED'
      WHERE p.status = 'PENDING_COLLECTION'
        AND p.deleted_at IS NULL
        AND p.collection_deadline IS NOT NULL
        AND p.collection_deadline < NOW()
        AND NOT EXISTS (
          SELECT 1
          FROM notifications existing_notification
          WHERE existing_notification.deduplication_key = 'parcel-overdue:' || p.parcel_id::text
        )
      ORDER BY p.collection_deadline ASC, p.parcel_id ASC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function createOverdueNotification(candidate) {
  return createAndDeliverNotification({
    recipientUserId: candidate.recipient_user_id,
    type: "PARCEL_OVERDUE",
    title: "Parcel overdue",
    message: `Your ${candidate.courier_name} parcel (${candidate.tracking_number}) is overdue for collection.`,
    relatedParcelId: candidate.parcel_id,
    deduplicationKey: `parcel-overdue:${candidate.parcel_id}`
  });
}
