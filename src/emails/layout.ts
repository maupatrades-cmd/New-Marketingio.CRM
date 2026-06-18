/**
 * Marketing iO email layout.
 *
 * Single source of truth for the header + footer image used across every
 * outgoing email. Per the v2 brand refresh both slots use the same
 * Cloudinary image:
 *   https://res.cloudinary.com/didwjb1et/image/upload/v1781625284/marketingio_footer_clean_1_ykjdzr.png
 *
 * Body content is injected into the middle. The wrapper is a bullet-proof
 * Outlook-friendly table layout so the email renders consistently across
 * Gmail, Outlook, Apple Mail and the SA-popular WhatsApp/Workspace clients.
 */

export const EMAIL_HEADER_IMAGE =
  'https://res.cloudinary.com/didwjb1et/image/upload/v1781625284/marketingio_footer_clean_1_ykjdzr.png';

export const EMAIL_FOOTER_IMAGE = EMAIL_HEADER_IMAGE;

export const APP_URL = import.meta.env?.VITE_APP_URL ?? 'https://app.marketingio.co.za';
export const SUPPORT_EMAIL = 'support@marketingio.co.za';
export const BILLING_FROM = 'Marketing iO Billing <hello@marketingio.co.za>';
export const TEAM_FROM = 'Marketing iO Team <hello@marketingio.co.za>';

export interface EmailLayoutOptions {
  /** Optional preheader text shown next to the subject in some clients. */
  preheader?: string;
  /** Browser tab title. Defaults to "Marketing iO". */
  title?: string;
}

/**
 * Wrap a body HTML fragment with the standard Marketing iO header + footer.
 */
export function emailLayout(bodyHtml: string, opts: EmailLayoutOptions = {}): string {
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

      <!-- HEADER -->
      <tr><td align="center" style="padding:0;font-size:0;line-height:0;background-color:#0a0a2e;">
        <img src="${EMAIL_HEADER_IMAGE}" width="600" alt="Marketing iO" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;"/>
      </td></tr>

      <!-- CONTENT -->
      <tr><td style="padding:32px 24px;background-color:#ffffff;font-size:16px;line-height:1.6;color:#1e293b;font-family:Arial,Helvetica,sans-serif;">
${bodyHtml}
      </td></tr>

      <!-- FOOTER -->
      <tr><td align="center" style="padding:0;font-size:0;line-height:0;background-color:#0a0a2e;">
        <img src="${EMAIL_FOOTER_IMAGE}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;"/>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Inline button styled with the Marketing iO brand gradient. */
export function emailButton(label: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr><td>
  <a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#e63946 0%,#ff2e97 100%);color:#ffffff;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;text-decoration:none;">${escapeHtml(label)} →</a>
</td></tr></table>`;
}

/** Conservative HTML escape for text dropped into the layout. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Format ZAR amount as "R 1,234.00". */
export function fmtZar(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return 'R ' + v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
