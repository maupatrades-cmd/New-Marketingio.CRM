/**
 * Marketing iO email templates — ported from the old Base44 CRM and
 * rewrapped with the new layout (Cloudinary header + footer image).
 *
 * Each template is a pure function that returns { subject, html }. They
 * accept narrow, well-typed inputs so an Edge Function / Resend caller
 * can wire them with no surprises.
 *
 * COVERAGE (mirrors the old `base44/functions/<name>/entry.ts` payloads):
 *  - signupWelcome           (send-signup-welcome-email)
 *  - welcome                 (send-welcome-email)
 *  - forgotPassword          (send-forgot-password-email)
 *  - passwordChanged         (change-password notification)
 *  - signupVerificationOtp   (auth-register OTP)
 *  - loginOtp                (auth-login OTP)
 *  - resendOtp               (resend-otp)
 *  - accountLockdown         (emergency-account-lockdown)
 *  - accountRecovery         (recover-account)
 *  - accountUnlocked         (unlock-account)
 *  - deletionRequested       (request-account-deletion)
 *  - deletionCancelled       (cancel-account-deletion)
 *  - invoiceIssued           (send-invoice-issued-email)
 *  - invoiceChase            (send-invoice-chase)
 *  - paymentReceipt          (send-payment-receipt-email / payfast-send-receipt)
 *  - failedDebitFollowup     (handle-failed-debit-notification)
 *  - contractForSignature    (send-contract-for-signature)
 *  - contractSigned          (notifySignatureComplete / onContractSigned)
 *  - contractRenewal         (sweep-contract-renewals)
 *  - welcomePack             (sendWelcomePack)
 *  - onboardingProgress      (send-onboarding-progress-email)
 *  - onboardingReminder      (sendOnboardingReminders)
 *  - deliverableReady        (notify-client-deliverable-update)
 *  - deliverableApproved     (notifyDeliverableApproved)
 *  - deliverableSubmitted    (notifyDeliverableSubmitted - staff)
 *  - deliverableOverdue      (notifyDeliverableOverdue - staff)
 *  - monthlyReport           (monthly performance report)
 *  - campaignReport          (generate-campaign-report)
 *  - leadNotification        (send-owner-lead-notification)
 *  - threadMessage           (send-thread-message)
 *  - clientCommunication     (notifyClientCommunication)
 *  - adminFormSubmitted      (notifyAdminFormSubmitted)
 *  - enquiryReceived         (submit-enquiry)
 *  - followupReminder        (send-followup-reminder)
 *  - genericNotification     (any one-off transactional email)
 */

import { APP_URL, SUPPORT_EMAIL, emailLayout, emailButton, escapeHtml, fmtZar } from './layout.js';

export interface Email { subject: string; html: string; }

const HELP_LINE = `<p style="font-size:14px;color:#64748b;margin:24px 0 0 0;">Need help? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:#e63946;text-decoration:none;">${SUPPORT_EMAIL}</a>.</p>`;

/* ─────────────────────────── AUTH / ACCOUNT ─────────────────────────── */

