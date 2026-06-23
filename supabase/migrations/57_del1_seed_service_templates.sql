-- ══════════════════════════════════════════════════════════════════════
-- BRICK DEL1 Part B — 20 service template seeds
-- bucket: bucket_a_once_off | bucket_b_setup_recurring |
--         bucket_c_pure_recurring | bucket_d_paid_ads | bucket_e_passive
-- internal_owner_role: head_of_tech | admin | founder
-- ══════════════════════════════════════════════════════════════════════

INSERT INTO fulfilment_templates (
  code, name, bucket, pricing_setup_zar, pricing_recurring_zar,
  term_months, soft_sla_days, hard_sla_days, internal_owner_role,
  setup_deliverables, recurring_deliverables, client_obligations_config,
  scope_exclusions, tools_used, sign_off_criteria,
  exit_fee_zar, exit_fee_window_months
) VALUES

('ai_chatbot','AI Chatbot','bucket_b_setup_recurring',3500,1500,12,14,21,'head_of_tech',
 '[{"title":"Chatbot flow map","sla_days":5},{"title":"Chatbot build + test","sla_days":7},{"title":"Handover training","sla_days":2}]',
 '[{"title":"Monthly chatbot review + updates","cadence":"monthly"}]',
 '[{"key":"top_20_questions","label":"Provide top 20 customer questions","blocking":true},{"key":"brand_tone","label":"Brand tone and FAQ doc","blocking":true}]',
 'Custom AI training sets, third-party API costs beyond limits',
 'ManyChat / Tidio / custom LLM',
 'Client signs off on chatbot flow, test 5 sample conversations pass',1500,12),

('whatsapp_automation','WhatsApp Automation','bucket_b_setup_recurring',2500,1200,12,10,14,'head_of_tech',
 '[{"title":"WhatsApp Business API setup","sla_days":3},{"title":"Flow build + testing","sla_days":5},{"title":"Handover","sla_days":2}]',
 '[{"title":"Monthly flow updates + reporting","cadence":"monthly"}]',
 '[{"key":"whatsapp_number","label":"WhatsApp Business number access","blocking":true},{"key":"brand_assets","label":"Logo and brand colours","blocking":false}]',
 'Bulk broadcasting beyond fair use, premium API costs',
 'WhatsApp Business API, Zapier, Make.com',
 'Flows tested with 3 scenarios, client confirms receipt',1200,12),

('website_maintenance','Website Maintenance','bucket_c_pure_recurring',0,800,0,0,7,'head_of_tech',
 '[]',
 '[{"title":"Monthly updates + backups + security scan","cadence":"monthly"}]',
 '[{"key":"website_access","label":"Website admin login credentials","blocking":true},{"key":"hosting_access","label":"Hosting panel access","blocking":true}]',
 'Full redesigns, domain purchase',
 'WordPress, cPanel, Cloudflare',
 'Site loads under 3s, no broken links, backup confirmed',0,0),

('crm_training','CRM Training','bucket_b_setup_recurring',2000,500,6,7,10,'head_of_tech',
 '[{"title":"CRM setup + data import","sla_days":5},{"title":"1-on-1 training session","sla_days":2}]',
 '[{"title":"Monthly CRM check-in + reports","cadence":"monthly"}]',
 '[{"key":"existing_contacts","label":"Export of existing contacts (CSV)","blocking":false}]',
 'Custom CRM builds, third-party integrations beyond HubSpot/Notion',
 'HubSpot CRM, Notion, Google Workspace',
 'Client team can log a lead and move a deal independently',500,6),

('ecommerce_setup','E-Commerce Setup','bucket_b_setup_recurring',5000,1000,12,21,30,'head_of_tech',
 '[{"title":"Product catalogue setup","sla_days":10},{"title":"Payment gateway integration","sla_days":5},{"title":"Test order + handover","sla_days":6}]',
 '[{"title":"Monthly product updates + performance review","cadence":"monthly"}]',
 '[{"key":"product_list","label":"Product list with prices and images","blocking":true},{"key":"payment_credentials","label":"PayGate/PayFast credentials","blocking":true}]',
 'Inventory management system, custom checkout logic',
 'Shopify, WooCommerce, PayFast, PayGate',
 'Test order placed and fulfilled, client approves product display',2000,12),

('sms_marketing','SMS Marketing','bucket_b_setup_recurring',1500,800,6,7,10,'admin',
 '[{"title":"SMS list import + segmentation","sla_days":3},{"title":"First campaign build + send","sla_days":4}]',
 '[{"title":"Monthly SMS campaign","cadence":"monthly"}]',
 '[{"key":"contact_list","label":"Contact list with opt-in confirmation","blocking":true}]',
 'Bulk credits beyond monthly allocation, WASPA non-compliance issues',
 'BulkSMS, Clickatell',
 'First campaign delivered, open report shared with client',800,6),

