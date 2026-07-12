export const ADD_ON_CATALOG = [
  // Setup + Recurring (locked term)
  { code: 'ai_chatbot',                    name: 'AI Chatbot',                    setup: 6500,  monthly: 350,  type: 'setup_recurring', term: 12, bucket: 'B' },
  { code: 'whatsapp_automation',            name: 'WhatsApp Business Automation',  setup: 3500,  monthly: 200,  type: 'setup_recurring', term: 12, bucket: 'B' },
  { code: 'sms_marketing',                  name: 'SMS Marketing Campaigns',       setup: 500,   monthly: 500,  type: 'setup_recurring', term: 6,  bucket: 'B' },
  { code: 'website_design_only',            name: 'Website Design Only',           setup: 2000,  monthly: 430,  type: 'setup_recurring', term: 12, bucket: 'A' },
  { code: 'business_plan_website_bundle',   name: 'Business Plan + Website Bundle',setup: 2600,  monthly: 430,  type: 'setup_recurring', term: 12, bucket: 'A' },

  // Pure Recurring (minimum 3-month lock)
  { code: 'reputation_management',  name: 'Reputation Management',         setup: 0,     monthly: 1800, type: 'recurring', term: 3,  bucket: 'C' },
  { code: 'email_newsletter',      name: 'Email Newsletter Management',   setup: 0,     monthly: 900,  type: 'recurring', term: 3,  bucket: 'C' },
  { code: 'short_form_video',      name: 'Short-Form Video Pack (4 vids)',setup: 0,     monthly: 1500, type: 'recurring', term: 3,  bucket: 'C' },
  { code: 'ai_content_writing',    name: 'AI Content Writing Service',    setup: 0,     monthly: 800,  type: 'recurring', term: 3,  bucket: 'C' },
  { code: 'website_maintenance',   name: 'Website Maintenance Retainer',  setup: 0,     monthly: 550,  type: 'recurring', term: 3,  bucket: 'C' },

  // Once-Off (no term lock)
  { code: 'google_business_profile', name: 'Google Business Profile Optimisation', setup: 800,  monthly: 0, type: 'once_off', term: 0, bucket: 'A' },
  { code: 'marketing_audit',        name: 'Marketing Audit & Report',      setup: 2000,  monthly: 0, type: 'once_off', term: 0, bucket: 'A' },
  { code: 'competitor_analysis',    name: 'Competitor Analysis Report',     setup: 1500,  monthly: 0, type: 'once_off', term: 0, bucket: 'A' },
  { code: 'crm_training',           name: 'CRM Training & Setup',          setup: 3000,  monthly: 0, type: 'once_off', term: 0, bucket: 'A' },
  { code: 'staff_training',         name: 'Staff Training Workshop',        setup: 3500,  monthly: 0, type: 'once_off', term: 0, bucket: 'A' },
  { code: 'ecommerce_setup',        name: 'E-commerce Setup',              setup: 3500,  monthly: 0, type: 'once_off', term: 0, bucket: 'A' },
  { code: 'business_plan',          name: 'Business Plan (Standalone)',     setup: 1600,  monthly: 0, type: 'once_off', term: 0, bucket: 'A' },

  // Special (custom pricing)
  { code: 'paid_ads_management',  name: 'Paid Ads Management',           setup: 0,     monthly: 750, type: 'special',   term: 3,  bucket: 'D', note: '15-20% of ad spend, R750 floor' },
  { code: 'print_signage',       name: 'Print & Signage Coordination',  setup: 0,     monthly: 0,   type: 'special',   term: 0,  bucket: 'E', note: '10-15% markup on print cost' },
  { code: 'hosting_reselling',   name: 'Domain, Hosting & Email',       setup: 0,     monthly: 250, type: 'recurring',  term: 12, bucket: 'E' },

  // Custom (user defines everything)
  { code: 'custom',            name: '✏️ Custom Add-on',              setup: 0,     monthly: 0,   type: 'custom',         term: 0,  bucket: null },
];