export function signupWelcome(p: {
  firstName: string;
  heroImageUrl?: string;
  heroCopy?: string;
  portalUrl?: string;
}): Email {
  const heroBlock = p.heroImageUrl
    ? `<div style="margin:24px 0 32px 0;border-radius:12px;overflow:hidden;">
         <img src="${p.heroImageUrl}" alt="" style="width:100%;height:auto;display:block;"/>
       </div>`
    : '';
  const portal = p.portalUrl ?? `${APP_URL}/client-portal`;
  const heroCopy = p.heroCopy ?? 'Your business deserves more than where it is right now.';

  const body = `
<h1 style="margin:0 0 8px 0;font-size:32px;font-weight:bold;color:#0f172a;line-height:1.2;">Welcome to Marketing iO, ${escapeHtml(p.firstName)}.</h1>
<p style="margin:0 0 24px 0;font-size:18px;color:#475569;line-height:1.5;">This isn't a generic "thanks for signing up" email. Read this — it'll change how you think about your business.</p>
${heroBlock}
<h2 style="margin:0 0 24px 0;font-size:24px;font-weight:bold;color:#1e293b;line-height:1.4;">${escapeHtml(heroCopy)}</h2>

<h3 style="margin:32px 0 12px 0;font-size:20px;font-weight:bold;color:#e63946;">Here's the truth nobody tells South African business owners:</h3>

<p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#334155;">
  <strong>If you're stuck at R50,000 a month in revenue</strong>, it's not because your product is bad. It's because <strong>you're invisible to the people who would already buy from you</strong>.
</p>

<p style="margin:0 0 24px 0;font-size:16px;line-height:1.7;color:#334155;">
  Right now, in your area, customers are typing their problem into Google or scrolling Instagram looking for a solution. They walk into your competitor's shop instead of yours. Why? Because your competitor showed up first.
</p>

<h3 style="margin:32px 0 16px 0;font-size:20px;font-weight:bold;color:#1e293b;">What R50K → R200K actually looks like:</h3>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 24px 0;">
  <tr><td style="padding:16px;background:#fef3f2;border-left:4px solid #e63946;border-radius:4px;">
    <strong style="color:#1e293b;font-size:16px;">Without digital infrastructure (where most SA SMEs are stuck):</strong>
    <ul style="margin:12px 0 0 0;padding-left:20px;color:#475569;font-size:15px;line-height:1.7;">
      <li>You rely on word-of-mouth — slow, unpredictable</li>
      <li>You miss 70% of after-hours customer enquiries</li>
      <li>Competitors with WhatsApp automation reply in 2 seconds</li>
      <li>One bad Google review costs you 30 future customers</li>
      <li>Your "marketing" is boosting random Facebook posts that go nowhere</li>
    </ul>
  </td></tr>
</table>

${emailButton('Open your client portal', portal)}

<p style="margin:24px 0 0 0;font-size:15px;color:#475569;line-height:1.7;">
  We've already started building your business profile inside Marketing iO. Sign in and finish your setup — it takes 3 minutes and unlocks your first proposal.
</p>
${HELP_LINE}`;
  return { subject: `Welcome to Marketing iO, ${p.firstName}`, html: emailLayout(body, { preheader: 'Your account is live. Read this.' }) };
}

export function welcome(p: { fullName: string }): Email {
  const body = `
<h1 style="margin:0 0 16px 0;font-size:28px;color:#0f172a;">Welcome, ${escapeHtml(p.fullName)}.</h1>
<p style="margin:0 0 16px 0;">Your Marketing iO account is ready. Sign in any time and we'll help you grow.</p>
${emailButton('Open Marketing iO', APP_URL)}
${HELP_LINE}`;
  return { subject: 'Welcome to Marketing iO', html: emailLayout(body) };
}

export function forgotPassword(p: { fullName: string; resetUrl: string; expiresInMinutes?: number }): Email {
  const mins = p.expiresInMinutes ?? 30;
  const body = `
<p style="margin:0 0 16px 0;">Hi ${escapeHtml(p.fullName)},</p>
<p style="margin:0 0 16px 0;">We received a request to reset your Marketing iO password.</p>
<p style="margin:0 0 24px 0;">Click the button below to set a new password. The link expires in <strong>${mins} minutes</strong>.</p>
${emailButton('Reset Password', p.resetUrl)}
<p style="font-size:14px;color:#64748b;margin:0 0 16px 0;">Or copy this link:<br><a href="${p.resetUrl}" style="color:#e63946;word-break:break-all;">${p.resetUrl}</a></p>
<p style="font-size:14px;color:#94a3b8;margin:0;">If you didn't request this, ignore this email — your account is safe.</p>`;
  return { subject: 'Reset your Marketing iO password', html: emailLayout(body, { preheader: 'Reset link valid for 30 minutes' }) };
}

export function passwordChanged(p: { fullName: string; whenIso: string; ip?: string }): Email {
  const body = `
<p>Hi ${escapeHtml(p.fullName)},</p>
<p>Your Marketing iO password was just changed on <strong>${escapeHtml(new Date(p.whenIso).toLocaleString('en-ZA'))}</strong>${p.ip ? ` from IP <code>${escapeHtml(p.ip)}</code>` : ''}.</p>
<p>If this was you, no action needed. If you don't recognise this activity, <a href="${APP_URL}/forgot-password" style="color:#e63946;">reset your password</a> immediately and email ${SUPPORT_EMAIL}.</p>`;
  return { subject: 'Your Marketing iO password was changed', html: emailLayout(body) };
}

