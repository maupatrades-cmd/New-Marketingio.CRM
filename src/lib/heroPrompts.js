// Photoreal hero-image prompts + paired aspirational copy.
// Ported from the base44 CRM (generate-hero-image edge function).
// The picker chooses a pool based on client state, then picks a scenario
// deterministically from (business_name + day-bucket) so the same client
// gets the same hero for a 24-hour window and different clients diverge.

export const PHOTOREAL_PREFIX =
  "PHOTOREALISTIC PHOTOGRAPHY ONLY. Shot on professional camera. Cinema-grade. Documentary-real. NOT illustration, NOT cartoon, NOT 3D render, NOT digital art, NOT painted, NOT animated. Real human faces, real locations, real lighting. Like a National Geographic or commercial photography shot. Visible skin texture, natural shadows, real-world imperfections.";

const POOL_NO_FOUNDATION = [
  {
    prompt: "PHOTOREALISTIC PHOTOGRAPHY ONLY, shot on Canon R5, NOT illustration NOT cartoon NOT 3D. Documentary photo: confident Black South African family business owner in their 30s standing proudly in front of their small storefront in Polokwane. Late golden hour, real sunlight, real shadows. Subtle purple-pink color grade. Hopeful, real, lived-in. Hyper-realistic skin texture and detail. 16:9 widescreen. No text, no logos, no signs visible.",
    copy: "Your family deserves the growth you're capable of.",
  },
  {
    prompt: "PHOTOREALISTIC PHOTOGRAPHY ONLY, NOT illustration. Cinema-grade documentary photo: Black South African entrepreneur late 30s reviewing colorful business analytics on a real laptop in a real Polokwane coffee shop. Real morning sunlight through real windows. Subtle purple-pink color grade. Real skin, real wrinkles, real focus. 16:9 widescreen. No text or logos.",
    copy: "Every day without action is a day your competitor wins.",
  },
  {
    prompt: "PHOTOREALISTIC PHOTOGRAPHY ONLY, NOT cartoon NOT illustrated. Documentary lifestyle photo: young Black South African couple at a real kitchen table at home, smiling, looking at a laptop together. Real evening lamp light, real dishes on counter. Soft purple-pink color grade. Loving, hopeful, completely real. 16:9. No text.",
    copy: "Build the business that builds your family's future.",
  },
];

const POOL_MISSING_WHATSAPP = [
  {
    prompt: "PHOTOREALISTIC PHOTOGRAPHY ONLY. Real close-up shot of a real smartphone at night on a real wooden desk, screen glowing showing missed WhatsApp notifications, dark room with subtle purple ambient light. Real phone, real reflections, real depth of field. NOT cartoon NOT illustrated. 16:9. No text overlays in image.",
    copy: "73% of South Africans use WhatsApp. While you sleep, your competitor replies.",
  },
  {
    prompt: "PHOTOREALISTIC PHOTOGRAPHY ONLY, real candid documentary shot. Black South African business owner late 30s in real shop at night, frustrated expression, holding real phone with WhatsApp screen visible. Real fluorescent light, real shop interior. NOT illustration. 16:9. No visible text.",
    copy: "Every late-night message your competitor catches is a customer you lost.",
  },
  {
    prompt: "PHOTOREALISTIC, real photography. Empty real shop interior at night vs. through window seeing competitor shop nearby with customers inside on phones. Real streetlight, real reflections. Subtle purple ambient grade. Cinematic real-world. 16:9. No text.",
    copy: "Your competitor's WhatsApp is open. Yours is on voicemail.",
  },
  {
    prompt: "PHOTOREALISTIC documentary photography. Real close-up of weathered hands holding a smartphone with multiple unread WhatsApp messages glowing in dark room. Real skin detail, real fingernails, real tired evening light. NOT illustration. 16:9. No text overlays.",
    copy: "Customers don't wait. They WhatsApp the next business.",
  },
];

