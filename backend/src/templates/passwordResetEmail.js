import { fileURLToPath } from "node:url";

const illustrationCid = "password-reset-illustration@parcel-nexus";
const illustrationPath = fileURLToPath(
  new URL("../../assets/email/password-reset-illustration.jpg", import.meta.url)
);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildPasswordResetEmail(resetLink) {
  const safeResetLink = escapeHtml(resetLink);

  return {
    text: [
      "Reset your password",
      "",
      "Hey there,",
      "",
      "Need to reset your password? No problem! Just click the link below and you'll be on your way.",
      "This reset link expires in 15 minutes.",
      "",
      resetLink,
      "",
      "If you did not request a password change, no worries. Simply ignore this message."
    ].join("\n"),
    // Table layout and inline styles keep the email usable without web CSS support.
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset your password</title>
    <style>
      @media only screen and (max-width: 620px) {
        .email-outer { padding: 24px 12px !important; }
        .email-content { padding: 24px 22px 32px !important; }
        .email-title { font-size: 28px !important; line-height: 36px !important; }
        .email-button { padding: 18px 12px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f5f4ff; color: #111b43; font-family: Arial, Helvetica, sans-serif; -webkit-text-size-adjust: 100%;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f4ff" style="width: 100%; background-color: #f5f4ff;">
      <tr>
        <td class="email-outer" align="center" style="padding: 56px 24px;">
          <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 20px;">
            <tr>
              <td class="email-content" align="center" style="padding: 36px 44px 44px;">
                <img src="cid:${illustrationCid}" width="400" alt="" style="display: block; width: 100%; max-width: 400px; height: auto; margin: 0 auto; border: 0;">
                <h1 class="email-title" style="margin: 22px 0 28px; color: #111b43; font-family: Arial, Helvetica, sans-serif; font-size: 34px; line-height: 42px; font-weight: 700; letter-spacing: 0;">Reset your password</h1>
                <p style="margin: 0 0 16px; color: #111b43; font-size: 22px; line-height: 30px; font-weight: 700;">Hey there,</p>
                <p style="margin: 0; color: #505a76; font-size: 17px; line-height: 28px;">Need to reset your password? No problem! Just click the button below and you'll be on your way. This reset link expires in 15 minutes.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin-top: 32px;">
                  <tr>
                    <td align="center">
                      <table role="presentation" width="340" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 340px;">
                        <tr>
                          <td align="center" bgcolor="#3870f8" style="background-color: #3870f8; border-radius: 10px; mso-padding-alt: 20px 24px;">
                            <a class="email-button" href="${safeResetLink}" style="display: block; padding: 20px 24px; color: #ffffff; font-size: 19px; line-height: 26px; font-weight: 700; text-decoration: none; border-radius: 10px;">Reset your password</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin-top: 34px;">
                  <tr>
                    <td style="padding-top: 26px; border-top: 1px solid #e1e5f3;">
                      <p style="margin: 0; color: #69738e; font-size: 15px; line-height: 25px; text-align: center;">If you did not request a password change, no worries.<br>Simply ignore this message.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`,
    attachments: [
      {
        filename: "password-reset-illustration.jpg",
        path: illustrationPath,
        cid: illustrationCid,
        contentType: "image/jpeg",
        contentDisposition: "inline"
      }
    ]
  };
}