export function signupVerificationOtp(p: { firstName: string; otp: string }): Email {
  const body = `
<h2 style="color:#0f172a;margin:0 0 16px 0;">Verify your email</h2>
<p>Hi ${escapeHtml(p.firstName)}, welcome to Marketing iO.</p>
<p>Use this 6-digit code to verify your email address. It expires in 10 minutes.</p>
<p style="font-size:36px;letter-spacing:8px;font-weight:700;color:#0a1f4d;text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:24px 0;">${escapeHtml(p.otp)}</p>
<p style="font-size:14px;color:#64748b;">If you didn't request this, ignore this email.</p>`;
  return { subject: `Your Marketing iO code: ${p.otp}`, html: emailLayout(body) };
}

export function loginOtp(p: { fullName: string; otp: string }): Email {
  const body = `
<p>Hi ${escapeHtml(p.fullName)},</p>
<p>Your Marketing iO sign-in code:</p>
<p style="font-size:36px;letter-spacing:8px;font-weight:700;color:#0a1f4d;text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:24px 0;">${escapeHtml(p.otp)}</p>
<p style="font-size:14px;color:#64748b;">If you didn't try to sign in, change your password and email ${SUPPORT_EMAIL}.</p>`;
  return { subject: `Sign-in code: ${p.otp}`, html: emailLayout(body) };
}

export const resendOtp = loginOtp;

export function accountLockdown(p: { fullName: string; reason: string; recoveryUrl: string }): Email {
  const body = `
<h2 style="color:#e63946;margin:0 0 16px 0;">Your Marketing iO account is locked</h2>
<p>Hi ${escapeHtml(p.fullName)},</p>
<p>We locked down your account as a safety measure. Reason: <strong>${escapeHtml(p.reason)}</strong>.</p>
<p>To regain access, start the recovery flow below.</p>
${emailButton('Recover my account', p.recoveryUrl)}
<p style="font-size:14px;color:#64748b;">If this is unexpected, email ${SUPPORT_EMAIL} immediately.</p>`;
  return { subject: 'Marketing iO account locked', html: emailLayout(body) };
}

export function accountRecovery(p: { fullName: string; recoveryUrl: string }): Email {
  const body = `
<p>Hi ${escapeHtml(p.fullName)},</p>
<p>Click below to continue recovering your Marketing iO account. The link expires in 1 hour.</p>
${emailButton('Continue recovery', p.recoveryUrl)}`;
  return { subject: 'Continue your account recovery', html: emailLayout(body) };
}

export function accountUnlocked(p: { fullName: string }): Email {
  const body = `
<h2 style="color:#0f172a;">You're back in.</h2>
<p>Hi ${escapeHtml(p.fullName)}, your Marketing iO account is active again. Sign in any time.</p>
${emailButton('Sign in', `${APP_URL}/login`)}`;
  return { subject: 'Your Marketing iO account is unlocked', html: emailLayout(body) };
}

export function deletionRequested(p: { fullName: string; effectiveDateIso: string; cancelUrl: string }): Email {
  const date = new Date(p.effectiveDateIso).toLocaleDateString('en-ZA');
  const body = `
<p>Hi ${escapeHtml(p.fullName)},</p>
<p>We received your request to delete your Marketing iO account. Deletion will be processed on <strong>${date}</strong>.</p>
<p>Changed your mind? You can cancel any time before that date.</p>
${emailButton('Cancel deletion', p.cancelUrl)}`;
  return { subject: 'Account deletion scheduled', html: emailLayout(body) };
}

export function deletionCancelled(p: { fullName: string }): Email {
  const body = `<p>Hi ${escapeHtml(p.fullName)}, your scheduled account deletion has been cancelled. Your account stays active. Glad to keep working with you.</p>`;
  return { subject: 'Account deletion cancelled', html: emailLayout(body) };
}

/* ─────────────────────────── BILLING ─────────────────────────── */