const POOL_MISSING_REPUTATION = [
  {
    prompt: "PHOTOREALISTIC PHOTOGRAPHY, real cinema-grade shot. Black South African business owner mid-40s with worried expression looking down at real smartphone showing review screens. Real harsh morning light, real lines on face. NOT cartoon NOT illustration. 16:9. No text visible in image.",
    copy: "ONE bad review costs you 30 future customers.",
  },
  {
    prompt: "PHOTOREALISTIC documentary photo. Real customer in a real store walking away while reading their phone with frowning expression. Real shop background, real movement. Subtle purple ambient. NOT illustrated. 16:9. No text.",
    copy: "Reviews shape decisions before customers ever walk in.",
  },
  {
    prompt: "PHOTOREALISTIC real-world photography. Black South African shop owner watching real customers leave their store, reflection in window, real sunset light. Real defeat in posture. NOT cartoon. 16:9. No text overlays.",
    copy: "Without reputation management, you're invisible to the customers checking you out.",
  },
];

const POOL_MISSING_CHATBOT = [
  {
    prompt: "PHOTOREALISTIC documentary photography. Real Black South African business owner exhausted at 3am asleep on real couch, real laptop still open showing chat interface. Real dim lamp light. NOT illustration. 16:9. No text overlays.",
    copy: "Your AI works while you sleep. Without one, you ARE the bottleneck.",
  },
  {
    prompt: "PHOTOREALISTIC real photo. Real overworked South African entrepreneur late 40s rubbing tired eyes at computer, real cluttered desk, real warm lamp light at night. Documentary feel. NOT cartoon. 16:9. No text.",
    copy: "Customer questions don't sleep. Why should you?",
  },
  {
    prompt: "PHOTOREALISTIC photography. Real smartphone screen at 2am showing ongoing chat messages with timestamps, on real wooden desk, dark room. NOT illustration. 16:9. No text overlays.",
    copy: "After-hours customers go to whoever replies first.",
  },
];

const POOL_MISSING_VIDEO = [
  {
    prompt: "PHOTOREALISTIC photography. Real two phones side by side on wooden table, one showing static image post low engagement, other showing video with active engagement. Real reflections, real glass screens. NOT illustration. 16:9. No text.",
    copy: "TikTok and Reels are eating Google. Your static 2018 posts are invisible.",
  },
  {
    prompt: "PHOTOREALISTIC real photo. Young South African woman late teens scrolling real phone watching real video content, café setting, real focus on screen. NOT cartoon. 16:9. No text.",
    copy: "Your customers watch video. You publish photos. Every day you become less relevant.",
  },
  {
    prompt: "PHOTOREALISTIC documentary photo. Real smartphone screen showing TikTok-style video with high view counts visible on screen, person's hand holding it. Real fingers, real screen detail. NOT illustration. 16:9. No text overlays.",
    copy: "Video is where attention lives. You're not there.",
  },
];

const POOL_MISSING_EMAIL = [
  {
    prompt: "PHOTOREALISTIC photography. Real customer scrolling phone past forgotten old emails, café background. Real natural light, real screen reflection. NOT illustration. 16:9. No text.",
    copy: "Your past customers forget you in 90 days. Then they buy from whoever advertised last.",
  },
  {
    prompt: "PHOTOREALISTIC real photo. Real cluttered email inbox on laptop screen, hand reaching to delete, real fingers, real desk. NOT cartoon. 16:9. No text overlays.",
    copy: "Out of sight, out of inbox, out of business.",
  },
];

const POOL_MISSING_PAID_ADS = [
  {
    prompt: "PHOTOREALISTIC documentary photo. Real busy South African shop with real customers vs. through real window an empty shop nearby. Real street lighting. NOT illustration. 16:9. No text.",
    copy: "Your competitor's ads are running. Yours aren't even drafted.",
  },
  {
    prompt: "PHOTOREALISTIC real photography. Real laptop screen showing ad performance dashboard with growing chart, hands typing. Real keyboard wear, real fingers. NOT cartoon. 16:9. No text overlays.",
    copy: "Paid ads are how you stop hoping and start scaling.",
  },
];

const POOL_MISSING_GMB = [
  {
    prompt: "PHOTOREALISTIC photography. Real person on phone in South African street searching for service, frustrated look. Real urban environment. NOT illustration. 16:9. No text.",
    copy: "When customers Google you, your competitor appears. You don't.",
  },
  {
    prompt: "PHOTOREALISTIC real photo. Smartphone showing Google Maps with real pinned business locations, real screen detail, real street background blurred. NOT cartoon. 16:9. No text overlays.",
    copy: "If Google can't find you, your customers can't either.",
  },
];