('reputation_management','Reputation Management','bucket_b_setup_recurring',1200,1000,12,7,10,'admin',
 '[{"title":"Review audit + profile claim","sla_days":5},{"title":"Response framework setup","sla_days":2}]',
 '[{"title":"Monthly review monitoring + responses","cadence":"monthly"}]',
 '[{"key":"gbp_access","label":"Google Business Profile access","blocking":true},{"key":"social_logins","label":"Social media login credentials","blocking":false}]',
 'Legal disputes, fake-review removal beyond reasonable effort',
 'Google Business Profile, Trustpilot, HelloPeter, Birdeye',
 'All platforms claimed, first negative review responded to',1000,12),

('email_newsletter','Email Newsletter','bucket_b_setup_recurring',1000,600,6,7,10,'admin',
 '[{"title":"Email list import + template design","sla_days":5},{"title":"First newsletter send","sla_days":2}]',
 '[{"title":"Monthly newsletter (1 send)","cadence":"monthly"}]',
 '[{"key":"email_list","label":"Subscriber list (CSV with opt-in)","blocking":true},{"key":"brand_assets","label":"Logo + colours + fonts","blocking":false}]',
 'List building, paid newsletter ads',
 'Mailchimp, Brevo',
 'First send delivered, open rate > 15%, unsubscribe < 2%',600,6),

('short_form_video','Short-Form Video Content','bucket_b_setup_recurring',2500,1500,6,10,14,'admin',
 '[{"title":"Content strategy + shot list","sla_days":5},{"title":"First batch of 4 videos","sla_days":5}]',
 '[{"title":"4 short-form videos per month","cadence":"monthly"}]',
 '[{"key":"shoot_availability","label":"Confirm shoot date and location","blocking":true},{"key":"brand_assets","label":"Logo overlay + brand colours","blocking":false}]',
 'Professional studio time, actors, music licensing fees',
 'CapCut, DaVinci Resolve, Canva',
 'Client approves 4 videos for publish before scheduling',1500,6),

('ai_content_writing','AI Content Writing','bucket_b_setup_recurring',1500,900,6,7,10,'admin',
 '[{"title":"Brand voice calibration doc","sla_days":3},{"title":"First month content pack (10 posts)","sla_days":4}]',
 '[{"title":"10 AI-assisted posts per month","cadence":"monthly"}]',
 '[{"key":"brand_voice","label":"Brand tone of voice guide or examples","blocking":false},{"key":"content_topics","label":"Topics or FAQs you want covered","blocking":false}]',
 'Premium stock images, paid content distribution',
 'Claude AI, Jasper, Grammarly, Canva',
 'Client approves at least 8 of 10 posts without revision requests',900,6),

('gbp_optimisation','Google Business Profile Optimisation','bucket_b_setup_recurring',1500,700,12,7,10,'admin',
 '[{"title":"GBP full audit + optimisation","sla_days":5},{"title":"Photos + posts + Q&A setup","sla_days":2}]',
 '[{"title":"Monthly GBP updates + posts + insights report","cadence":"monthly"}]',
 '[{"key":"gbp_access","label":"Google Business Profile manager access","blocking":true},{"key":"business_photos","label":"At least 10 business photos","blocking":false}]',
 'Google Ads spend, map-pack guarantee',
 'Google Business Profile, BrightLocal',
 'Profile completeness score > 90%, first post live',700,12),

('paid_ads_management','Paid Ads Management','bucket_d_paid_ads',2000,1200,12,10,14,'admin',
 '[{"title":"Ads account audit + strategy","sla_days":5},{"title":"First campaign live","sla_days":5}]',
 '[{"title":"Monthly ads management + report","cadence":"monthly"}]',
 '[{"key":"ads_account","label":"Google/Meta Ads account access","blocking":true},{"key":"ad_budget","label":"Confirm monthly ad spend budget","blocking":true}]',
 'Ad spend itself, creative photography',
 'Google Ads, Meta Ads Manager, Google Analytics',
 'Campaign live, first report shared within 7 days of launch',2400,12),

('print_signage_coordination','Print & Signage Coordination','bucket_a_once_off',1000,0,0,7,10,'admin',
 '[{"title":"Design artwork (print-ready)","sla_days":5},{"title":"Supplier quote + order coordination","sla_days":2}]',
 '[]',
 '[{"key":"brand_assets","label":"Logo files (vector preferred)","blocking":true},{"key":"print_specs","label":"Size/material requirements","blocking":false}]',
 'Printing cost itself, installation',
 'Canva, Adobe Illustrator (outsourced)',
 'Print-ready artwork approved by client, supplier confirmed',0,0),

