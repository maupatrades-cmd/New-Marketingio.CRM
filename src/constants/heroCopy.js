// Emotional hero copy — rotates daily, picked by client state.
const COPY_POOLS = {
  no_package: [
    "Your business is too good to stay hidden. Let's change that.",
    "Every day without action is a day your competitor wins.",
    "Build the business that builds your family's future.",
  ],
  onboarding_incomplete: [
    "You're almost there — complete your onboarding and let's launch.",
    "A few more steps and your marketing goes live.",
    "The setup is worth it. Your visibility is about to change.",
  ],
  invoice_overdue: [
    "Let's get your account up to date so we can keep building.",
    "A quick payment keeps your marketing running smoothly.",
  ],
  missing_whatsapp: [
    "73% of South Africans use WhatsApp. Are your customers finding you there?",
    "While you sleep, your competitor's WhatsApp replies.",
  ],
  missing_chatbot: [
    "Customer questions don't sleep. An AI chatbot never stops working.",
    "After-hours customers go to whoever replies first.",
  ],
  missing_video: [
    "TikTok and Reels are where attention lives. Are you there?",
    "Video content gets 10x more engagement than static posts.",
  ],
  missing_reputation: [
    "One bad review costs you 30 future customers.",
    "Reviews shape decisions before customers ever walk in.",
  ],
  general: [
    "Your marketing is in good hands.",
    "Let's keep growing together.",
    "This is what you're building. It matters.",
    "Every client we serve makes our work better.",
    "Your success is our portfolio.",
  ],
};

export function pickHeroCopy({ hasPackage, onboarding, overdueInvoices, missingAddons }) {
  let pool = 'general';
  if (!hasPackage) pool = 'no_package';
  else if (overdueInvoices > 0) pool = 'invoice_overdue';
  else if (onboarding && onboarding.triggers_done < 4) pool = 'onboarding_incomplete';
  else if (missingAddons?.includes('whatsapp_automation')) pool = 'missing_whatsapp';
  else if (missingAddons?.includes('ai_chatbot')) pool = 'missing_chatbot';
  else if (missingAddons?.includes('short_form_video')) pool = 'missing_video';
  else if (missingAddons?.includes('reputation_management')) pool = 'missing_reputation';
  const copies = COPY_POOLS[pool] || COPY_POOLS.general;
  // Deterministic daily rotation — same client sees the same line all day.
  const dayIndex = Math.floor(Date.now() / 86400000);
  return copies[dayIndex % copies.length];
}
