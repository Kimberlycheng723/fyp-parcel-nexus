import { pool } from "../db/pool.js";

const MAX_ENDPOINT_LENGTH = 4096;
const MAX_KEY_LENGTH = 2048;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;

function isAuthenticatedNotificationUser(requester) {
  return Boolean(
    requester?.user_id
    && ["SUPER_ADMIN", "ADMIN", "GUARD", "RESIDENT"].includes(requester.role)
  );
}

function normalizeSubscription(input) {
  const endpoint = typeof input?.endpoint === "string" ? input.endpoint.trim() : "";
  const p256dhKey = typeof input?.keys?.p256dh === "string"
    ? input.keys.p256dh.trim()
    : "";
  const authKey = typeof input?.keys?.auth === "string"
    ? input.keys.auth.trim()
    : "";

  if (!endpoint || !p256dhKey || !authKey) {
    return { error: "INVALID_PUSH_SUBSCRIPTION" };
  }

  if (
    endpoint.length > MAX_ENDPOINT_LENGTH
    || p256dhKey.length > MAX_KEY_LENGTH
    || authKey.length > MAX_KEY_LENGTH
  ) {
    return { error: "INVALID_PUSH_SUBSCRIPTION" };
  }

  let endpointUrl;

  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return { error: "INVALID_PUSH_SUBSCRIPTION" };
  }

  if (endpointUrl.protocol !== "https:") {
    return { error: "INVALID_PUSH_SUBSCRIPTION" };
  }

  if (!BASE64_URL_PATTERN.test(p256dhKey) || !BASE64_URL_PATTERN.test(authKey)) {
    return { error: "INVALID_PUSH_SUBSCRIPTION" };
  }

  return {
    value: {
      endpoint,
      p256dhKey,
      authKey
    }
  };
}

export async function savePushSubscription({ requester, input }) {
  if (!isAuthenticatedNotificationUser(requester)) {
    return { error: "PUSH_SUBSCRIPTION_FORBIDDEN" };
  }

  const validation = normalizeSubscription(input?.subscription || input);

  if (validation.error) {
    return validation;
  }

  const { endpoint, p256dhKey, authKey } = validation.value;

  await pool.query(
    `
      INSERT INTO push_subscriptions (
        user_id,
        endpoint,
        p256dh_key,
        auth_key,
        is_active
      )
      VALUES ($1, $2, $3, $4, TRUE)
      ON CONFLICT (endpoint)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        p256dh_key = EXCLUDED.p256dh_key,
        auth_key = EXCLUDED.auth_key,
        is_active = TRUE
    `,
    [requester.user_id, endpoint, p256dhKey, authKey]
  );

  return { subscribed: true };
}

export async function deactivatePushSubscription({ requester, endpoint }) {
  if (!isAuthenticatedNotificationUser(requester)) {
    return { error: "PUSH_SUBSCRIPTION_FORBIDDEN" };
  }

  const normalizedEndpoint = typeof endpoint === "string" ? endpoint.trim() : "";

  if (!normalizedEndpoint || normalizedEndpoint.length > MAX_ENDPOINT_LENGTH) {
    return { error: "PUSH_ENDPOINT_REQUIRED" };
  }

  await pool.query(
    `
      UPDATE push_subscriptions
      SET is_active = FALSE
      WHERE user_id = $1
        AND endpoint = $2
    `,
    [requester.user_id, normalizedEndpoint]
  );

  return { subscribed: false };
}
