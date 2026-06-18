// Deno mirror of src/lib/welcomeImagePrompt.js. Keep the two in sync.

const INDUSTRY_SCENES: Record<string, string> = {
  retail:       'a vibrant, busy local retail shop with well-stocked shelves and happy customers browsing and buying — clearly the most popular shop on the street',
  services:     'a friendly local service business at work, delighting satisfied customers, with a steady stream of bookings and an in-demand, trusted reputation',
  construction: 'a confident construction and trades crew on an active worksite with tools and a project taking shape, with plenty of jobs lined up',
  hospitality:  'a warm, full café or restaurant with happy diners enjoying great food, and a small queue of customers eager for a table',
  beauty:       'a stylish, fully-booked beauty salon with happy clients getting their hair and nails done in a bright, welcoming space',
  health:       'a calm, professional health and wellness practice with content clients and a fully-booked appointment diary',
  professional: 'a confident professional-services team in a modern office, advising trusted clients with a credible, established feel',
  education:    'a lively education and training space with engaged, smiling learners and a passionate teacher, with classes full and growing',
  other:        'a thriving local small business buzzing with happy customers and steady, growing demand',
};

const SCENE_TAIL =
  ' The business is being discovered: nearby smartphones show notifications, ' +
  'messages and glowing five-star reviews. The mood is proud, optimistic and successful.';

const STYLES: string[] = [
  'as a clean flat vector illustration with bold simple shapes',
  'as an isometric 3D-flat illustration with soft shadows',
  'in a layered papercut style with depth and a soft rising sun',
  'as a glossy soft 3D render with gentle studio lighting',
  'as minimal line-art with a limited, elegant palette',
  'in a warm, bright photographic style with natural light',
  'in a bold duotone navy-and-red photographic style',
  'in a modern flat-design style with geometric accents',
  'as a friendly, energetic hand-drawn illustration',
  'as a cinematic photograph at golden hour with a hero spotlight feel',
  'in a soft claymation / clay-render style',
  'as a bold pop-art poster graphic',
  'as a soft, warm watercolour illustration',
  'in a textured paper-collage style',
  'as a sleek modern vector with smooth gradient accents',
  'in a charming storybook illustration style',
  'in an editorial magazine photographic style',
  'in a vibrant risograph-print style',
  'in a clean, corporate flat-illustration style',
  'as an energetic comic-book illustration',
];

const BRAND_SUFFIX =
  ' Brand palette: deep navy blue (#0a1f4d) and bright red (#e63946) with clean ' +
  'white space. Optimistic, warm, professional, high quality, balanced composition. ' +
  'No text, no words, no letters, no logos, no watermark.';

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function buildWelcomePrompt(client: {
  id?: string | null;
  industry?: string | null;
  business_name?: string | null;
}): string {
  const key = String(client?.industry || 'other').toLowerCase().trim();
  const scene = INDUSTRY_SCENES[key] || INDUSTRY_SCENES.other;
  const style = STYLES[hash(String(client?.id || client?.business_name || 'x')) % STYLES.length];
  return `A hero image of ${scene}.${SCENE_TAIL} Rendered ${style}.${BRAND_SUFFIX}`;
}
