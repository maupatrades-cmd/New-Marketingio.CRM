import { supabase } from './supabase.js';

/** Live commission preview from the server — single source of truth. */
export async function previewCommission(payload) {
  const { data, error } = await supabase.rpc('preview_commission', { payload });
  if (error) throw error;
  return data;
}

/** Run the full sale through the canonical RPC. */
export async function closeSale(payload) {
  const { data, error } = await supabase.rpc('close_sale', { payload });
  if (error) throw error;
  return data;
}

/** Close a sale that originated from a lead — stamps deals.lead_id so the
 *  milestone trigger fires sale_won to the lead's assigner. */
export async function closeSaleFromLead(payload, leadId) {
  const { data, error } = await supabase.rpc('close_sale_from_lead', { payload, p_lead_id: leadId });
  if (error) throw error;
  return data;
}

/** Load the commission rates JSON (for showing list prices / package cards). */
export async function loadCommissionRates() {
  const { data, error } = await supabase
    .from('system_settings').select('value').eq('key','commission_rates').single();
  if (error) throw error;
  return data?.value ?? {};
}

/** Load the fulfilment template for a package so the form can show what
 *  will auto-provision. */
export async function loadFulfilmentTemplate(packageCode) {
  const { data, error } = await supabase
    .from('fulfilment_templates')
    .select('id, code, name, setup_deliverables, recurring_deliverables, soft_sla_days, internal_owner_role, term_months')
    .eq('code', packageCode).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export const INDUSTRIES = [
  ['retail', 'Retail / Shop'],
  ['services', 'Services'],
  ['construction', 'Construction / Trades'],
  ['hospitality', 'Hospitality / Food'],
  ['beauty', 'Beauty / Salon'],
  ['health', 'Health / Wellness'],
  ['professional', 'Professional Services'],
  ['education', 'Education / Training'],
  ['other', 'Other'],
];

export const SOURCES = [
  ['cpc_outbound', 'CPC outbound'],
  ['field_agent_direct', 'Field agent direct'],
  ['fnc_referral', 'FNC referral'],
  ['inbound', 'Inbound'],
  ['referral', 'Referral'],
  ['other', 'Other'],
];

export const DISCOVERY_GOALS = [
  ['more_customers', 'More customers'],
  ['more_sales',     'More sales / orders'],
  ['more_bookings',  'More bookings'],
  ['brand_awareness','Brand awareness'],
  ['launching',      'Launching something new'],
];

export const BRAND_READY = [
  ['logo_colours', 'Logo + brand colours ready'],
  ['logo_only',    'Logo only'],
  ['nothing_yet',  'Nothing yet — start fresh'],
];

export const HOW_FOUND = [
  ['word_of_mouth', 'Word of mouth'],
  ['walk_ins',      'Walk-ins'],
  ['facebook',      'Facebook'],
  ['google',        'Google'],
  ['other',         'Other'],
];

export const ZAR = (n) =>
  'R ' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
