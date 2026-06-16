// Supabase Edge Function: send-email
//
// Generic dispatcher that picks an email template by `template` key and sends
// it via Resend wrapped in the Marketing iO header + footer.
//
// POST JSON:
//   {
//     template: "forgot_password" | "invoice_issued" | ...,
//     to: "client@example.com",
//     payload: { ... template-specific fields ... },
//     from?: "Marketing iO <hello@marketingio.co.za>"
//   }
//
// Deploy:
//   supabase functions deploy send-email --no-verify-jwt
//   supabase secrets set RESEND_API_KEY=re_xxx

import { emailLayout, emailButton, escapeHtml, sendViaResend, BILLING_FROM, DEFAULT_FROM, APP_URL, SUPPORT_EMAIL } from '../_shared/email.ts';

const HELP_LINE = `<p style="font-size:14px;color:#64748b;margin:24px 0 0 0;">Need help? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:#e63946;text-decoration:none;">${SUPPORT_EMAIL}</a>.</p>`;
const fmtZar = (n: number | string | null | undefined) =>
  'R ' + Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Email = { subject: string; html: string; from?: string };

const TEMPLATES: Record<string, (p: any) => Email> = {
  forgot_password: (p: { fullName: string; resetUrl: string; expiresInMinutes?: number }) => ({
    subject: 'Reset your Marketing iO password',
    html: emailLayout(`
<p>Hi ${escapeHtml(p.fullName)},</p>
<p>We received a request to reset your Marketing iO password. The link expires in <strong>${p.expiresInMinutes ?? 30} minutes</strong>.</p>
${emailButton('Reset password', p.resetUrl)}
<p style="font-size:14px;color:#64748b;">If you didn't request this, ignore — your account is safe.</p>`),
  }),
  welcome: (p: { fullName: string }) => ({
    subject: 'Welcome to Marketing iO',
    html: emailLayout(`
<h1 style="margin:0 0 16px 0;color:#0f172a;">Welcome, ${escapeHtml(p.fullName)}.</h1>
<p>Your Marketing iO account is ready.</p>
${emailButton('Open Marketing iO', APP_URL)}
${HELP_LINE}`),
  }),
  invoice_issued: (p: { clientName: string; invoiceNumber: string; amountZar: number; dueDateIso: string; invoiceUrl: string }) => ({
    from: BILLING_FROM,
    subject: `Invoice ${p.invoiceNumber} — ${fmtZar(p.amountZar)}`,
    html: emailLayout(`
<h2 style="color:#0f172a;margin:0 0 16px 0;">Your invoice is ready</h2>
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>Invoice <strong>${escapeHtml(p.invoiceNumber)}</strong> for <strong>${fmtZar(p.amountZar)}</strong> is due <strong>${new Date(p.dueDateIso).toLocaleDateString('en-ZA')}</strong>.</p>
${emailButton('View & pay invoice', p.invoiceUrl)}
${HELP_LINE}`),
  }),
  invoice_chase: (p: { clientName: string; invoiceNumber: string; amountZar: number; daysOverdue: number; invoiceUrl: string }) => ({
    from: BILLING_FROM,
    subject: `Invoice ${p.invoiceNumber} is overdue`,
    html: emailLayout(`
<h2 style="color:#e63946;margin:0 0 16px 0;">Friendly reminder — invoice overdue</h2>
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>Invoice <strong>${escapeHtml(p.invoiceNumber)}</strong> (<strong>${fmtZar(p.amountZar)}</strong>) is <strong>${p.daysOverdue} day(s) overdue</strong>.</p>
${emailButton('Pay now', p.invoiceUrl)}
${HELP_LINE}`),
  }),
  payment_receipt: (p: { clientName: string; invoiceNumber?: string; amountZar: number; paymentMethod: string; paidAtIso: string }) => ({
    from: BILLING_FROM,
    subject: `Receipt — ${fmtZar(p.amountZar)}`,
    html: emailLayout(`
<h2 style="color:#0f172a;margin:0 0 16px 0;">Payment received</h2>
<p>Hi ${escapeHtml(p.clientName)}, thanks for your payment of <strong>${fmtZar(p.amountZar)}</strong> via ${escapeHtml(p.paymentMethod)} on ${new Date(p.paidAtIso).toLocaleString('en-ZA')}.</p>
${p.invoiceNumber ? `<p>Invoice: <strong>${escapeHtml(p.invoiceNumber)}</strong></p>` : ''}`),
  }),
  contract_for_signature: (p: { clientName: string; packageName: string; signUrl: string }) => ({
    subject: 'Sign your Marketing iO agreement',
    html: emailLayout(`
<h2 style="color:#0f172a;margin:0 0 16px 0;">Your agreement is ready to sign</h2>
<p>Hi ${escapeHtml(p.clientName)}, please review and sign your <strong>${escapeHtml(p.packageName)}</strong> agreement.</p>
${emailButton('Review & sign', p.signUrl)}`),
  }),
  contract_signed: (p: { clientName: string; packageName: string; portalUrl: string }) => ({
    subject: 'Your contract is signed',
    html: emailLayout(`
<p>Hi ${escapeHtml(p.clientName)}, your <strong>${escapeHtml(p.packageName)}</strong> agreement is fully signed. Welcome aboard.</p>
${emailButton('Open portal', p.portalUrl)}`),
  }),
  signup_otp: (p: { firstName: string; otp: string }) => ({
    subject: `Your code: ${p.otp}`,
    html: emailLayout(`
<h2 style="color:#0f172a;">Verify your email</h2>
<p>Hi ${escapeHtml(p.firstName)}, use this code to verify your email:</p>
<p style="font-size:36px;letter-spacing:8px;font-weight:700;color:#0a1f4d;text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:24px 0;">${escapeHtml(p.otp)}</p>
<p style="font-size:14px;color:#64748b;">Expires in 10 minutes.</p>`),
  }),
  generic: (p: { subject: string; bodyHtml: string }) => ({
    subject: p.subject,
    html: emailLayout(p.bodyHtml),
  }),
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }
  const { template, to, payload, from } = body ?? {};
  if (!template || !TEMPLATES[template]) return Response.json({ error: `Unknown template: ${template}` }, { status: 400 });
  if (!to) return Response.json({ error: 'to required' }, { status: 400 });

  const tmpl = TEMPLATES[template](payload ?? {});
  const result = await sendViaResend({
    to,
    subject: tmpl.subject,
    html: tmpl.html,
    from: from ?? tmpl.from ?? DEFAULT_FROM,
  });
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 502 });
  return Response.json({ ok: true, id: result.id });
});