export function invoiceIssued(p: {
  clientName: string;
  invoiceNumber: string;
  amountZar: number;
  dueDateIso: string;
  invoiceUrl: string;
  description?: string;
}): Email {
  const due = new Date(p.dueDateIso).toLocaleDateString('en-ZA');
  const body = `
<h2 style="color:#0f172a;margin:0 0 16px 0;">Your invoice is ready</h2>
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>Invoice <strong>${escapeHtml(p.invoiceNumber)}</strong>${p.description ? ` — ${escapeHtml(p.description)}` : ''} is now available.</p>
<table style="border-collapse:collapse;margin:16px 0;width:100%;">
  <tr><td style="padding:8px 0;color:#64748b;">Amount due</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0a1f4d;">${fmtZar(p.amountZar)}</td></tr>
  <tr><td style="padding:8px 0;color:#64748b;">Due date</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0a1f4d;">${due}</td></tr>
</table>
${emailButton('View & pay invoice', p.invoiceUrl)}
${HELP_LINE}`;
  return { subject: `Invoice ${p.invoiceNumber} — ${fmtZar(p.amountZar)} due ${due}`, html: emailLayout(body) };
}

export function invoiceChase(p: {
  clientName: string;
  invoiceNumber: string;
  amountZar: number;
  daysOverdue: number;
  invoiceUrl: string;
}): Email {
  const body = `
<h2 style="color:#e63946;margin:0 0 16px 0;">Friendly reminder — invoice overdue</h2>
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>Invoice <strong>${escapeHtml(p.invoiceNumber)}</strong> for <strong>${fmtZar(p.amountZar)}</strong> is now <strong>${p.daysOverdue} day${p.daysOverdue === 1 ? '' : 's'} overdue</strong>.</p>
<p>To avoid service interruption, please settle the outstanding amount.</p>
${emailButton('Pay now', p.invoiceUrl)}
${HELP_LINE}`;
  return { subject: `Invoice ${p.invoiceNumber} is ${p.daysOverdue} day(s) overdue`, html: emailLayout(body) };
}