('domain_hosting_reselling','Domain & Hosting Reselling','bucket_e_passive',500,300,12,3,5,'admin',
 '[{"title":"Domain registration + hosting setup","sla_days":3}]',
 '[{"title":"Annual renewal reminder + invoice","cadence":"annual"}]',
 '[{"key":"domain_preference","label":"Preferred domain name + alternatives","blocking":false}]',
 'Premium domains, SSL beyond basic',
 'Afrihost, Xneelo, cPanel',
 'Domain resolves, site loads, SSL active',300,12),

('website_design_only','Website Design (Design Only)','bucket_a_once_off',4000,0,0,21,30,'founder',
 '[{"title":"Discovery + wireframes","sla_days":7},{"title":"Design mockup (desktop + mobile)","sla_days":10},{"title":"Client approval + handover","sla_days":4}]',
 '[]',
 '[{"key":"brand_assets","label":"Logo, colours, fonts","blocking":true},{"key":"content","label":"Page copy and images","blocking":true}]',
 'Development/coding, hosting, ongoing updates',
 'Figma, Canva',
 'Client approves final mockup in Figma',0,0),

('plan_website_bundle','Website Design + Build Bundle','bucket_b_setup_recurring',8000,0,0,30,45,'founder',
 '[{"title":"Discovery + wireframes","sla_days":5},{"title":"Design mockup","sla_days":10},{"title":"Development","sla_days":12},{"title":"QA + launch","sla_days":3}]',
 '[]',
 '[{"key":"brand_assets","label":"Logo, colours, fonts","blocking":true},{"key":"content","label":"All page copy and images","blocking":true},{"key":"domain_access","label":"Domain registrar access","blocking":false}]',
 'Ongoing hosting fees, e-commerce functionality',
 'Figma, WordPress, Elementor',
 'Site live, client approves all pages, Google Search Console connected',0,0),

('marketing_audit','Marketing Audit','bucket_a_once_off',2500,0,0,14,21,'founder',
 '[{"title":"Current state audit (digital + print)","sla_days":7},{"title":"Audit report + recommendations","sla_days":7}]',
 '[]',
 '[{"key":"access_pack","label":"Access to all active marketing channels","blocking":false}]',
 'Implementation of recommendations (separate engagement)',
 'Semrush, Google Analytics, BrightLocal, SimilarWeb',
 'Client receives and acknowledges 10-page report',0,0),

('competitor_analysis','Competitor Analysis','bucket_a_once_off',2000,0,0,10,14,'founder',
 '[{"title":"Identify 5 key competitors + analyse","sla_days":7},{"title":"Report + strategic positioning brief","sla_days":3}]',
 '[]',
 '[{"key":"competitors","label":"List of known competitors","blocking":false}]',
 'Ongoing monitoring (covered in GBP/SEO packages)',
 'Semrush, SpyFu, SimilarWeb, Facebook Ad Library',
 'Client receives final report, agrees on positioning statement',0,0),

('workshops','Workshops & Training Sessions','bucket_a_once_off',3000,0,0,7,10,'founder',
 '[{"title":"Workshop agenda + prep materials","sla_days":5},{"title":"Deliver workshop","sla_days":2}]',
 '[]',
 '[{"key":"attendee_count","label":"Confirm attendee count and format (on-site/virtual)","blocking":true}]',
 'Travel outside Johannesburg without additional fee, ongoing coaching',
 'Google Meet, Zoom, Canva, Slides',
 'Workshop delivered, feedback form completed by attendees',0,0),

('business_plan','Business Plan Writing','bucket_a_once_off',5000,0,0,21,30,'founder',
 '[{"title":"Discovery interview + data collection","sla_days":5},{"title":"Draft plan (financial + narrative)","sla_days":14},{"title":"Final review + revisions","sla_days":2}]',
 '[]',
 '[{"key":"financial_data","label":"Last 2 years financials or projections","blocking":true},{"key":"business_info","label":"Business registration docs","blocking":false}]',
 'Accounting / tax advice, legal compliance checks',
 'MS Word, Google Docs, Canva (executive summary)',
 'Client approves final document, receives editable copy',0,0)

ON CONFLICT (code) DO UPDATE SET
  name                      = EXCLUDED.name,
  setup_deliverables        = EXCLUDED.setup_deliverables,
  recurring_deliverables    = EXCLUDED.recurring_deliverables,
  client_obligations_config = EXCLUDED.client_obligations_config,
  internal_owner_role       = EXCLUDED.internal_owner_role,
  updated_at                = now();

DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM fulfilment_templates WHERE is_active = TRUE) >= 20,
    '20 active service templates not found';
END $$;
