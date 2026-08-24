import webPush from "web-push";

import { pool } from "../db/pool.js";

let configuredSignature = "";

function getVapidConfiguration() {
  const subject = process.env.VAPID_SUBJECT?.trim() || "";
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";

  if (!subject || !publicKey || !privateKey) {
    return null;
  }

  return { subject, publicKey, privateKey };
}

function configureWebPush() {
  const configuration = getVapidConfiguration();

  if (!configuration) {
    return null;
  }

  const signature = `${configuration.subject}:${configuration.publicKey}`;

  if (configuredSignature !== signature) {
    webPush.setVapidDetails(
      configuration.subject,
      configuration.publicKey,
      configuration.privateKey
    );
    configuredSignature = signature;
  }

  return configuration;
}

function isPermanentSubscriptionError(error) {
  return error?.statusCode === 404 || error?.statusCode === 410;
}

function safePushBody(type) {
  const messages = {
    PARCEL_ARRIVAL: "Your parcel has arrived and is ready for collection.",
    PARCEL_OVERDUE: "Your parcel has passed its collection deadline.",
    DISPUTE_UPDATED: "Your dispute has been updated."
  };

  return messages[type] || "You have a new Parcel Nexus notification.";
}

async function deactivateSubscription(pushSubscriptionId) {
  await pool.query(
    `
      UPDATE push_subscriptions
      SET is_active = FALSE
      WHERE push_subscription_id = $1
    `,
    [pushSubscriptionId]
  );
}

export function getWebPushPublicConfiguration() {
  const configuration = configureWebPush();

  return {
    configured: Boolean(configuration),
    public_key: configuration?.publicKey || null
  };
}

export async function sendBrowserPush({ userId, notification }) {
  const configuration = configureWebPush();

  if (!configuration) {
    return {
      channel: "BROWSER_PUSH",
      delivered: false,
      skipped: true,
      reason: "NOT_CONFIGURED"
    };
  }

  const subscriptionsResult = await pool.query(
    `
      SELECT
        push_subscription_id,
        endpoint,
        p256dh_key,
        auth_key
      FROM push_subscriptions
      WHERE user_id = $1
        AND is_active = TRUE
    `,
    [userId]
  );

  if (subscriptionsResult.rows.length === 0) {
    return {
      channel: "BROWSER_PUSH",
      delivered: false,
      skipped: true,
      reason: "NO_ACTIVE_SUBSCRIPTIONS"
    };
  }

  const payload = JSON.stringify({
    title: "Parcel Nexus",
    body: safePushBody(notification.type),
    data: {
      url: "/dashboard",
      notification_id: notification.notification_id,
      type: notification.type,
      related_parcel_id: notification.related_parcel_id || null
    }
  });
  let deliveredCount = 0;
  let deactivatedCount = 0;

  await Promise.all(
    subscriptionsResult.rows.map(async (row) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: {
              p256dh: row.p256dh_key,
              auth: row.auth_key
            }
          },
          payload,
          {
            TTL: 120,
            urgency: "normal"
          }
        );
        deliveredCount += 1;
      } catch (error) {
        if (isPermanentSubscriptionError(error)) {
          await deactivateSubscription(row.push_subscription_id);
          deactivatedCount += 1;
          return;
        }

        console.error(
          `Browser Push delivery failed for notification ${notification.notification_id}.`
        );
      }
    })
  );

  return {
    channel: "BROWSER_PUSH",
    delivered: deliveredCount > 0,
    delivered_count: deliveredCount,
    deactivated_count: deactivatedCount
  };
}
