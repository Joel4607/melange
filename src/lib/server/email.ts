import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM;

export function isEmailConfigured(): boolean {
  return Boolean(smtpHost && smtpUser && smtpPass && smtpFrom);
}

function createTransport() {
  if (!isEmailConfigured()) return null;
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

let transport: ReturnType<typeof createTransport> | undefined;

function getTransport() {
  if (transport === undefined) {
    transport = createTransport();
  }
  return transport;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const t = getTransport();
  if (!t || !smtpFrom) return;

  try {
    await t.sendMail({
      from: smtpFrom,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("email: send failed", err);
  }
}
