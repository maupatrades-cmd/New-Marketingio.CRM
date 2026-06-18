// paymentSuccess.ts
// Two pieces for the "payment received" moment:
//   1) buildPaymentImagePrompt(pkg, businessName, industry) — a Gemini prompt
//      that paints a celebratory, on-brand scene representing the PACKAGE the
//      client just paid for. Marketing iO sells SERVICES, so the image is an
//      aspirational "you're visible now" scene, never a product-in-a-box.
//   2) paymentSuccess(payload) — the branded receipt/celebration email,
//      matching the existing send-email template style (Cloudinary header/
//      footer, navy #0a1f4d / red #e63946, gradient button).
//
// Integration (already wired into the Edge Functions this commit ships):
//  - `payment_success` is added to the TEMPLATES dispatcher in send-email.
//  - generate-payment-image (Gemini 2.5 Flash Image) uses
//    buildPaymentImagePrompt and caches at payment-images/<invoice_id>.png.
//  - payfast-itn, AFTER the invoice flips to paid, calls
//    generate-payment-image, then send-email with template 'payment_success'
//    and { heroImageUrl }. If image gen fails the email still goes out
//    without the picture — never let a missing image block the receipt.

// ── 1) Per-package image prompt ───────────────────────────────────────────────

type PackageKey =
  | 'ignite' | 'accelerate' | 'dominate'
  | 'street_pulse' | 'township_pulse' | 'add_on';

const BRAND_DIRECTION =
  'Brand palette: deep navy (#0A1F4D), vivid red (#E63946), clean white, with a ' +
  'warm gold-to-pink accent glow. Modern, optimistic, premium but approachable. ' +
  'Celebratory, "stepping into the spotlight" energy. Photo-real, soft cinematic ' +
  'lighting, shallow depth of field. ABSOLUTELY NO TEXT, NO WORDS, NO LETTERS, ' +
  'NO LOGOS in the image (text is rendered by the email, not the picture).';

const PACKAGE_SCENE: Record<PackageKey, string> = {
  ignite:
    'A small local South African business owner standing proudly in the doorway ' +
    'of their freshly-noticed shop at golden hour, a soft warm glow and gentle ' +
    'red-and-gold light rays beginning to spotlight the storefront — the moment ' +
    'of being seen for the first time.',
  accelerate:
    'A thriving township small business with a small but growing crowd of happy ' +
    'customers arriving, warm momentum and energy, light beams sweeping across ' +
    'the scene like a brand catching fire, a sense of fast-rising visibility.',
  dominate:
    'A confident South African entrepreneur on a bright stage-like setting under ' +
    'a dramatic spotlight with subtle paparazzi-style camera flashes in the ' +
    'background, commanding the market — the unmistakable feeling of being the ' +
    'one everyone now sees.',
  street_pulse:
    'A vibrant South African street scene with an eye-catching branded vehicle ' +
    'and fresh signage drawing smiling pedestrians toward a local shop, real-world ' +
    'on-the-ground buzz and attention.',
  township_pulse:
    'A lively township marketplace where a local business has suddenly become the ' +
    'centre of friendly attention, neighbours pointing and gathering, warm ' +
    'community energy and pride.',
  add_on:
    'A South African small business owner delighted by a new tool clicking into ' +
    'place for their brand, a subtle upgrade glow, capability and momentum.',
};

export function buildPaymentImagePrompt(opts: {
  packageKey?: string | null;
  businessName?: string | null;
  industry?: string | null;
}): string {
  const key = (opts.packageKey ?? 'ignite').toLowerCase() as PackageKey;
  const scene = PACKAGE_SCENE[key] ?? PACKAGE_SCENE.ignite;
  const industryLine = opts.industry
    ? ` The business is in the ${opts.industry} sector — reflect that subtly in the setting and props.`
    : '';
  return `${scene}${industryLine} ${BRAND_DIRECTION}`;
}

// ── 2) The payment-success email ──────────────────────────────────────────────

type Email = { subject: string; html: string; from?: string };

export function paymentSuccess(p: {
  businessName: string;
  packageName: string;
  amountZar: number | string;
  invoiceNumber: string;
  paidDateIso?: string;
  portalUrl: string;
  heroImageUrl?: string;
}, helpers: {
  escapeHtml: (s: unknown) => string;
  emailLayout: (body: string, opts?: { preheader?: string; title?: string }) => string;
  emailButton: (label: string, href: string) => string;
  fmtZar: (n: number | string | null | undefined) => string;
  HELP_LINE: string;
  BILLING_FROM?: string;
}): Email {
  const { escapeHtml, emailLayout, emailButton, fmtZar, HELP_LINE } = helpers;
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
${emailButton('Go to my portal', p.portalUrl)}
<p style="margin:22px 0 0 0;font-size:14px;color:#64748b;line-height:1.6;">
  Our team is already getting things moving. You'll see your deliverables take shape right inside your portal.
</p>
${HELP_LINE}`;

  return {
    subject: `Payment received — ${fmtZar(p.amountZar)} · ${p.packageName}`,
    html: emailLayout(body, {
      preheader: `Thank you, ${p.businessName}! Your ${p.packageName} payment is confirmed.`,
      title: 'Payment received — Marketing iO',
    }),
    from: helpers.BILLING_FROM,
  };
}
