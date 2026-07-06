// send-email — branded transactional email dispatcher.
//
// APP_URL is read from the Supabase secret. Fallback points at the
// claude/integration Vercel preview — NOT app.marketingio.co.za,
// because that domain still serves the legacy Base44 CRM until the
// new build replaces it at go-live.

const EMAIL_HEADER_IMAGE = 'https://res.cloudinary.com/didwjb1et/image/upload/v1781625284/marketingio_footer_clean_1_ykjdzr.png';
const EMAIL_FOOTER_IMAGE = EMAIL_HEADER_IMAGE;
// Pinned to the claude/integration preview. The Supabase APP_URL secret
// was pointing at a stale preview (bohr-rtmzizi) and breaking client
// email links, so we ignore the env var here.
const APP_URL = 'https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app';
const SUPPORT_EMAIL = 'support@marketingio.co.za';
const DEFAULT_FROM = 'Marketing iO <hello@marketingio.co.za>';
const BILLING_FROM = 'Marketing iO Billing <hello@marketingio.co.za>';

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function emailLayout(bodyHtml: string, opts: { preheader?: string; title?: string } = {}): string {
  const title = opts.title ?? 'Marketing iO';
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#0a0a2e;opacity:0;">${escapeHtml(opts.preheader)}</div>` : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background-color:#0a0a2e;font-family:Arial,Helvetica,sans-serif;">${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a2e;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-collapse:collapse;">
<tr><td align="center" style="padding:0;font-size:0;line-height:0;background-color:#0a0a2e;"><img src="${EMAIL_HEADER_IMAGE}" width="600" alt="Marketing iO" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;"/></td></tr>
<tr><td style="padding:32px 24px;background-color:#ffffff;font-size:16px;line-height:1.6;color:#1e293b;font-family:Arial,Helvetica,sans-serif;">${bodyHtml}</td></tr>
<tr><td align="center" style="padding:0;font-size:0;line-height:0;background-color:#0a0a2e;"><img src="${EMAIL_FOOTER_IMAGE}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;"/></td></tr>
</table></td></tr></table></body></html>`;
}
function emailButton(label: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr><td>
  <a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#e63946 0%,#ff2e97 100%);color:#ffffff;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;text-decoration:none;">${escapeHtml(label)} →</a>
</td></tr></table>`;
}
const fmtZar = (n: number | string | null | undefined) => 'R ' + Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const HELP_LINE = `<p style="font-size:14px;color:#64748b;margin:24px 0 0 0;">Need help? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:#e63946;text-decoration:none;">${SUPPORT_EMAIL}</a>.</p>`;

type Email = { subject: string; html: string; from?: string };

