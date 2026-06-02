import nodemailer from "nodemailer";

let transporter;

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM
  );
}

function getFrontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:5173";
}

function getSmtpTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  if (!isSmtpConfigured()) {
    if (process.env.NODE_ENV === "development") {
      console.warn("SMTP is not fully configured. Email was not sent.");
    }

    return {
      sent: false,
      skipped: true,
      reason: "SMTP_NOT_CONFIGURED"
    };
  }

  const result = await getSmtpTransporter().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html
  });

  return {
    sent: true,
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected
  };
}

export function buildActivationLink(rawToken) {
  const encodedToken = encodeURIComponent(rawToken);
  return `${getFrontendUrl()}/activate?token=${encodedToken}`;
}

export function buildPasswordResetLink(rawToken) {
  const encodedToken = encodeURIComponent(rawToken);
  return `${getFrontendUrl()}/reset-password?token=${encodedToken}`;
}

export async function sendActivationEmail({ to, activationLink }) {
  return sendMail({
    to,
    subject: "Activate your Parcel Nexus account",
    text: [
      "Hello,",
      "",
      "Your Parcel Nexus account has been created.",
      "Please activate your account and set your password using the link below:",
      activationLink,
      "",
      "This activation link expires in 30 days.",
      "",
      "Parcel Nexus"
    ].join("\n"),
    html: `
      <p>Hello,</p>
      <p>Your Parcel Nexus account has been created.</p>
      <p>Please activate your account and set your password using the link below:</p>
      <p><a href="${activationLink}">Activate your Parcel Nexus account</a></p>
      <p>This activation link expires in 30 days.</p>
      <p>Parcel Nexus</p>
    `
  });
}

export async function sendPasswordResetEmail({ to, resetLink }) {
  return sendMail({
    to,
    subject: "Reset your Parcel Nexus password",
    text: [
      "Hello,",
      "",
      "A password reset was requested for your Parcel Nexus account.",
      "Use the link below to reset your password:",
      resetLink,
      "",
      "This reset link expires in 15 minutes.",
      "If you did not request this, you can ignore this email.",
      "",
      "Parcel Nexus"
    ].join("\n"),
    html: `
      <p>Hello,</p>
      <p>A password reset was requested for your Parcel Nexus account.</p>
      <p>Use the link below to reset your password:</p>
      <p><a href="${resetLink}">Reset your Parcel Nexus password</a></p>
      <p>This reset link expires in 15 minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
      <p>Parcel Nexus</p>
    `
  });
}