const POOL_MISSING_CRM = [
  {
    prompt: "PHOTOREALISTIC documentary photo. Real cluttered desk with real handwritten notes, sticky notes, scattered phone messages, real lamp light. NOT illustration. 16:9. No text.",
    copy: "Leads in WhatsApp screenshots and notebook scribbles aren't leads. They're losses.",
  },
  {
    prompt: "PHOTOREALISTIC real photo. Black South African business owner overwhelmed at desk surrounded by real paper documents, real exhausted expression. NOT cartoon. 16:9. No text overlays.",
    copy: "You're managing customers in your head. Your competitor has a system.",
  },
];

const POOL_GENERAL_ASPIRATIONAL = [
  {
    prompt: "PHOTOREALISTIC documentary photo. Real Black South African business owner mid-30s walking into a brand new commercial space, real sunlight streaming through real windows, satisfied smile, hands in pockets. NOT illustration. 16:9. No text.",
    copy: "This is what Marketing iO clients are building.",
  },
  {
    prompt: "PHOTOREALISTIC photography. Real close-up of real hands signing a real contract on real wooden desk, blurred South African business owner smiling in soft-focus background. Real skin, real ink, real paper texture. NOT cartoon. 16:9. No text overlays.",
    copy: "Every signed contract is a step closer to who you're becoming.",
  },
  {
    prompt: "PHOTOREALISTIC real photo. Real Black South African family celebrating around dinner table, real food, real laughter, warm evening light from real lamps. NOT illustration. 16:9. No text.",
    copy: "The business builds the life. The life is why you're building.",
  },
  {
    prompt: "PHOTOREALISTIC documentary photography. Real entrepreneur handing real keys to family member, real outdoor light, real expressions of pride and joy. NOT cartoon. 16:9. No text overlays.",
    copy: "What you're building isn't just a business. It's a future you can hand down.",
  },
];

export const HERO_POOLS = {
  no_foundation: POOL_NO_FOUNDATION,
  missing_whatsapp: POOL_MISSING_WHATSAPP,
  missing_reputation: POOL_MISSING_REPUTATION,
  missing_chatbot: POOL_MISSING_CHATBOT,
  missing_video: POOL_MISSING_VIDEO,
  missing_email: POOL_MISSING_EMAIL,
  missing_paid_ads: POOL_MISSING_PAID_ADS,
  missing_gmb: POOL_MISSING_GMB,
  missing_crm: POOL_MISSING_CRM,
  general_aspirational: POOL_GENERAL_ASPIRATIONAL,
};

export function pickHeroPool(hasPackage, missingAddons = []) {
  if (!hasPackage) return 'no_foundation';
  if (missingAddons.includes('whatsapp_automation'))  return 'missing_whatsapp';
  if (missingAddons.includes('reputation_management')) return 'missing_reputation';
  if (missingAddons.includes('ai_chatbot'))            return 'missing_chatbot';
  if (missingAddons.includes('short_form_video'))      return 'missing_video';
  if (missingAddons.includes('email_newsletter'))      return 'missing_email';
  if (missingAddons.includes('paid_ads_management'))   return 'missing_paid_ads';
  if (missingAddons.includes('google_business_profile')) return 'missing_gmb';
  if (missingAddons.includes('crm_training'))          return 'missing_crm';
  return 'general_aspirational';
}

// FNV-1a 32-bit — deterministic so same client + same day → same scenario.
function hashSeed(input) {
  let h = 2166136261 >>> 0;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Deterministic per-client-per-day scenario pick. Returns { pool, scenario, prompt, copy }.
export function pickHeroScenario({ businessName, hasPackage, missingAddons = [] }) {
  const dayBucket = Math.floor(Date.now() / CACHE_TTL_MS);
  const poolName  = pickHeroPool(hasPackage, missingAddons);
  const pool      = HERO_POOLS[poolName];
  const seed      = hashSeed(`${businessName || 'unknown'}|${dayBucket}`);
  const scenario  = pool[seed % pool.length];
  return {
    pool: poolName,
    scenario,
    prompt: `${PHOTOREAL_PREFIX}\n\n${scenario.prompt}\n\nContext: business "${businessName || 'unknown'}". Do NOT render any business name, logo, or text inside the image.`,
    copy: scenario.copy,
  };
}
