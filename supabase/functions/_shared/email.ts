// Supabase Edge Function shared email helper (Deno runtime).
// Mirrors src/emails/layout.ts so server-side senders use the same
// Cloudinary header + footer image.

export const EMAIL_HEADER_IMAGE =
  'https://res.cloudinary.com/didwjb1et/image/upload/v1781625284/marketingio_footer_clean_1_ykjdzr.png';
export const EMAIL_FOOTER_IMAGE = EMAIL_HEADER_IMAGE;

export const APP_URL = Deno.env.get('APP_URL') ?? 'https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app';
export const SUPPORT_EMAIL = 'support@marketingio.co.za';
export const DEFAULT_FROM = 'Marketing iO Team <hello@marketingio.co.za>';
export const BILLING_FROM = 'Marketing iO Billing <hello@marketingio.co.za>';

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function emailLayout(bodyHtml: string, opts: { preheader?: string; title?: string } = {}): string {
  const title = opts.title ?? 'Marketing iO';
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#0a0a2e;opacity:0;">${escapeHtml(opts.preheader)}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#0a0a2e;font-family:Arial,Helvetica,sans-serif;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a2e;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-collapse:collapse;">
      <tr><td align="center" style="padding:0;font-size:0;line-height:0;background-color:#0a0a2e;">
        <img src="${EMAIL_HEADER_IMAGE}" width="600" alt="Marketing iO" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;"/>
      </td></tr>
      <tr><td style="padding:32px 24px;background-color:#ffffff;font-size:16px;line-height:1.6;color:#1e293b;font-family:Arial,Helvetica,sans-serif;">
${bodyHtml}
      </td></tr>
      <tr><td align="center" style="padding:0;font-size:0;line-height:0;background-color:#0a0a2e;">
        <img src="${EMAIL_FOOTER_IMAGE}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;"/>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function emailButton(label: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr><td>
  <a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#e63946 0%,#ff2e97 100%);color:#ffffff;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;text-decoration:none;">${escapeHtml(label)} →</a>
</td></tr></table>`;
}

/**
 * Send via Resend. RESEND_API_KEY must be set as a Supabase secret.
 *
 *   supabase secrets set RESEND_API_KEY=...
 */
export async function sendViaResend(p: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      from: p.from ?? DEFAULT_FROM,
      to: p.to,
      subject: p.subject,
      html: p.html,
      reply_to: p.replyTo,
    }),
  });
  if (!res.ok) return { ok: false, error: await res.text() };
  const data = await res.json();
  return { ok: true, id: data?.id };
}
