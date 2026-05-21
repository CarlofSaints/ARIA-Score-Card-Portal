import { Resend } from "resend";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  return new Resend(key);
}

const FROM = "ARIA Score Card <noreply@outerjoin.co.za>";

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  tenantName: string;
  siteUrl: string;
  email: string;
  password: string;
  forcePasswordChange: boolean;
}): Promise<void> {
  const resend = getResend();
  const pwNote = params.forcePasswordChange
    ? "<p><strong>You will be prompted to change your password on first login.</strong></p>"
    : "";

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `Welcome to ${params.tenantName} — ARIA Score Card`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#3D6273;">Welcome to ARIA Score Card</h2>
        <p>Hi ${params.name},</p>
        <p>Your account has been created for <strong>${params.tenantName}</strong>.</p>
        <table style="margin:16px 0;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 12px 4px 0;font-weight:bold;">Site</td>
            <td style="padding:4px 0;"><a href="${params.siteUrl}">${params.siteUrl}</a></td>
          </tr>
          <tr>
            <td style="padding:4px 12px 4px 0;font-weight:bold;">Email</td>
            <td style="padding:4px 0;">${params.email}</td>
          </tr>
          <tr>
            <td style="padding:4px 12px 4px 0;font-weight:bold;">Password</td>
            <td style="padding:4px 0;">${params.password}</td>
          </tr>
        </table>
        ${pwNote}
        <p style="margin-top:24px;color:#718096;font-size:13px;">Powered by OuterJoin</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  resetUrl: string;
  tenantName: string;
}): Promise<void> {
  const resend = getResend();

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `Password Reset — ${params.tenantName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#3D6273;">Password Reset</h2>
        <p>Hi ${params.name},</p>
        <p>You requested a password reset for your <strong>${params.tenantName}</strong> account.</p>
        <p>
          <a href="${params.resetUrl}"
             style="display:inline-block;padding:12px 24px;background:#3D6273;color:#fff;text-decoration:none;border-radius:6px;">
            Reset Password
          </a>
        </p>
        <p style="color:#718096;font-size:13px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        <p style="margin-top:24px;color:#718096;font-size:13px;">Powered by OuterJoin</p>
      </div>
    `,
  });
}