function onboardingInviteRecap(p: any): Email {
  const url = p.onboardingUrl ?? `${APP_URL}/client/onboarding`;
  const profile = p.profile ?? {};
  const fields: [string, string | undefined][] = [
    ['What you do', profile.businessDoes],['Your ideal customers', profile.idealCustomers],['Your main goal', profile.goal],
    ['What makes you different', profile.differentiator],['Location / service area', profile.location],
    ['How customers find you', profile.howFound],['Your social handles', profile.socials],['Main competitor', profile.competitor],
    ['Busiest times / season', profile.busiest],['Typical price range', profile.priceRange],
    ['WhatsApp number', profile.whatsapp],['Things to avoid', profile.avoid],['Brand assets', profile.brandAssets],
  ];
  const captured = fields.filter(([, v]) => v && String(v).trim());
  const blanks = fields.filter(([, v]) => !v || !String(v).trim()).map(([label]) => label);
  const stillNeeded = [...blanks, ...(p.outstanding ?? [])];
  const capturedRows = captured.map(([label, v]) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eef1f6;font-size:13px;color:#64748b;width:42%;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #eef1f6;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(String(v))}</td></tr>`).join('');
  const capturedBlock = captured.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef1f6;border-radius:10px;border-collapse:separate;overflow:hidden;margin:0 0 24px 0;">${capturedRows}</table>`
    : `<p style="margin:0 0 24px 0;font-size:14px;color:#64748b;">We'll capture your details together during onboarding.</p>`;
  const stillNeededBlock = stillNeeded.length
    ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;margin:0 0 24px 0;"><p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#9a3412;">Still needed to complete your profile:</p><ul style="margin:0;padding-left:20px;color:#7c2d12;font-size:14px;line-height:1.7;">${stillNeeded.map(i=>`<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`
    : '';
  const hero = p.heroImageUrl ? `<div style="margin:8px 0 24px 0;border-radius:12px;overflow:hidden;"><img src="${p.heroImageUrl}" alt="" style="width:100%;height:auto;display:block;border:0;"/></div>` : '';
  const body = `<h1 style="margin:0 0 8px 0;font-size:28px;font-weight:bold;color:#0f172a;line-height:1.25;">Let's confirm your details, ${escapeHtml(p.businessName)}</h1>
<p style="margin:0 0 22px 0;font-size:16px;color:#475569;line-height:1.6;">Here's everything we captured about <strong style="color:#0f172a;">${escapeHtml(p.businessName)}</strong>. Please check it's right — and add anything still missing — so we can start getting you seen.</p>
${hero}<h3 style="margin:24px 0 10px 0;font-size:16px;font-weight:bold;color:#e63946;">What we have so far</h3>
${capturedBlock}${stillNeededBlock}${emailButton('Confirm & complete your profile', url)}
<p style="margin:24px 0 0 0;font-size:14px;color:#64748b;line-height:1.6;">Tap the button to review everything, fix anything that's not quite right, and upload your logo and photos.</p>${HELP_LINE}`;
  return { subject: `${p.businessName} — please confirm your details`, html: emailLayout(body, { preheader: "Here's what we have — confirm and complete your profile." }) };
}

function clientWelcomeMagicLink(p: { businessName: string; firstName?: string; magicLink: string; expiresInHours?: number }): Email {
  const greeting = p.firstName || p.businessName;
  const hours = p.expiresInHours ?? 24;
  const body = `
<h1 style="margin:0 0 12px 0;font-size:30px;font-weight:bold;color:#0f172a;line-height:1.2;">
  Dumela, ${escapeHtml(greeting)} 👋
</h1>
<p style="margin:0 0 20px 0;font-size:16px;color:#475569;line-height:1.6;">
  Welcome to your <strong style="color:#e63946;">Marketing iO</strong> portal.
  Tap the button below to sign in instantly — no password needed.
</p>
${emailButton('Open my portal', p.magicLink)}
<div style="background:#f8fafc;border:1px solid #eef1f6;border-radius:10px;padding:14px 16px;margin:0 0 20px 0;">
  <p style="margin:0 0 6px 0;font-size:13px;color:#64748b;font-weight:600;">Inside, you'll find:</p>
  <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:1.7;">
    <li>Your contract to review and sign</li>
    <li>Your invoices and payments</li>
    <li>Real-time deliverable updates</li>
    <li>A direct message line to your team</li>
  </ul>
</div>
<p style="font-size:13px;color:#94a3b8;margin:16px 0 0 0;">
  This link expires in <strong>${hours} hours</strong>. If it expires, just request a new one from the sign-in page.
</p>
${HELP_LINE}`;
  return {
    subject: `Dumela, ${greeting} — your Marketing iO portal is ready`,
    html: emailLayout(body, { preheader: 'Tap to open your portal — no password needed.' }),
  };
}

// owner_sale_alert — sent to every owner-side recipient when a sale,
// upsell, or sales opportunity closes (event_type drives copy).
function ownerSaleAlert(p: any): Email {
  const emoji    = p.eventEmoji ?? '💰';
  const headline = p.eventHeadline ?? 'New sale logged';
  const total    = Number(p.setupFee ?? 0) + Number(p.monthlyRetainer ?? 0);
  const row = (label: string, value: string) =>
    `<tr><td style="padding:9px 14px;border-bottom:1px solid #eef1f6;font-size:13px;color:#64748b;width:42%;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:9px 14px;border-bottom:1px solid #eef1f6;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(value)}</td></tr>`;
  const body = `
<h1 style="margin:0 0 10px 0;font-size:26px;font-weight:bold;color:#0f172a;line-height:1.25;">
  ${escapeHtml(emoji)} ${escapeHtml(headline)}
</h1>
<p style="margin:0 0 18px 0;font-size:16px;color:#475569;line-height:1.6;">
  <strong style="color:#0f172a;">${escapeHtml(p.businessName)}</strong> just landed.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="border:1px solid #eef1f6;border-radius:12px;border-collapse:separate;overflow:hidden;margin:0 0 22px 0;">
  ${row('Package', p.packageName ?? '—')}
  ${row('Setup fee', fmtZar(p.setupFee))}
  ${row('Monthly retainer', fmtZar(p.monthlyRetainer))}
  ${row('Total first month', fmtZar(total))}
  ${row('Closed by', p.closerName ?? '—')}
  ${p.closerRole ? row('Closer role', String(p.closerRole)) : ''}
  ${p.source ? row('Source', String(p.source)) : ''}
</table>
${emailButton('View the deal', p.dealUrl ?? `${APP_URL}/owner/sales/deals`)}
<p style="margin:22px 0 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
  Sent automatically when a sale is logged.
</p>${HELP_LINE}`;
  return {
    subject: `${emoji} New sale: ${p.businessName} — ${p.packageName} (${fmtZar(total)})`,
    html: emailLayout(body, {
      preheader: `${p.businessName} signed ${p.packageName} — ${fmtZar(total)} first month.`,
      title: 'Owner sale alert — Marketing iO',
    }),
  };
}

// payment_success — the "you're in the spotlight" celebration moment.
// Mirrors src/_shared/paymentSuccess.ts. Inlined here because send-email
// stays a single self-contained file.
function paymentSuccess(p: any): Email {
  const paid = p.paidDateIso ? new Date(p.paidDateIso).toLocaleDateString('en-ZA') : null;
  const hero = p.heroImageUrl
    ? `<div style="margin:0 0 24px 0;border-radius:14px;overflow:hidden;">
         <img src="${escapeHtml(p.heroImageUrl)}" alt="" style="width:100%;height:auto;display:block;border:0;"/>
       </div>`
    : '';
  const receiptRow = (label: string, value: string) =>
    `<tr>
       <td style="padding:9px 14px;border-bottom:1px solid #eef1f6;font-size:13px;color:#64748b;width:45%;">${escapeHtml(label)}</td>
       <td style="padding:9px 14px;border-bottom:1px solid #eef1f6;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(value)}</td>
     </tr>`;
  const body = `
<h1 style="margin:0 0 10px 0;font-size:28px;font-weight:bold;color:#0f172a;line-height:1.25;">
  Payment received — welcome to the spotlight, ${escapeHtml(p.businessName)}! 🎉
</h1>
<p style="margin:0 0 22px 0;font-size:16px;color:#475569;line-height:1.6;">
  Your <strong style="color:#e63946;">${escapeHtml(p.packageName)}</strong> payment is in, and your
  journey to being <em>Too Good To Stay Hidden</em> is officially underway. Here's to getting
  ${escapeHtml(p.businessName)} seen.
</p>
${hero}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="border:1px solid #eef1f6;border-radius:12px;border-collapse:separate;overflow:hidden;margin:0 0 24px 0;">
  ${receiptRow('Package', p.packageName)}
  ${receiptRow('Amount paid', fmtZar(p.amountZar))}
  ${receiptRow('Invoice', p.invoiceNumber)}
  ${paid ? receiptRow('Date', paid) : ''}
</table>
${emailButton('Go to my portal', p.portalUrl ?? `${APP_URL}/client`)}
<p style="margin:22px 0 0 0;font-size:14px;color:#64748b;line-height:1.6;">
  Our team is already getting things moving. You'll see your deliverables take shape right inside your portal.
</p>
${HELP_LINE}`;
  return {
    from: BILLING_FROM,
    subject: `Payment received — ${fmtZar(p.amountZar)} · ${p.packageName}`,
    html: emailLayout(body, {
      preheader: `Thank you, ${p.businessName}! Your ${p.packageName} payment is confirmed.`,
      title: 'Payment received — Marketing iO',
    }),
  };
}

function hotLeadAlert(p: { businessName: string; capturer: string; phone: string; interest: string; leadUrl: string }): Email {
  const body = `
<h1 style="margin:0 0 8px 0;font-size:26px;font-weight:bold;color:#0f172a;line-height:1.25;">🔥 Hot lead — ${escapeHtml(p.businessName)}</h1>
<p style="margin:0 0 22px 0;font-size:16px;color:#475569;line-height:1.6;">A lead just turned <strong style="color:#e63946;">hot</strong> and needs your attention.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="border:1px solid #eef1f6;border-radius:12px;border-collapse:separate;overflow:hidden;margin:0 0 24px 0;">
  <tr><td style="padding:10px 14px;border-bottom:1px solid #eef1f6;font-size:13px;color:#64748b;width:40%;vertical-align:top;">Business</td><td style="padding:10px 14px;border-bottom:1px solid #eef1f6;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(p.businessName)}</td></tr>
  <tr><td style="padding:10px 14px;border-bottom:1px solid #eef1f6;font-size:13px;color:#64748b;vertical-align:top;">Captured by</td><td style="padding:10px 14px;border-bottom:1px solid #eef1f6;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(p.capturer)}</td></tr>
  <tr><td style="padding:10px 14px;border-bottom:1px solid #eef1f6;font-size:13px;color:#64748b;vertical-align:top;">Phone</td><td style="padding:10px 14px;border-bottom:1px solid #eef1f6;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(p.phone)}</td></tr>
  <tr><td style="padding:10px 14px;font-size:13px;color:#64748b;vertical-align:top;">Interest</td><td style="padding:10px 14px;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(p.interest)}</td></tr>
</table>
${emailButton('View lead', p.leadUrl)}
${HELP_LINE}`;
  return {
    subject: `🔥 Hot lead — ${p.businessName}`,
    html: emailLayout(body, { preheader: `${p.businessName} is hot — act now.`, title: 'Hot lead — Marketing iO' }),
  };
}

function leadAssigned(p: { businessName: string; assignedByName: string; leadUrl: string }): Email {
  const body = `
<h1 style="margin:0 0 8px 0;font-size:26px;font-weight:bold;color:#0f172a;">Lead assigned to you</h1>
<p style="margin:0 0 20px 0;font-size:16px;color:#475569;line-height:1.6;">
  <strong style="color:#0f172a;">${escapeHtml(p.assignedByName)}</strong> has assigned you a new lead:
  <strong style="color:#e63946;">${escapeHtml(p.businessName)}</strong>.
</p>
${emailButton('View lead', p.leadUrl)}
${HELP_LINE}`;
  return {
    subject: `Lead assigned — ${p.businessName}`,
    html: emailLayout(body, { preheader: `${p.assignedByName} assigned you a lead: ${p.businessName}.` }),
  };
}

function leadClarification(p: { submitterName: string; businessName: string; clarificationNote: string; leadUrl: string }): Email {
  const body = `
<h1 style="margin:0 0 8px 0;font-size:26px;font-weight:bold;color:#0f172a;">Lead needs clarification</h1>
<p style="margin:0 0 16px 0;font-size:16px;color:#475569;line-height:1.6;">
  Hi ${escapeHtml(p.submitterName)}, your lead <strong style="color:#e63946;">${escapeHtml(p.businessName)}</strong>
  needs a bit more information before it can be verified.
</p>
<div style="background:#f8fafc;border-left:4px solid #e63946;border-radius:4px;padding:14px 18px;margin:0 0 24px 0;font-size:15px;color:#1e293b;line-height:1.6;">
  ${escapeHtml(p.clarificationNote)}
</div>
${emailButton('View lead', p.leadUrl)}
${HELP_LINE}`;
  return {
    subject: `Clarification needed — ${p.businessName}`,
    html: emailLayout(body, { preheader: `Your lead ${p.businessName} needs more info.` }),
  };
}

const TEMPLATES: Record<string, (p: any) => Email> = {
  test: (p) => ({ subject: 'Marketing iO email test', html: emailLayout(`<h1 style="margin:0 0 16px 0;color:#0f172a;">Pipeline live</h1><p>Hi ${escapeHtml(p.name ?? 'there')}.</p>${emailButton('Open Marketing iO', APP_URL)}${HELP_LINE}`) }),
  forgot_password: (p) => ({ subject: 'Reset your Marketing iO password',
    html: emailLayout(`<p>Hi ${escapeHtml(p.fullName)},</p><p>The link expires in <strong>${p.expiresInMinutes ?? 30} minutes</strong>.</p>${emailButton('Reset password', p.resetUrl)}`) }),
  welcome: (p) => ({ subject: 'Welcome to Marketing iO',
    html: emailLayout(`<h1 style="margin:0 0 16px 0;color:#0f172a;">Welcome, ${escapeHtml(p.fullName)}.</h1>${emailButton('Open Marketing iO', APP_URL)}${HELP_LINE}`) }),
  invoice_issued: (p) => ({ from: BILLING_FROM, subject: `Invoice ${p.invoiceNumber} — ${fmtZar(p.amountZar)}`,
    html: emailLayout(`<h2 style="color:#0f172a;">Your invoice is ready</h2><p>Hi ${escapeHtml(p.clientName)}, invoice <strong>${escapeHtml(p.invoiceNumber)}</strong> for <strong>${fmtZar(p.amountZar)}</strong> is due <strong>${new Date(p.dueDateIso).toLocaleDateString('en-ZA')}</strong>.</p>${emailButton('View & pay invoice', p.invoiceUrl)}${HELP_LINE}`) }),
  invoice_chase: (p) => ({ from: BILLING_FROM, subject: `Invoice ${p.invoiceNumber} is overdue`,
    html: emailLayout(`<h2 style="color:#e63946;">Friendly reminder</h2><p>Invoice <strong>${escapeHtml(p.invoiceNumber)}</strong> is overdue.</p>${emailButton('Pay now', p.invoiceUrl)}${HELP_LINE}`) }),
  payment_receipt: (p) => ({ from: BILLING_FROM, subject: `Receipt — ${fmtZar(p.amountZar)}`,
    html: emailLayout(`<h2 style="color:#0f172a;">Payment received</h2><p>Hi ${escapeHtml(p.clientName)}, thanks for paying <strong>${fmtZar(p.amountZar)}</strong>.</p>`) }),
  contract_for_signature: (p) => ({ subject: 'Sign your Marketing iO agreement',
    html: emailLayout(`<h2 style="color:#0f172a;">Your agreement is ready to sign</h2><p>Hi ${escapeHtml(p.clientName)}, please review and sign your <strong>${escapeHtml(p.packageName)}</strong> agreement.</p>${emailButton('Review & sign', p.signUrl)}`) }),
  contract_signed: (p) => ({ subject: 'Your contract is signed',
    html: emailLayout(`<p>Hi ${escapeHtml(p.clientName)}, your <strong>${escapeHtml(p.packageName)}</strong> agreement is fully signed.</p>${emailButton('Open portal', p.portalUrl)}`) }),
  signup_otp: (p) => ({ subject: `Your code: ${p.otp}`,
    html: emailLayout(`<h2 style="color:#0f172a;">Verify your email</h2><p style="font-size:36px;letter-spacing:8px;font-weight:700;color:#0a1f4d;text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:24px 0;">${escapeHtml(p.otp)}</p>`) }),
  onboarding_invite_recap: onboardingInviteRecap,
  client_welcome_magic_link: clientWelcomeMagicLink,
  payment_success: paymentSuccess,
  owner_sale_alert: ownerSaleAlert,
  hot_lead_alert: hotLeadAlert,
  lead_assigned: leadAssigned,
  lead_clarification: leadClarification,
  client_welcome_set_password: (p) => ({
    subject: 'Welcome to Marketing iO — set your password',
    html: emailLayout(`
      <p>Hi ${escapeHtml(p.firstName ?? p.businessName ?? 'there')},</p>
      <p>Welcome to Marketing iO! Your <strong>${escapeHtml(p.packageName ?? 'marketing')}</strong> account is ready.</p>
      <p>Create your password to access your client portal — track deliverables, view invoices, download contracts, and message your team.</p>
      ${emailButton('Set my password', p.inviteUrl)}
      <p style="color:#6B7280;font-size:13px;">This link expires in ${p.expiresInHours ?? 24} hours. After setting your password you can sign in anytime at <a href="${APP_URL}/login" style="color:#e63946;">${APP_URL}/login</a>.</p>
    `),
  }),
  set_password: (p) => ({
    subject: 'Set your Marketing iO password',
    html: emailLayout(`
      <p>Hi ${escapeHtml(p.clientName ?? 'there')},</p>
      <p>You asked to set a password for your Marketing iO portal. Tap below to create it.</p>
      ${emailButton('Set my password', p.resetUrl)}
      <p style="color:#6B7280;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
    `),
  }),
  onboarding_form_invite: (p) => ({
    subject: `${p.clientName} — your onboarding form is ready`,
    html: emailLayout(`
      <p>Hi ${escapeHtml(p.clientName)},</p>
      <p>Welcome to Marketing iO! Your contract is signed and we're ready to begin.</p>
      <p>Please complete your onboarding form so our team can start setting up your marketing. It takes about 15 minutes.</p>
      ${emailButton('Complete my onboarding', p.onboardingUrl)}
      <p style="color:#6B7280;font-size:13px;">If you have brand files (logos, photos, flyers), you can upload them directly in the form.</p>
    `)
  }),
  generic: (p) => ({ subject: p.subject, html: emailLayout(p.bodyHtml) }),
};

async function sendViaResend(p: { to: string | string[]; subject: string; html: string; from?: string; replyTo?: string }) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, error: 'RESEND_API_KEY not configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: p.from ?? DEFAULT_FROM, to: p.to, subject: p.subject, html: p.html, reply_to: p.replyTo }),
  });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
  const data = await res.json();
  return { ok: true, id: data?.id };
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  let body: any; try { body = await req.json(); } catch { return Response.json({ error: 'Bad JSON' }, { status: 400, headers: cors }); }
  const { template, to, payload, from } = body ?? {};
  if (!template || !TEMPLATES[template]) return Response.json({ error: `Unknown template: ${template}` }, { status: 400, headers: cors });
  if (!to) return Response.json({ error: 'to required' }, { status: 400, headers: cors });
  const tmpl = TEMPLATES[template](payload ?? {});
  const result = await sendViaResend({ to, subject: tmpl.subject, html: tmpl.html, from: from ?? tmpl.from ?? DEFAULT_FROM });
  if (!result.ok) return Response.json({ ok: false, error: result.error, status: result.status }, { status: 502, headers: cors });
  return Response.json({ ok: true, id: result.id }, { headers: cors });
});
