import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import nodemailer from "nodemailer";
import webPush from "web-push";
import { pool } from "../src/db/pool.js";
import { initializeSocketServer } from "../src/realtime/socket.js";
import { deliverPersistedNotification, persistParcelArrivalNotification } from "../src/services/notification.service.js";
import { sendBrowserPush } from "../src/services/webPush.service.js";

test("central arrival messages preserve scoping/dedup/preferences and safely reach all three channel adapters", async (t) => {
  const originalEnv = { ...process.env };
  const vapid = webPush.generateVAPIDKeys();
  Object.assign(process.env, { SMTP_HOST: "smtp.example.invalid", SMTP_PORT: "587", SMTP_USER: "fixture", SMTP_PASS: "fixture", SMTP_FROM: "no-reply@example.invalid",
    VAPID_SUBJECT: "mailto:test@example.invalid", VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey });
  const user = { user_id: "11111111-1111-4111-8111-111111111111", email: "resident@example.invalid", role: "RESIDENT" };
  const socketEvents = [], emails = [], pushes = [], stored = new Map();
  let preferences = { in_app_enabled: true, email_enabled: true, browser_push_enabled: true };
  const io = initializeSocketServer(createServer());
  t.mock.method(io, "to", (room) => ({ emit(event, payload) { socketEvents.push({ room, event, payload }); } }));
  const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  t.mock.method(nodemailer, "createTransport", () => ({ async sendMail(options) {
    emails.push(options); return stream.sendMail(options);
  } }));
  let failPush = false;
  t.mock.method(webPush, "sendNotification", async (subscription, payload) => {
    pushes.push({ subscription, payload: JSON.parse(payload) });
    if (failPush) throw new Error("Fixture push transport failure");
  });
  t.mock.method(pool, "query", async (sql, params = []) => {
    const query = sql.replace(/\s+/g, " ").toUpperCase();
    if (query.includes("FROM USERS")) return { rows: query.includes("WHERE UNIT_ID") ? (params[0] === "own-unit" ? [{ user_id: user.user_id }] : []) : [{ ...user, user_id: params[0] }] };
    if (query.includes("INSERT INTO NOTIFICATION_PREFERENCES")) return { rows: [] };
    if (query.includes("FROM NOTIFICATION_PREFERENCES")) return { rows: ["PARCEL_ARRIVAL", "PARCEL_OVERDUE", "DISPUTE_UPDATED", "PARCEL_COMMUNITY_ALERT"].map((type) => ({ notification_type: type, ...preferences, whatsapp_enabled: false })) };
    if (query.includes("INSERT INTO NOTIFICATIONS")) {
      if (stored.has(params[6])) return { rows: [] };
      const row = { notification_id: `22222222-2222-4222-8222-${String(stored.size + 1).padStart(12, "0")}`, recipient_user_id: params[0], type: params[1], title: params[2], message: params[3], related_parcel_id: params[4], related_dispute_id: params[5], is_read: false, read_at: null, created_at: "2026-10-13T00:00:00Z" };
      stored.set(params[6], row); return { rows: [row] };
    }
    if (query.includes("FROM PUSH_SUBSCRIPTIONS")) {
      assert.equal(params[0], user.user_id);
      return { rows: [{ push_subscription_id: "test-subscription", endpoint: "https://push.example.invalid/test", p256dh_key: "fixture", auth_key: "fixture" }] };
    }
    throw new Error(`Unexpected fixture query: ${query}`);
  });
  const base = { client: pool, unitId: "own-unit", courierName: "Test Courier", trackingNumber: "SPX123" };
  try {
    const envelope = await persistParcelArrivalNotification({ ...base, parcelId: "parcel-a", parcelRoomName: 'Lobby <A> & "B"' });
    const message = 'Your Test Courier parcel (SPX123) is ready for collection at Lobby <A> & "B".';
    assert.equal(envelope.notification.message, message);
    assert.equal(envelope.recipient.user_id, user.user_id);
    const delivery = await deliverPersistedNotification(envelope);
    assert.deepEqual(delivery.map((item) => item.channel), ["IN_APP", "EMAIL", "BROWSER_PUSH"]);
    assert.equal(socketEvents[0].room, `user:${user.user_id}`);
    assert.equal(socketEvents[0].event, "notification:created");
    assert.equal(socketEvents[0].payload.message, message);
    assert.ok(emails[0].text.includes(message));
    assert.ok(emails[0].html.includes("Lobby &lt;A&gt; &amp; &quot;B&quot;"));
    assert.ok(!emails[0].html.includes("Lobby <A>"));
    assert.equal(pushes[0].payload.body, message);
    assert.equal(pushes[0].payload.data.url, "/dashboard");
    assert.equal(pushes[0].payload.data.type, "PARCEL_ARRIVAL");
    assert.ok(!JSON.stringify(pushes[0].payload).includes("parcel_room_id"));
    assert.equal(await persistParcelArrivalNotification({ ...base, parcelId: "parcel-a", parcelRoomName: "New Room" }), null);
    assert.equal(stored.size, 1);
    assert.equal(stored.get("parcel-arrival:parcel-a").message, message);
    assert.equal(await persistParcelArrivalNotification({ ...base, unitId: "another-unit", parcelId: "another-parcel", parcelRoomName: "Private Room" }), null);
    assert.equal(stored.size, 1);
    for (const [index, parcelRoomName] of [null, undefined, " "].entries()) {
      const legacy = await persistParcelArrivalNotification({ ...base, parcelId: `legacy-${index}`, parcelRoomName });
      assert.equal(legacy.notification.message, "Your Test Courier parcel (SPX123) is ready for collection.");
    }
    const otherRoom = await persistParcelArrivalNotification({ ...base, parcelId: "parcel-b", parcelRoomName: "Tower B" });
    assert.ok(otherRoom.notification.message.endsWith("at Tower B."));
    preferences = { in_app_enabled: true, email_enabled: false, browser_push_enabled: false };
    const optedOut = await persistParcelArrivalNotification({ ...base, parcelId: "opt-out", parcelRoomName: "Room A" });
    const emailCount = emails.length, pushCount = pushes.length;
    assert.deepEqual((await deliverPersistedNotification(optedOut)).map((item) => item.channel), ["IN_APP"]);
    assert.equal(emails.length, emailCount); assert.equal(pushes.length, pushCount);
    for (const [type, expected] of [["DISPUTE_UPDATED", "Your dispute has been updated."], ["PARCEL_OVERDUE", "Your parcel has passed its collection deadline."], ["PARCEL_COMMUNITY_ALERT", "You have a new Parcel Nexus notification."]]) {
      await sendBrowserPush({ userId: user.user_id, notification: { type, message: "Private category text", notification_id: "fixture" } });
      assert.equal(pushes.at(-1).payload.body, expected);
    }
    failPush = true;
    t.mock.method(console, "error", () => {});
    const failure = await deliverPersistedNotification(envelope);
    assert.equal(failure.find((item) => item.channel === "BROWSER_PUSH").delivered, false);
    assert.equal(stored.get("parcel-arrival:parcel-a").message, message);
  } finally {
    t.mock.restoreAll();
    await new Promise((resolve) => io.close(resolve));
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    await pool.end();
  }
});
