// Email sending for password resets. Uses nodemailer (pure JS, no native deps).
// Configure via env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
// For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=<you>@gmail.com,
// SMTP_PASS=<app password> (NOT your normal password — make one at
// https://myaccount.google.com/apppasswords).
import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
const FROM = process.env.SMTP_FROM || SMTP_USER;

export const mailConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;
function getTransport() {
  if (!transporter) {
    const port = Number(SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendResetEmail(to, link) {
  // If SMTP isn't set up yet, fall back to logging the link so the host can
  // relay it manually — the feature still works before email is configured.
  if (!mailConfigured) {
    console.log(`[password-reset] SMTP not configured. Reset link for ${to}:\n  ${link}`);
    return;
  }
  await getTransport().sendMail({
    from: FROM,
    to,
    subject: "Reset your AI Music password",
    text: `Tap the link below to set a new password (valid for 1 hour):\n\n${link}\n\n` +
      `Open it on the same Wi-Fi as the AI Music server. If you didn't request this, ignore this email.`,
    html: `<p>Tap the link below to set a new password (valid for 1 hour):</p>` +
      `<p><a href="${link}">${link}</a></p>` +
      `<p>Open it on the same Wi-Fi as the AI Music server. If you didn't request this, ignore this email.</p>`,
  });
}
