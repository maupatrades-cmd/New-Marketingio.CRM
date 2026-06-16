# Marketing iO email templates

All outgoing email is wrapped with a shared layout that uses **one Cloudinary image** as both the header and the footer:

```
https://res.cloudinary.com/didwjb1et/image/upload/v1781625284/marketingio_footer_clean_1_ykjdzr.png
```

To swap the image, edit `EMAIL_HEADER_IMAGE` in:
- `src/emails/layout.ts` (client / dev preview)
- `supabase/functions/_shared/email.ts` (server / Edge Functions)

## Templates ported from the old Base44 CRM

All of these live in `src/emails/templates.ts` as pure `({ subject, html })`-returning functions:

| New helper | Old CRM function |
|---|---|
| `signupWelcome` | `send-signup-welcome-email` |
| `welcome` | `send-welcome-email` |
| `forgotPassword` | `send-forgot-password-email` |
| `passwordChanged` | `change-password` notification |
| `signupVerificationOtp` | `auth-register` OTP |
| `loginOtp` / `resendOtp` | `auth-login`, `resend-otp` |
| `accountLockdown` | `emergency-account-lockdown` |
| `accountRecovery` | `recover-account` |
| `accountUnlocked` | `unlock-account` |
| `deletionRequested` | `request-account-deletion` |
| `deletionCancelled` | `cancel-account-deletion` |
| `invoiceIssued` | `send-invoice-issued-email` |
| `invoiceChase` | `send-invoice-chase` |
| `paymentReceipt` | `send-payment-receipt-email` / `payfast-send-receipt` |
| `failedDebitFollowup` | `handle-failed-debit-notification` |
| `contractForSignature` | `send-contract-for-signature` |
| `contractSigned` | `notifySignatureComplete` / `onContractSigned` |
| `contractRenewal` | `sweep-contract-renewals` |
| `welcomePack` | `sendWelcomePack` |
| `onboardingProgress` | `send-onboarding-progress-email` |
| `onboardingReminder` | `sendOnboardingReminders` |
| `deliverableReady` | `notify-client-deliverable-update` |
| `deliverableApproved` | `notifyDeliverableApproved` |
| `deliverableSubmittedStaff` | `notifyDeliverableSubmitted` |
| `deliverableOverdueStaff` | `notifyDeliverableOverdue` |
| `monthlyReport` | monthly report |
| `campaignReport` | `generate-campaign-report` |
| `leadNotification` | `send-owner-lead-notification` |
| `threadMessage` | `send-thread-message` |
| `clientCommunication` | `notifyClientCommunication` |
| `adminFormSubmitted` | `notifyAdminFormSubmitted` |
| `enquiryReceived` | `submit-enquiry` |
| `followupReminder` | `send-followup-reminder` |
| `genericNotification` | any one-off transactional |

## Sending from the server

Resend is the dispatcher. The shared layout + a thin dispatcher live in `supabase/functions/_shared/email.ts` and `supabase/functions/send-email/index.ts`.

```bash
# one-time setup
supabase secrets set RESEND_API_KEY=re_xxx
supabase functions deploy send-email --no-verify-jwt
```

```js
// from anywhere with a Supabase client:
await supabase.functions.invoke('send-email', {
  body: {
    template: 'invoice_issued',
    to: 'client@example.co.za',
    payload: {
      clientName: 'Acme Trading',
      invoiceNumber: 'INV-0001',
      amountZar: 1490,
      dueDateIso: '2026-06-30',
      invoiceUrl: 'https://app.marketingio.co.za/invoices/abc'
    }
  }
});
```

## Previewing locally

Each template is pure — import it in a Vite test page and render `html` directly via `dangerouslySetInnerHTML` to QA against the new layout.
