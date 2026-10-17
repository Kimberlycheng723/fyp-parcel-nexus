import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import nodemailer from "nodemailer";
import { buildPasswordResetEmail } from "../src/templates/passwordResetEmail.js";
import {
  sendActivationEmail,
  sendEmailChangeVerificationEmail,
  sendNotificationEmail,
  sendPasswordResetEmail
} from "../src/services/email.service.js";

const resetLink = "https://example.invalid/reset-password?token=preview-only&source=email";

test("reset template has the approved copy, real link, and no outside footer", () => {
  const { html, text } = buildPasswordResetEmail(resetLink);
  for (const content of [html, text]) {
    assert.match(content, /Hey there,/);
    assert.match(content, /This reset link expires in 15 minutes\./);
    assert.doesNotMatch(content, /Hey \[Name\]|GEM|Unsubscribe|Privacy policy/i);
  }
  assert.ok(text.includes(resetLink));
  assert.ok(html.includes('href="https://example.invalid/reset-password?token=preview-only&amp;source=email"'));
  assert.doesNotMatch(html, /<script|<iframe|https?:\/\/[^"\s]+\.(png|jpg)/i);
});

test("reset URL is escaped without introducing HTML attributes", () => {
  const { html } = buildPasswordResetEmail('https://example.invalid/reset-password?token="<test>&\'');
  assert.ok(html.includes('token=&quot;&lt;test&gt;&amp;&#039;"'));
  assert.doesNotMatch(html, /<test>/);
});

test("illustration is a compact JPEG attached inline, not a frontend URL", async () => {
  const { html, attachments } = buildPasswordResetEmail(resetLink);
  assert.equal(attachments.length, 1);
  const image = attachments[0];
  assert.equal(image.contentDisposition, "inline");
  assert.equal(image.contentType, "image/jpeg");
  assert.ok(html.includes(`src="cid:${image.cid}"`));
  await access(image.path);
  const bytes = await readFile(image.path);
  assert.equal(bytes.subarray(0, 3).toString("hex"), "ffd8ff");
  assert.ok((await stat(image.path)).size < 150_000, "Email illustration should stay lightweight");
});

test("email service includes HTML, plain text and CID image without changing other emails", async (t) => {
  // Stream transport assembles the real MIME email without sending SMTP or changing accounts.
  const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const messages = [];
  t.mock.method(nodemailer, "createTransport", () => ({
    async sendMail(options) {
      const result = await stream.sendMail(options);
      messages.push({ options, mime: result.message.toString() });
      return result;
    }
  }));
  const smtpKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
  const original = Object.fromEntries(smtpKeys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SMTP_HOST: "smtp.example.invalid",
    SMTP_PORT: "587",
    SMTP_USER: "test",
    SMTP_PASS: "test-only-not-a-real-secret",
    SMTP_FROM: "Parcel Nexus <no-reply@example.invalid>"
  });
  try {
    const result = await sendPasswordResetEmail({ to: "resident@example.invalid", resetLink });
    assert.equal(result.sent, true);
    assert.equal(messages[0].options.subject, "Reset your Parcel Nexus password");
    assert.match(messages[0].mime, /Content-Type: multipart\/alternative/i);
    assert.match(messages[0].mime, /Content-Type: multipart\/related/i);
    assert.match(messages[0].mime, /Content-Type: text\/plain/i);
    assert.match(messages[0].mime, /Content-Type: text\/html/i);
    assert.match(messages[0].mime, /Content-Type: image\/jpeg/i);
    assert.ok(messages[0].mime.includes(`Content-ID: <${messages[0].options.attachments[0].cid}>`));

    await sendActivationEmail({ to: "resident@example.invalid", activationLink: "https://example.invalid/activate?token=preview" });
    await sendEmailChangeVerificationEmail({ to: "resident@example.invalid", verificationLink: "https://example.invalid/verify-email-change?token=preview" });
    await sendNotificationEmail({ to: "resident@example.invalid", title: "Parcel arrival", message: "Your parcel is ready." });
    for (const { options } of messages.slice(1)) {
      assert.equal(options.attachments, undefined);
      assert.doesNotMatch(options.html, /password-reset-illustration|Hey there/);
    }
    assert.match(messages[1].options.text, /30 days/);
    assert.match(messages[2].options.text, /30 minutes/);
    assert.match(messages[3].options.text, /Your parcel is ready\./);
  } finally {
    for (const key of smtpKeys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
