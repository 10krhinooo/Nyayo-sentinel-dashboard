import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS
  }
});

async function send(to: string, subject: string, html: string) {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    // eslint-disable-next-line no-console
    console.warn("SMTP not configured — skipping email to", to);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"Nyayo Sentinel" <${env.SMTP_USER}>`,
      to,
      subject,
      html
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Email send failed:", err);
  }
}

export async function sendInviteEmail(to: string, token: string) {
  const link = `${env.FRONTEND_URL}/set-password?token=${token}`;
  await send(
    to,
    "Welcome to Nyayo Sentinel — Set Your Password",
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#006600">Nyayo Sentinel</h2>
      <p>You have been added as a user on the Nyayo Sentinel National Early Warning System.</p>
      <p>Click the button below to set your password and activate your account. This link expires in <strong>24 hours</strong>.</p>
      <p style="text-align:center;margin:2rem 0">
        <a href="${link}" style="background:#006600;color:#fff;padding:0.75rem 2rem;border-radius:0.4rem;text-decoration:none;font-weight:bold">
          Set Your Password
        </a>
      </p>
      <p style="color:#666;font-size:0.85rem">If you did not expect this email, please ignore it or contact your system administrator.</p>
      <hr style="border:none;border-top:1px solid #eee"/>
      <p style="color:#999;font-size:0.75rem">Ministry of Interior &amp; National Administration | Republic of Kenya</p>
    </div>
    `
  );
}

export async function sendOtpEmail(to: string, code: string) {
  await send(
    to,
    "Nyayo Sentinel — Your Login Verification Code",
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#006600">Nyayo Sentinel</h2>
      <p>Your one-time login verification code is:</p>
      <p style="text-align:center;margin:2rem 0">
        <span style="font-size:2.5rem;font-weight:bold;letter-spacing:0.5rem;color:#111">${code}</span>
      </p>
      <p>This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
      <p style="color:#666;font-size:0.85rem">If you did not attempt to log in, please contact your administrator immediately.</p>
      <hr style="border:none;border-top:1px solid #eee"/>
      <p style="color:#999;font-size:0.75rem">Ministry of Interior &amp; National Administration | Republic of Kenya</p>
    </div>
    `
  );
}

export async function sendAlertEmail(
  recipients: string[],
  alert: { id: string; summary: string; severity: string; countyId: string; triggeredAt: Date; county?: { name: string } | null; topic?: { name: string } | null }
) {
  const severityColor: Record<string, string> = {
    LOW: "#92400e",
    MEDIUM: "#b45309",
    HIGH: "#dc2626",
    CRITICAL: "#7f1d1d"
  };
  const color = severityColor[alert.severity] ?? "#dc2626";
  const county = alert.county?.name ?? alert.countyId;
  const topic = alert.topic?.name ?? "General";
  const link = `${env.FRONTEND_URL}/alerts`;

  for (const to of recipients) {
    await send(
      to,
      `[${alert.severity}] Nyayo Sentinel Alert — ${county}`,
      `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#006600">Nyayo Sentinel — Alert Notification</h2>
        <div style="border-left:4px solid ${color};padding:1rem;background:#fafafa;margin-bottom:1.5rem">
          <p style="margin:0 0 0.5rem"><strong>Severity:</strong> <span style="color:${color}">${alert.severity}</span></p>
          <p style="margin:0 0 0.5rem"><strong>County:</strong> ${county}</p>
          <p style="margin:0 0 0.5rem"><strong>Topic:</strong> ${topic}</p>
          <p style="margin:0 0 0.5rem"><strong>Summary:</strong> ${alert.summary}</p>
          <p style="margin:0"><strong>Triggered:</strong> ${new Date(alert.triggeredAt).toUTCString()}</p>
        </div>
        <p style="text-align:center">
          <a href="${link}" style="background:#006600;color:#fff;padding:0.6rem 1.5rem;border-radius:0.4rem;text-decoration:none;font-weight:bold">
            View Alerts Dashboard
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #eee"/>
        <p style="color:#999;font-size:0.75rem">Ministry of Interior &amp; National Administration | Republic of Kenya</p>
      </div>
      `
    );
  }
}

export async function sendPasswordChangedEmail(to: string) {
  await send(
    to,
    "Nyayo Sentinel — Password Changed",
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#006600">Nyayo Sentinel</h2>
      <p>Your account password was successfully changed.</p>
      <p style="color:#666;font-size:0.85rem">If you did not make this change, contact your administrator immediately.</p>
      <hr style="border:none;border-top:1px solid #eee"/>
      <p style="color:#999;font-size:0.75rem">Ministry of Interior &amp; National Administration | Republic of Kenya</p>
    </div>
    `
  );
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  await send(
    to,
    "Nyayo Sentinel — Password Reset Request",
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#006600">Nyayo Sentinel</h2>
      <p>A password reset was requested for your account.</p>
      <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
      <p style="text-align:center;margin:2rem 0">
        <a href="${link}" style="background:#006600;color:#fff;padding:0.75rem 2rem;border-radius:0.4rem;text-decoration:none;font-weight:bold">
          Reset Password
        </a>
      </p>
      <p style="color:#666;font-size:0.85rem">If you did not request a reset, you can safely ignore this email.</p>
      <hr style="border:none;border-top:1px solid #eee"/>
      <p style="color:#999;font-size:0.75rem">Ministry of Interior &amp; National Administration | Republic of Kenya</p>
    </div>
    `
  );
}

export async function sendWelcomeEmail(to: string) {
  const link = `${env.FRONTEND_URL}/login`;
  await send(
    to,
    "Welcome to Nyayo Sentinel — Account Activated",
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#006600">Nyayo Sentinel</h2>
      <p>Your account has been activated. You can now log in to the dashboard.</p>
      <p style="text-align:center;margin:2rem 0">
        <a href="${link}" style="background:#006600;color:#fff;padding:0.75rem 2rem;border-radius:0.4rem;text-decoration:none;font-weight:bold">
          Sign In
        </a>
      </p>
      <hr style="border:none;border-top:1px solid #eee"/>
      <p style="color:#999;font-size:0.75rem">Ministry of Interior &amp; National Administration | Republic of Kenya</p>
    </div>
    `
  );
}