export function paymentReceipt(p: {
  clientName: string;
  invoiceNumber?: string;
  amountZar: number;
  paymentMethod: string;
  paidAtIso: string;
  receiptUrl?: string;
}): Email {
  const paid = new Date(p.paidAtIso).toLocaleString('en-ZA');
  const body = `
<h2 style="color:#0f172a;margin:0 0 16px 0;">Payment received — thank you</h2>
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>We've received your payment. Here's your receipt:</p>
<table style="border-collapse:collapse;margin:16px 0;width:100%;">
  ${p.invoiceNumber ? `<tr><td style="padding:8px 0;color:#64748b;">Invoice</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0a1f4d;">${escapeHtml(p.invoiceNumber)}</td></tr>` : ''}
  <tr><td style="padding:8px 0;color:#64748b;">Amount</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0a1f4d;">${fmtZar(p.amountZar)}</td></tr>
  <tr><td style="padding:8px 0;color:#64748b;">Method</td><td style="padding:8px 0;text-align:right;color:#0a1f4d;">${escapeHtml(p.paymentMethod)}</td></tr>
  <tr><td style="padding:8px 0;color:#64748b;">Paid at</td><td style="padding:8px 0;text-align:right;color:#0a1f4d;">${paid}</td></tr>
</table>
${p.receiptUrl ? emailButton('View receipt', p.receiptUrl) : ''}`;
  return { subject: `Receipt — ${fmtZar(p.amountZar)} payment received`, html: emailLayout(body) };
}

export function failedDebitFollowup(p: {
  clientName: string;
  invoiceNumber: string;
  amountZar: number;
  attemptCount: number;
  payUrl: string;
}): Email {
  const body = `
<h2 style="color:#e63946;margin:0 0 16px 0;">We couldn't take this month's payment</h2>
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>Our debit attempt on invoice <strong>${escapeHtml(p.invoiceNumber)}</strong> (<strong>${fmtZar(p.amountZar)}</strong>) failed${p.attemptCount > 1 ? ` — attempt ${p.attemptCount}` : ''}.</p>
<p>Common reasons: insufficient funds, wrong mandate, or a bank hold. You can settle manually below to keep things moving.</p>
${emailButton('Pay invoice', p.payUrl)}
${HELP_LINE}`;
  return { subject: 'Action needed — debit failed', html: emailLayout(body) };
}

/* ─────────────────────────── CONTRACTS ─────────────────────────── */

export function contractForSignature(p: {
  clientName: string;
  packageName: string;
  signUrl: string;
  expiresInDays?: number;
}): Email {
  const days = p.expiresInDays ?? 30;
  const body = `
<h2 style="color:#0f172a;margin:0 0 16px 0;">Your Marketing iO agreement is ready to sign</h2>
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>Please review and sign your <strong>${escapeHtml(p.packageName)}</strong> agreement. Once signed, we kick off onboarding immediately.</p>
${emailButton('Review & sign', p.signUrl)}
<p style="font-size:14px;color:#64748b;">This signing link expires in ${days} days.</p>`;
  return { subject: 'Sign your Marketing iO agreement', html: emailLayout(body) };
}

export function contractSigned(p: { clientName: string; packageName: string; portalUrl: string }): Email {
  const body = `
<h2 style="color:#0f172a;">Signed and sealed.</h2>
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>Your <strong>${escapeHtml(p.packageName)}</strong> agreement is fully signed. Welcome aboard.</p>
${emailButton('Open client portal', p.portalUrl)}`;
  return { subject: 'Your contract is signed', html: emailLayout(body) };
}

export function contractRenewal(p: { clientName: string; renewalDateIso: string; portalUrl: string }): Email {
  const date = new Date(p.renewalDateIso).toLocaleDateString('en-ZA');
  const body = `
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>Your Marketing iO contract renews on <strong>${date}</strong>. No action needed if you want to continue. To make changes, manage your subscription below.</p>
${emailButton('Manage subscription', p.portalUrl)}`;
  return { subject: `Renewal coming up on ${date}`, html: emailLayout(body) };
}

/* ─────────────────────────── ONBOARDING ─────────────────────────── */

export function welcomePack(p: {
  clientName: string;
  packageName: string;
  onboardingUrl: string;
  whatsappLink?: string;
}): Email {
  const body = `
<h2 style="color:#0f172a;">Your Marketing iO Welcome Pack</h2>
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>You're on <strong>${escapeHtml(p.packageName)}</strong>. Here's what happens next:</p>
<ol style="padding-left:20px;color:#334155;font-size:16px;line-height:1.7;">
  <li>Complete the 6-phase onboarding tracker</li>
  <li>Send us your brand assets (logo, colours, photos)</li>
  <li>Hop on the 30-minute onboarding call</li>
  <li>We start delivering inside the SLA defined for your package</li>
</ol>
${emailButton('Start onboarding', p.onboardingUrl)}
${p.whatsappLink ? `<p style="margin-top:24px;font-size:14px;color:#64748b;">Prefer WhatsApp? <a href="${p.whatsappLink}" style="color:#e63946;">Chat with your account lead</a>.</p>` : ''}`;
  return { subject: 'Your Marketing iO Welcome Pack', html: emailLayout(body) };
}

export function onboardingProgress(p: {
  clientName: string;
  phase: string;
  percent: number;
  nextStep: string;
  portalUrl: string;
}): Email {
  const body = `
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>You're now in <strong>${escapeHtml(p.phase)}</strong> — ${p.percent}% through onboarding.</p>
<p>Next step: <strong>${escapeHtml(p.nextStep)}</strong></p>
${emailButton('Open onboarding tracker', p.portalUrl)}`;
  return { subject: `Onboarding update — ${p.phase}`, html: emailLayout(body) };
}

export function onboardingReminder(p: { clientName: string; formUrl: string }): Email {
  const body = `
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>Just a nudge — we still need your onboarding form to start delivery. Takes about 5 minutes.</p>
${emailButton('Complete onboarding form', p.formUrl)}`;
  return { subject: 'Quick nudge — onboarding form pending', html: emailLayout(body) };
}

/* ─────────────────────────── DELIVERABLES ─────────────────────────── */

export function deliverableReady(p: {
  clientName: string;
  deliverableTitle: string;
  reviewUrl: string;
  reviewDeadlineIso?: string;
}): Email {
  const deadline = p.reviewDeadlineIso ? new Date(p.reviewDeadlineIso).toLocaleDateString('en-ZA') : null;
  const body = `
<h2 style="color:#0f172a;">Your deliverable is ready</h2>
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>We've published <strong>${escapeHtml(p.deliverableTitle)}</strong> for your review.</p>
${deadline ? `<p>Please review by <strong>${deadline}</strong>. If we don't hear back by then it's auto-approved.</p>` : ''}
${emailButton('Review deliverable', p.reviewUrl)}`;
  return { subject: `Review: ${p.deliverableTitle}`, html: emailLayout(body) };
}

export function deliverableApproved(p: { clientName: string; deliverableTitle: string; portalUrl: string }): Email {
  const body = `
<p>Hi ${escapeHtml(p.clientName)},</p>
<p>Thanks for approving <strong>${escapeHtml(p.deliverableTitle)}</strong>. We're locking it in.</p>
${emailButton('Back to portal', p.portalUrl)}`;
  return { subject: `Approved — ${p.deliverableTitle}`, html: emailLayout(body) };
}

export function deliverableSubmittedStaff(p: { staffName: string; clientName: string; deliverableTitle: string; reviewUrl: string }): Email {
  const body = `
<p>Hi ${escapeHtml(p.staffName)},</p>
<p><strong>${escapeHtml(p.clientName)}</strong> submitted feedback on <strong>${escapeHtml(p.deliverableTitle)}</strong>.</p>
${emailButton('Open in console', p.reviewUrl)}`;
  return { subject: `Client feedback — ${p.deliverableTitle}`, html: emailLayout(body) };
}

export function deliverableOverdueStaff(p: { staffName: string; clientName: string; deliverableTitle: string; daysOverdue: number; portalUrl: string }): Email {
  const body = `
<p>Hi ${escapeHtml(p.staffName)},</p>
<p><strong>${escapeHtml(p.deliverableTitle)}</strong> for <strong>${escapeHtml(p.clientName)}</strong> is <strong>${p.daysOverdue} day(s) overdue</strong>. Please unblock or reassign.</p>
${emailButton('Open ticket', p.portalUrl)}`;
  return { subject: `OVERDUE: ${p.deliverableTitle}`, html: emailLayout(body) };
}

/* ─────────────────────────── REPORTS / CAMPAIGNS ─────────────────────────── */

export function monthlyReport(p: {
  clientName: string;
  reportMonth: string; // e.g. "May 2026"
  highlights: string[];
  reportUrl: string;
}): Email {
  const bullets = p.highlights.map(h => `<li>${escapeHtml(h)}</li>`).join('');
  const body = `
<h2 style="color:#0f172a;">Your ${escapeHtml(p.reportMonth)} report</h2>
<p>Hi ${escapeHtml(p.clientName)}, here's what we shipped this month:</p>
<ul style="padding-left:20px;color:#334155;font-size:16px;line-height:1.7;">${bullets}</ul>
${emailButton('Read the full report', p.reportUrl)}`;
  return { subject: `${p.reportMonth} performance report`, html: emailLayout(body) };
}

export function campaignReport(p: {
  clientName: string;
  campaignName: string;
  metricsHtml: string; // table-ready HTML rendered by the caller
  reportUrl: string;
}): Email {
  const body = `
<h2 style="color:#0f172a;">${escapeHtml(p.campaignName)} — wrap-up</h2>
<p>Hi ${escapeHtml(p.clientName)}, your campaign just wrapped. Headlines:</p>
${p.metricsHtml}
${emailButton('Full breakdown', p.reportUrl)}`;
  return { subject: `${p.campaignName} — results`, html: emailLayout(body) };
}

/* ─────────────────────────── INTERNAL / LEADS / COMMS ─────────────────────────── */

export function leadNotification(p: {
  ownerName: string;
  lead: { name: string; business?: string; phone?: string; email?: string; source?: string; notes?: string };
  leadUrl: string;
}): Email {
  const l = p.lead;
  const body = `
<p>Hi ${escapeHtml(p.ownerName)},</p>
<p>New lead just came in via <strong>${escapeHtml(l.source ?? 'unknown source')}</strong>:</p>
<table style="border-collapse:collapse;margin:16px 0;width:100%;">
  <tr><td style="padding:6px 0;color:#64748b;">Name</td><td style="padding:6px 0;font-weight:700;">${escapeHtml(l.name)}</td></tr>
  ${l.business ? `<tr><td style="padding:6px 0;color:#64748b;">Business</td><td style="padding:6px 0;">${escapeHtml(l.business)}</td></tr>` : ''}
  ${l.phone ? `<tr><td style="padding:6px 0;color:#64748b;">Phone</td><td style="padding:6px 0;">${escapeHtml(l.phone)}</td></tr>` : ''}
  ${l.email ? `<tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;">${escapeHtml(l.email)}</td></tr>` : ''}
</table>
${l.notes ? `<blockquote style="border-left:3px solid #e63946;padding:8px 16px;color:#334155;background:#fef3f2;margin:16px 0;">${escapeHtml(l.notes)}</blockquote>` : ''}
${emailButton('Open lead', p.leadUrl)}`;
  return { subject: `New lead — ${l.name}`, html: emailLayout(body) };
}

export function threadMessage(p: {
  recipientName: string;
  senderName: string;
  preview: string;
  threadUrl: string;
}): Email {
  const body = `
<p>Hi ${escapeHtml(p.recipientName)},</p>
<p><strong>${escapeHtml(p.senderName)}</strong> just sent you a message:</p>
<blockquote style="border-left:3px solid #0a1f4d;padding:8px 16px;color:#334155;background:#f8fafc;margin:16px 0;">${escapeHtml(p.preview)}</blockquote>
${emailButton('Reply in portal', p.threadUrl)}`;
  return { subject: `${p.senderName}: new message`, html: emailLayout(body) };
}

export function clientCommunication(p: { clientName: string; subject: string; messageHtml: string }): Email {
  const body = `
<h2 style="color:#0f172a;">${escapeHtml(p.subject)}</h2>
<p>Hi ${escapeHtml(p.clientName)},</p>
${p.messageHtml}
${HELP_LINE}`;
  return { subject: p.subject, html: emailLayout(body) };
}

export function adminFormSubmitted(p: { adminName: string; formName: string; clientName: string; reviewUrl: string }): Email {
  const body = `
<p>Hi ${escapeHtml(p.adminName)},</p>
<p><strong>${escapeHtml(p.clientName)}</strong> just submitted <strong>${escapeHtml(p.formName)}</strong>. Please review.</p>
${emailButton('Open submission', p.reviewUrl)}`;
  return { subject: `Review: ${p.formName} — ${p.clientName}`, html: emailLayout(body) };
}

export function enquiryReceived(p: {
  ownerName: string;
  enquirer: { name: string; email?: string; phone?: string; message?: string };
  enquiryUrl: string;
}): Email {
  const e = p.enquirer;
  const body = `
<p>Hi ${escapeHtml(p.ownerName)},</p>
<p>Someone just sent an enquiry from the public site:</p>
<table style="border-collapse:collapse;margin:16px 0;width:100%;">
  <tr><td style="padding:6px 0;color:#64748b;">Name</td><td style="padding:6px 0;font-weight:700;">${escapeHtml(e.name)}</td></tr>
  ${e.email ? `<tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;">${escapeHtml(e.email)}</td></tr>` : ''}
  ${e.phone ? `<tr><td style="padding:6px 0;color:#64748b;">Phone</td><td style="padding:6px 0;">${escapeHtml(e.phone)}</td></tr>` : ''}
</table>
${e.message ? `<blockquote style="border-left:3px solid #e63946;padding:8px 16px;color:#334155;background:#fef3f2;margin:16px 0;">${escapeHtml(e.message)}</blockquote>` : ''}
${emailButton('Open enquiry', p.enquiryUrl)}`;
  return { subject: `Enquiry — ${e.name}`, html: emailLayout(body) };
}

export function followupReminder(p: {
  staffName: string;
  clientName: string;
  reason: string;
  actionUrl: string;
}): Email {
  const body = `
<p>Hi ${escapeHtml(p.staffName)},</p>
<p>Reminder: follow up with <strong>${escapeHtml(p.clientName)}</strong> — ${escapeHtml(p.reason)}.</p>
${emailButton('Open client', p.actionUrl)}`;
  return { subject: `Follow up — ${p.clientName}`, html: emailLayout(body) };
}

/** Generic transactional email — for any one-off notification not above. */
export function genericNotification(p: { subject: string; greeting: string; bodyHtml: string; ctaLabel?: string; ctaUrl?: string }): Email {
  const cta = p.ctaLabel && p.ctaUrl ? emailButton(p.ctaLabel, p.ctaUrl) : '';
  const body = `
<h2 style="color:#0f172a;margin:0 0 16px 0;">${escapeHtml(p.subject)}</h2>
<p>${escapeHtml(p.greeting)}</p>
${p.bodyHtml}
${cta}
${HELP_LINE}`;
  return { subject: p.subject, html: emailLayout(body) };
}
