import { Resend } from "resend";
import { MODULE_DEFS } from "./modules";
import type { TenantBranding, ModuleKey } from "./types";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  return new Resend(key);
}

const FROM = "ARIA Score Card <noreply@outerjoin.co.za>";
const ARIA_LOGO = "https://aria-score-card-portal.vercel.app/aria-logo.png";

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  tenantName: string;
  siteUrl: string;
  email: string;
  password: string;
  forcePasswordChange: boolean;
  branding?: TenantBranding;
  enabledModules?: ModuleKey[];
}): Promise<void> {
  const resend = getResend();
  const primary = params.branding?.primaryColor || "#3D6273";
  const accent = params.branding?.accentColor || "#E04E2A";
  const clientLogo = params.branding?.logoUrl;
  const loginUrl = params.siteUrl ? `${params.siteUrl}/login` : "";

  // Build module list
  const enabledSet = new Set(params.enabledModules || []);
  const moduleRows = MODULE_DEFS.map((mod) => {
    const enabled = enabledSet.has(mod.key);
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #EDF2F7;">
          <span style="display:inline-block;width:18px;height:18px;border-radius:50%;text-align:center;line-height:18px;font-size:12px;color:#fff;background:${enabled ? "#38A169" : "#CBD5E0"};margin-right:8px;">${enabled ? "&#10003;" : "&#10005;"}</span>
          <span style="color:${enabled ? "#2D3748" : "#A0AEC0"};${enabled ? "" : "text-decoration:line-through;"}">${mod.label}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #EDF2F7;color:${enabled ? "#38A169" : "#A0AEC0"};font-size:13px;font-weight:600;">
          ${enabled ? "Active" : "Not Included"}
        </td>
      </tr>`;
  }).join("");

  const pwNote = params.forcePasswordChange
    ? `<p style="margin:12px 0;padding:10px 14px;background:#FFF5F5;border-left:4px solid ${accent};border-radius:4px;font-size:13px;color:#C53030;">
        You will be prompted to change your password on first login.
      </p>`
    : "";

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `Welcome to ${params.tenantName} — ARIA Score Card`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
        <!-- Header Banner -->
        <div style="background:${primary};padding:28px 32px;text-align:center;border-radius:8px 8px 0 0;">
          <table style="margin:0 auto;" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:${clientLogo ? "16px" : "0"};">
              <img src="${ARIA_LOGO}" alt="ARIA" width="40" height="40" style="display:block;border-radius:8px;" />
            </td>
            ${clientLogo ? `<td><img src="${clientLogo}" alt="${params.tenantName}" width="40" height="40" style="display:block;border-radius:8px;object-fit:contain;background:#fff;padding:4px;" /></td>` : ""}
          </tr></table>
          <h1 style="color:#ffffff;font-size:22px;margin:16px 0 4px;font-weight:700;">Welcome to ARIA Score Card</h1>
          <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">${params.tenantName}</p>
        </div>

        <!-- Body -->
        <div style="padding:32px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 8px 8px;">
          <p style="font-size:15px;color:#2D3748;margin:0 0 16px;">Hi ${params.name},</p>
          <p style="font-size:14px;color:#4A5568;margin:0 0 24px;line-height:1.6;">
            Your scorecard portal account has been created for <strong>${params.tenantName}</strong>.
            You can use the credentials below to log in and start tracking performance across your scorecards.
          </p>

          <!-- Credentials Box -->
          <div style="background:#F7FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#718096;margin:0 0 12px;font-weight:600;">Your Login Details</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#718096;width:80px;">Email</td>
                <td style="padding:6px 0;font-size:14px;color:#2D3748;font-weight:600;">${params.email}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#718096;">Password</td>
                <td style="padding:6px 0;font-size:14px;color:#2D3748;font-family:monospace;font-weight:600;">${params.password}</td>
              </tr>
            </table>
          </div>

          ${pwNote}

          <!-- Login Button -->
          ${loginUrl ? `
          <div style="text-align:center;margin:28px 0;">
            <a href="${loginUrl}" style="display:inline-block;padding:14px 36px;background:${primary};color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.3px;">
              Log In to Your Portal
            </a>
            <p style="margin:10px 0 0;font-size:12px;color:#A0AEC0;">${loginUrl}</p>
          </div>
          ` : ""}

          <!-- Modules Section -->
          ${params.enabledModules ? `
          <div style="margin-top:28px;border-top:1px solid #E2E8F0;padding-top:24px;">
            <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#718096;margin:0 0 12px;font-weight:600;">Your Scorecard Modules</p>
            <table style="width:100%;border-collapse:collapse;border:1px solid #E2E8F0;border-radius:8px;">
              ${moduleRows}
            </table>
            <p style="font-size:12px;color:#A0AEC0;margin:8px 0 0;">Modules marked as "Not Included" can be activated — speak to your CAM for details.</p>
          </div>
          ` : ""}

          <!-- Footer -->
          <div style="margin-top:32px;padding-top:20px;border-top:1px solid #E2E8F0;text-align:center;">
            <p style="font-size:12px;color:#A0AEC0;margin:0;">Powered by <strong style="color:#718096;">OuterJoin</strong></p>
          </div>
        </div>
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
