// Client portal FAQ — grouped by category. Answers are plain strings;
// keep them short and reassuring.
export const PORTAL_FAQ = [
  {
    category: 'Billing & Payments',
    items: [
      { q: 'When will my debit order go off?', a: 'Your monthly fee is collected on the debit day you selected during onboarding (the 1st or the 15th). You can see the exact date on each invoice.' },
      { q: 'What happens if a debit fails?', a: 'We automatically retry within a few days. If it fails again our billing team will reach out. You can also settle manually by EFT and upload proof of payment on the invoice.' },
      { q: 'How do I download an invoice?', a: 'Open Invoices from the menu, click any invoice, and use the download / view option on the detail page.' },
      { q: 'Can I change my debit date?', a: 'Yes — message us on WhatsApp and we\'ll update your mandate to the 1st or 15th.' },
    ],
  },
  {
    category: 'Contracts & Cancellation',
    items: [
      { q: 'How long is my contract?', a: 'Your initial term is shown on your signed contract. Most packages run on a rolling monthly basis after the initial term.' },
      { q: 'How do I cancel?', a: 'Cancellation requires written notice per your contract terms. Message us on WhatsApp and we\'ll guide you through it.' },
      { q: 'Where can I see my signed contract?', a: 'Open Contracts from the menu — signed agreements are available to view and download there.' },
    ],
  },
  {
    category: 'Deliverables & Approvals',
    items: [
      { q: 'How long do deliverables take?', a: 'Each deliverable has a due date shown on your dashboard. You\'ll get a notification when something is ready for your review.' },
      { q: 'How do I request changes?', a: 'Open the deliverable and use "Request changes" — your feedback goes straight to the assigned team member.' },
      { q: 'What if I\'m not happy with the work?', a: 'Tell us in the deliverable feedback box, or message us on WhatsApp. We\'ll revise until it\'s right.' },
    ],
  },
  {
    category: 'Portal & Access',
    items: [
      { q: 'Can more than one person access the portal?', a: 'Right now the portal is tied to your business email. Contact us if you need an additional login.' },
      { q: 'I forgot my password / can\'t log in.', a: 'Use the "email me a login link" option on the sign-in page — you\'ll get a magic link with no password needed.' },
      { q: 'How do I update my business info?', a: 'Open Profile to edit your contact details. For business name or email changes, message us on WhatsApp.' },
    ],
  },
  {
    category: 'Marketing iO Services',
    items: [
      { q: 'What\'s the difference between the packages?', a: 'Higher tiers include more content, more channels and more strategy time. See the package cards on your dashboard for a comparison.' },
      { q: 'Can I add extra services?', a: 'Yes — browse the Add-Ons on your dashboard and tap "Enquire" on anything you\'re interested in.' },
      { q: 'Do you do custom packages?', a: 'Absolutely. If nothing fits, tap "Chat with the founder" and we\'ll design something around your goals.' },
    ],
  },
];
