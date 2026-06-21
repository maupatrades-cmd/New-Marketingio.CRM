import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2,
  Plus, Trash2, AlertTriangle, Wallet, Users, Briefcase, FileText, Calendar, Eye,
  Building2, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';
import {
  previewCommission, closeSale, closeSaleFromLead, loadCommissionRates, loadFulfilmentTemplate,
  INDUSTRIES, SOURCES, DISCOVERY_GOALS, BRAND_READY, HOW_FOUND, ZAR,
} from '../../../lib/sales.js';

const STEPS = [
  { key: 'client',       label: 'Client',       icon: Users },
  { key: 'package',      label: 'Package',      icon: Briefcase },
  { key: 'attribution',  label: 'Attribution',  icon: Wallet },
  { key: 'brief',        label: 'Brief',        icon: FileText },
  { key: 'dates',        label: 'Dates',        icon: Calendar },
  { key: 'banking',      label: 'Banking',      icon: Building2 },
  { key: 'review',       label: 'Review',       icon: Eye },
];

const blankForm = () => ({
  // step 1
  use_existing_client: false,
  client_id: '',
  client_business_name: '',
  client_contact_person: '',
  client_phone: '',
  client_email: '',
  client_address: '',
  client_industry: '',
  client_whatsapp: '',
  client_website: '',
  client_gmaps_url: '',
  client_socials: { instagram: '', facebook: '', tiktok: '' },

  // step 2
  package: '',
  contract_term_months: '12',
  add_on_code: '',
  add_on_name: '',
  setup_fee: '',
  monthly_retainer: '',

  // step 3
  closer_id: '',
  cpc_id: '',
  source: 'inbound',

  // step 4 (brief + discovery + custom deliverables)
  brief: '',
  brand_notes: '',
  discovery: {
    biz_does: '', ideal_customer: '', goal: '',
    differentiator: '', brand_ready: '', location: '', avoid: '',
    socials_existing: '', how_found: '', competitor: '', busy_times: '',
    price_range: '', biz_whatsapp: '',
  },
  custom_deliverables: [], // [{ title, note }]

  // step 5 — dates
  close_date: new Date().toISOString().slice(0, 10),
  expected_start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  contract_start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  debit_day: '1',
  notes: '',

  // step 6 — banking (POPIA write-only: cleared from state after successful submit)
  bank_name: '',
  account_holder_name: '',
  account_holder_id: '',
  account_holder_type: 'client_own',
  account_number: '',
  account_type: 'cheque',
  branch_code: '',
  third_party_consent: false,
  banking_captured: false,   // true after submit — shows badge only
});

export default function LogSale() {
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get('lead') || null;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const idemRef = useRef(crypto.randomUUID());

  // Initialise closer to current user once auth resolves
  useEffect(() => { if (user && !form.closer_id) setForm(f => ({ ...f, closer_id: user.id })); }, [user]);

  // If launched from a lead, pre-fill client fields from the lead.
  const leadQ = useQuery({
    queryKey: ['lead_for_logsale', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, business_name, contact_person, phone, email, industry, source, notes, assigned_to')
        .eq('id', leadId)
        .single();
      if (error) throw error;
      // fetch assigned user's role so we can auto-set cpc_id
      if (data?.assigned_to) {
        const { data: ur } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', data.assigned_to)
          .single();
        data._assigned_role = ur?.role ?? null;
      }
      return data;
    },
  });
  useEffect(() => {
    if (!leadQ.data) return;
    const l = leadQ.data;
    const mapSource = (s) => (
      s === 'cpc_outbound' ? 'cpc_outbound' :
      s === 'field_agent_direct' ? 'field_agent_direct' :
      s === 'fnc_referral' ? 'fnc_referral' :
      s === 'inbound' ? 'inbound' :
      s === 'referral' ? 'referral' : 'other'
    );
    setForm(f => ({
      ...f,
      use_existing_client: false,
      client_business_name: l.business_name || '',
      client_contact_person: l.contact_person || '',
      client_phone: l.phone || '',
      client_email: l.email || '',
      client_industry: l.industry || '',
      source: mapSource(l.source),
      notes: l.notes || '',
      // Attribution: if assigner is CPC, stamp cpc_id so their bonus fires.
      // If assigner is field_agent, set them as closer so commission is
      // calculated at their rate (the deal belongs to them). The 15/85
      // closer override preview shown in the side panel makes the actual
      // payout transparent until Slice 3's split engine ships.
      ...(l.assigned_to && l._assigned_role === 'cpc'
        ? { cpc_id: l.assigned_to }
        : {}),
      ...(l.assigned_to && l._assigned_role === 'field_agent'
        ? { closer_id: l.assigned_to }
        : {}),
    }));
  }, [leadQ.data]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Data loaders
  const ratesQ = useQuery({ queryKey: ['rates'], queryFn: loadCommissionRates });
  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('id, email, full_name')
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const clientsQ = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients').select('id, business_name, industry')
        .order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isCore3 = useMemo(() => ['ignite','accelerate','dominate'].includes(form.package), [form.package]);
  const isPulse = useMemo(() => ['street_pulse','township_pulse'].includes(form.package), [form.package]);

  /** When the package or term changes, prefill setup + monthly from settings. */
  useEffect(() => {
    if (!ratesQ.data || !form.package) return;
    if (isCore3) {
      const cfg = ratesQ.data?.packages?.[form.package]?.[form.contract_term_months];
      if (cfg) {
        setForm(f => ({ ...f, setup_fee: String(cfg.setup), monthly_retainer: String(cfg.monthly) }));
      }
    } else if (isPulse) {
      const cfg = ratesQ.data?.pulse?.[form.package];
      if (cfg) {
        setForm(f => ({ ...f, setup_fee: String(cfg.setup), monthly_retainer: String(cfg.monthly), contract_term_months: '' }));
      }
    }
  }, [form.package, form.contract_term_months, ratesQ.data, isCore3, isPulse]);

  /** Fulfilment template for the chosen package — drives the "what's included" list. */
  const templateQ = useQuery({
    queryKey: ['template', form.package],
    queryFn: () => loadFulfilmentTemplate(form.package),
    enabled: !!form.package && form.package !== 'add_on',
  });

  /** Live commission preview — recomputes whenever the inputs change. */
  const previewKey = JSON.stringify({
    p: form.package, t: form.contract_term_months, sf: form.setup_fee, m: form.monthly_retainer, cpc: form.cpc_id, closer: form.closer_id,
  });
  const previewQ = useQuery({
    queryKey: ['preview', previewKey],
    enabled: !!form.package && (form.setup_fee !== '' || form.monthly_retainer !== ''),
    queryFn: () => previewCommission({
      deal_type: form.package === 'add_on' ? 'add_on' : 'core_package',
      package: form.package === 'add_on' ? undefined : form.package,
      contract_term_months: (isCore3 || form.package === 'other') ? form.contract_term_months : undefined,
      setup_fee: Number(form.setup_fee) || 0,
      monthly_retainer: Number(form.monthly_retainer) || 0,
      cpc_id: form.cpc_id || undefined,
      preview_as_closer_id: form.closer_id !== user?.id ? form.closer_id : undefined,
    }),
  });

  /* ─────────── validation ─────────── */
  function canAdvance() {
    if (step === 0) {
      if (form.use_existing_client) return !!form.client_id;
      return !!form.client_business_name && !!form.client_email && !!form.client_industry;
    }
    if (step === 1) {
      if (!form.package) return false;
      if (isCore3 && !['12','6'].includes(form.contract_term_months)) return false;
      return Number(form.setup_fee) >= 0 && Number(form.monthly_retainer) >= 0;
    }
    if (step === 2) return !!form.closer_id;
    if (step === 3) {
      const d = form.discovery;
      return !!(d.biz_does && d.ideal_customer && d.goal); // 3 required
    }
    if (step === 4) return !!form.close_date && !!form.contract_start_date && !!form.debit_day;
    if (step === 5) {
      if (form.banking_captured) return true;
      if (!form.bank_name && !form.account_number) return true; // skip allowed
      const baseOk = !!(form.bank_name && form.account_holder_name && form.account_number);
      const thirdPartyOk = form.account_holder_type === 'client_own' || form.third_party_consent;
      return baseOk && thirdPartyOk;
    }
    return true;
  }

  async function onSubmit() {
    if (busy) return;
    setBusy(true);
    try {
      const payload = {
        idempotency_key: idemRef.current,
        deal_type: form.package === 'add_on' ? 'add_on' : 'core_package',
        package: form.package === 'add_on' ? undefined : form.package,
        contract_term_months: (isCore3 || form.package === 'other') ? form.contract_term_months : undefined,
        setup_fee: Number(form.setup_fee) || 0,
        monthly_retainer: Number(form.monthly_retainer) || 0,
        cpc_id: form.cpc_id || undefined,
        source: form.source,
        notes: form.notes || undefined,
        brief: form.brief || undefined,
        brand_notes: form.brand_notes || undefined,
        discovery: form.discovery,
        expected_start_date: form.expected_start_date,
        custom_deliverables: form.custom_deliverables.filter(d => d.title.trim()),
        ...(form.use_existing_client
          ? { client_id: form.client_id }
          : {
              client_business_name: form.client_business_name,
              client_contact_person: form.client_contact_person,
              client_phone: form.client_phone,
              client_email: form.client_email,
              client_address: form.client_address,
              client_industry: form.client_industry,
              client_whatsapp: form.client_whatsapp,
              client_website: form.client_website,
              client_socials: form.client_socials,
              client_gmaps_url: form.client_gmaps_url,
            }),
      };

      const result = leadId
        ? await closeSaleFromLead(payload, leadId)
        : await closeSale(payload);

      const dealId = result?.deal_id;

      // Stamp contract dates + debit_day
      if (dealId && form.contract_start_date) {
        const { error: dErr } = await supabase.rpc('stamp_deal_contract_dates', {
          p_deal_id:        dealId,
          p_contract_start: form.contract_start_date,
          p_debit_day:      Number(form.debit_day) || 1,
        });
        if (dErr) throw dErr;
      }

      // Capture banking (POPIA write-only — clear fields from state after)
      const hasBanking = form.bank_name && form.account_holder_name && form.account_number;
      if (dealId && hasBanking && !form.banking_captured) {
        const { error: bErr } = await supabase.rpc('capture_banking', {
          p_deal_id:             dealId,
          p_bank_name:           form.bank_name,
          p_account_holder_name: form.account_holder_name,
          p_account_holder_id:   form.account_holder_id || null,
          p_account_holder_type: form.account_holder_type,
          p_account_number:      form.account_number,
          p_account_type:        form.account_type,
          p_branch_code:         form.branch_code || null,
          p_third_party_consent: form.third_party_consent,
        });
        if (bErr) throw bErr;
        // POPIA: erase banking fields from state — they must never reappear
        setForm(f => ({
          ...f,
          bank_name: '', account_holder_name: '', account_holder_id: '',
          account_number: '', branch_code: '', third_party_consent: false,
          banking_captured: true,
        }));
      }

      if (result?.idempotent_replay) toast.message('Already logged — opening original.');
      else toast.success(leadId ? 'Sale logged & lead linked ✅' : 'Sale logged ✅');
      setDone(result);
    } catch (err) {
      toast.error(err.message ?? 'Sale could not be logged.');
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setForm(blankForm());
    setStep(0);
    setDone(null);
    idemRef.current = crypto.randomUUID();
    if (user) set('closer_id', user.id);
  }

  if (done) return <SuccessCard done={done} onAnother={resetForm} onView={() => navigate('/owner/sales/deals')} />;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl"><span className="text-gradient">Log a Sale</span></h1>
          <p className="text-sm text-soft">
            Step {step+1} of {STEPS.length} · {STEPS[step].label}
          </p>
        </div>
        <span className="text-xs text-soft uppercase tracking-widest">
          Role: <span className="text-brandred">{role ?? 'no role'}</span>
        </span>
      </header>

      {leadId && leadQ.data && (
        <div className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 space-y-0.5">
          <p>Converting lead: <strong className="text-white">{leadQ.data.business_name}</strong></p>
          {leadQ.data._assigned_role === 'field_agent' && (
            <p className="text-emerald-300/80">Field agent originated this lead — closer-override split preview (15% / 85%) shown in the side panel.</p>
          )}
          {leadQ.data._assigned_role === 'cpc' && (
            <p className="text-emerald-300/80">CPC attribution pre-filled — their bonus will fire on submit.</p>
          )}
          {!leadQ.data.assigned_to && (
            <p className="text-amber-300/80">⚠ Lead is unassigned — no assigner notification will fire. Assign first if needed.</p>
          )}
        </div>
      )}

      <ProgressBar step={step} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="card p-6">
          <StepErrorBoundary step={step}>
            {step === 0 && <Step1Client form={form} set={set} clients={clientsQ.data ?? []} />}
            {step === 1 && <Step2Package form={form} set={set} rates={ratesQ.data ?? {}} template={templateQ.data} isCore3={isCore3} isPulse={isPulse} />}
            {step === 2 && <Step3Attribution form={form} set={set} users={usersQ.data ?? []} currentUserId={user?.id} />}
            {step === 3 && <Step4Brief form={form} set={set} setForm={setForm} template={templateQ.data}/>}
            {step === 4 && <Step5Dates form={form} set={set} termMonths={isCore3 ? Number(form.contract_term_months) : isPulse ? 1 : 12} />}
            {step === 5 && <Step6Banking form={form} set={set} setForm={setForm} />}
            {step === 6 && <Step7Review form={form} preview={previewQ.data} template={templateQ.data} ratesLoading={ratesQ.isLoading}/>}
          </StepErrorBoundary>
        </div>

        <CommissionPreviewBar
          preview={previewQ.data}
          loading={previewQ.isLoading}
          form={form}
          closerOverride={
            leadId && leadQ.data?._assigned_role === 'field_agent' && role === 'owner' && form.closer_id !== user?.id
              ? {
                  closerPct: 15,
                  originatorPct: 85,
                  originatorName: (usersQ.data ?? []).find(u => u.id === form.closer_id)?.full_name || 'field agent',
                  closerName: profile?.full_name || 'you (owner)',
                }
              : null
          }
        />
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-darkbg-border pt-4">
        <button onClick={() => setStep(s => Math.max(0, s-1))} disabled={step === 0 || busy}
                className="btn-ghost">
          <ArrowLeft size={16}/> Back
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(s => s+1)} disabled={!canAdvance() || busy} className="btn-primary">
            {step === 5 && !form.bank_name && !form.account_number ? 'Skip banking' : 'Continue'} <ArrowRight size={16}/>
          </button>
        ) : (
          <button onClick={onSubmit} disabled={!canAdvance() || busy} className="btn-primary">
            {busy ? <><Loader2 size={16} className="animate-spin"/> Logging…</> : <>Log Sale <Check size={16}/></>}
          </button>
        )}
      </footer>
    </div>
  );
}

/* ─────────────────────────── PROGRESS BAR ─────────────────────────── */
function ProgressBar({ step }) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step, active = i === step;
          return (
            <div key={s.key} className="flex flex-1 items-center gap-1">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                done ? 'bg-emerald-500 text-white' : active ? 'bg-brandred text-white' : 'bg-darkbg-700 text-soft'
              }`}>
                {done ? <Check size={14}/> : <Icon size={14}/>}
              </div>
              <span className={`hidden text-xs uppercase tracking-widest sm:inline ${active ? 'text-white' : 'text-soft'}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <div className={`mx-1 h-px flex-1 ${i < step ? 'bg-emerald-500' : 'bg-darkbg-border'}`}/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── STEP 1 — CLIENT ─────────────────────────── */
function Step1Client({ form, set, clients }) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl">Client</h2>
      <div className="flex gap-2">
        <button onClick={() => set('use_existing_client', true)}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${form.use_existing_client ? 'bg-brandred text-white' : 'border border-darkbg-border text-soft'}`}>
          Existing
        </button>
        <button onClick={() => set('use_existing_client', false)}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${!form.use_existing_client ? 'bg-brandred text-white' : 'border border-darkbg-border text-soft'}`}>
          New client
        </button>
      </div>

      {form.use_existing_client ? (
        <div>
          <label className="label">Pick a client</label>
          <select className="input" value={form.client_id} onChange={e => set('client_id', e.target.value)}>
            <option value="">— Select —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
          </select>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Business name *" col={2} value={form.client_business_name} onChange={v => set('client_business_name', v)} required />
          <Field label="Contact person" value={form.client_contact_person} onChange={v => set('client_contact_person', v)} />
          <Field label="Email *" value={form.client_email} onChange={v => set('client_email', v)} type="email" required />
          <Field label="Phone" value={form.client_phone} onChange={v => set('client_phone', v)} type="tel" />
          <Field label="WhatsApp" value={form.client_whatsapp} onChange={v => set('client_whatsapp', v)} type="tel" />
          <Field label="City / address" col={2} value={form.client_address} onChange={v => set('client_address', v)} />
          <div className="col-span-2">
            <label className="label">Industry *</label>
            <select className="input" value={form.client_industry} onChange={e => set('client_industry', e.target.value)}>
              <option value="">— Pick one —</option>
              {INDUSTRIES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Field label="Website" col={2} value={form.client_website} onChange={v => set('client_website', v)} placeholder="https://"/>
          <Field label="Google Maps URL" col={2} value={form.client_gmaps_url} onChange={v => set('client_gmaps_url', v)} placeholder="https://maps.app.goo.gl/..."/>
          <div className="col-span-2 grid grid-cols-3 gap-3">
            <Field label="Instagram @" value={form.client_socials.instagram} onChange={v => set('client_socials', { ...form.client_socials, instagram: v })} />
            <Field label="Facebook" value={form.client_socials.facebook} onChange={v => set('client_socials', { ...form.client_socials, facebook: v })} />
            <Field label="TikTok @" value={form.client_socials.tiktok} onChange={v => set('client_socials', { ...form.client_socials, tiktok: v })} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── STEP 2 — PACKAGE ─────────────────────────── */
function Step2Package({ form, set, rates, template, isCore3, isPulse }) {
  const packages = [
    { code: 'ignite',         name: 'Ignite' },
    { code: 'accelerate',     name: 'Accelerate' },
    { code: 'dominate',       name: 'Dominate' },
    { code: 'street_pulse',   name: 'Street Pulse' },
    { code: 'township_pulse', name: 'Township Pulse' },
    { code: 'other',          name: 'Other (custom)' },
  ];
  const dealValue = (Number(form.setup_fee) || 0) +
    (Number(form.monthly_retainer) || 0) * (Number(form.contract_term_months) || 1);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl">Package & term</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {packages.map(p => {
          const cfg12 = rates?.packages?.[p.code]?.['12'];
          const pulseCfg = rates?.pulse?.[p.code];
          const tag = cfg12 ? `R${cfg12.setup}/${cfg12.monthly}` :
                       pulseCfg ? `R${pulseCfg.setup} setup` :
                       p.code === 'other' ? 'Custom amounts' : '';
          return (
            <button key={p.code} onClick={() => set('package', p.code)}
                    className={`rounded-xl border p-3 text-left transition ${form.package === p.code ? 'border-brandred bg-brandred/10' : 'border-darkbg-border hover:bg-darkbg-border/30'}`}>
              <p className="font-semibold text-white">{p.name}</p>
              <p className="text-xs text-soft">{tag}</p>
            </button>
          );
        })}
      </div>

      {isCore3 && (
        <div>
          <label className="label">Contract term</label>
          <div className="flex gap-2">
            {['12','6'].map(t => {
              const cfg = rates?.packages?.[form.package]?.[t];
              return (
                <button key={t} onClick={() => set('contract_term_months', t)}
                        className={`flex-1 rounded-xl border p-3 text-left transition ${form.contract_term_months === t ? 'border-brandred bg-brandred/10' : 'border-darkbg-border'}`}>
                  <p className="font-semibold text-white">{t} months</p>
                  {cfg && <p className="text-xs text-soft">List R{cfg.setup} setup · R{cfg.monthly}/mo</p>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {form.package === 'other' && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
          Custom package — set setup, monthly, and term freely.
          Commission: <strong>10% setup / 8% monthly</strong> (closer) ·
          {' '}<strong>25% setup / 37% monthly</strong> (owner).
        </div>
      )}

      {form.package && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Setup (R)" type="number" value={form.setup_fee} onChange={v => set('setup_fee', v)}/>
          <Field label="Monthly (R)" type="number" value={form.monthly_retainer} onChange={v => set('monthly_retainer', v)}/>
          <Field label="Term (months)" type="number" value={form.contract_term_months} onChange={v => set('contract_term_months', v)}
                 disabled={isPulse}/>
          <div className="col-span-3 flex items-center justify-between rounded-xl border border-darkbg-border bg-darkbg-900/60 p-3">
            <span className="text-sm text-soft">Total deal value</span>
            <span className="font-display text-xl text-brandred">{ZAR(dealValue)}</span>
          </div>
        </div>
      )}

      {template && form.package && (
        <div className="rounded-xl border border-darkbg-border bg-darkbg-900/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-soft">What's included (read-only)</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="mb-1 font-semibold text-white">Setup deliverables</p>
              <ul className="list-disc space-y-0.5 pl-5 text-soft">
                {(template.setup_deliverables ?? []).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold text-white">Monthly recurring</p>
              <ul className="list-disc space-y-0.5 pl-5 text-soft">
                {(template.recurring_deliverables ?? []).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── STEP 3 — ATTRIBUTION ─────────────────────────── */
function Step3Attribution({ form, set, users, currentUserId }) {
  const closer = users.find(u => u.id === form.closer_id);
  const cpc    = users.find(u => u.id === form.cpc_id);
  const selfCpc = form.cpc_id && form.cpc_id === form.closer_id;
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl">Attribution</h2>
      <div>
        <label className="label">Closer *</label>
        <select className="input" value={form.closer_id} onChange={e => set('closer_id', e.target.value)}>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.full_name || u.email}{u.id === currentUserId ? ' (you)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Originating CPC (optional)</label>
        <select className="input" value={form.cpc_id} onChange={e => set('cpc_id', e.target.value)}>
          <option value="">— No CPC —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
        </select>
        {form.cpc_id && !selfCpc && (
          <p className="mt-1.5 text-xs text-emerald-400">
            CPC <strong>{cpc?.full_name ?? cpc?.email}</strong> earns R87 lead fee + R250 closure bonus.
          </p>
        )}
        {selfCpc && (
          <p className="mt-1.5 text-xs text-soft">
            Same person closing — package % only, no R250 bonus.
          </p>
        )}
      </div>
      <div>
        <label className="label">Source</label>
        <select className="input" value={form.source} onChange={e => set('source', e.target.value)}>
          {SOURCES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="rounded-xl border border-darkbg-border bg-darkbg-900/40 p-3 text-xs text-soft">
        <p>
          <strong className="text-white">{closer?.full_name ?? closer?.email ?? 'Closer'}</strong>
          {' '}will be credited with the package commission.
          {form.cpc_id && !selfCpc && (
            <> <strong className="text-white">{cpc?.full_name ?? cpc?.email}</strong> will receive the CPC sourcing payouts.</>
          )}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── STEP 4 — BRIEF ─────────────────────────── */
function Step4Brief({ form, set, setForm, template }) {
  function updateDiscovery(k, v) {
    setForm(f => ({ ...f, discovery: { ...f.discovery, [k]: v } }));
  }
  function addCustom() {
    setForm(f => ({ ...f, custom_deliverables: [...f.custom_deliverables, { title: '', note: '' }] }));
  }
  function removeCustom(i) {
    setForm(f => ({ ...f, custom_deliverables: f.custom_deliverables.filter((_, j) => j !== i) }));
  }
  function updateCustom(i, k, v) {
    setForm(f => ({
      ...f,
      custom_deliverables: f.custom_deliverables.map((d, j) => j === i ? { ...d, [k]: v } : d),
    }));
  }
  const d = form.discovery;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl">Brief & discovery</h2>
        <p className="mt-1 text-sm text-soft">
          The 3 required questions feed the welcome image + marketing kickoff. Everything else is optional — skipped items get re-asked in the onboarding email.
        </p>
      </div>

      {/* free-form brief */}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="label">Client brief (their words)</label>
          <textarea className="input min-h-[80px]" value={form.brief} onChange={e => set('brief', e.target.value)}
                    placeholder="What did they say they want? Any verbal promises?"/>
        </div>
        <div>
          <label className="label">Brand notes</label>
          <textarea className="input" value={form.brand_notes} onChange={e => set('brand_notes', e.target.value)}
                    placeholder="Colours, fonts, 'logo coming Monday', vibe…"/>
        </div>
      </div>

      {/* discovery — 3 required */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-soft">Required (3 questions)</p>
        <Field label="What does the business do / sell? *" col={1} value={d.biz_does} onChange={v => updateDiscovery('biz_does', v)} required/>
        <Field label="Who are your ideal customers? *" col={1} value={d.ideal_customer} onChange={v => updateDiscovery('ideal_customer', v)} required/>
        <div>
          <label className="label">What's your #1 goal? *</label>
          <select className="input" value={d.goal} onChange={e => updateDiscovery('goal', e.target.value)}>
            <option value="">— Pick one —</option>
            {DISCOVERY_GOALS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-soft">Optional (skippable)</p>
        <Field label="What makes you different?" col={1} value={d.differentiator} onChange={v => updateDiscovery('differentiator', v)} />
        <div>
          <label className="label">Brand assets ready?</label>
          <select className="input" value={d.brand_ready} onChange={e => updateDiscovery('brand_ready', e.target.value)}>
            <option value="">—</option>
            {BRAND_READY.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <Field label="Location / service area" col={1} value={d.location} onChange={v => updateDiscovery('location', v)} />
        <Field label="Anything we should avoid?" col={1} value={d.avoid} onChange={v => updateDiscovery('avoid', v)} />
        <Field label="Existing social handles" col={1} value={d.socials_existing} onChange={v => updateDiscovery('socials_existing', v)} placeholder="@theirIG · @theirFB"/>
        <div>
          <label className="label">How do customers find you now?</label>
          <select className="input" value={d.how_found} onChange={e => updateDiscovery('how_found', e.target.value)}>
            <option value="">—</option>
            {HOW_FOUND.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <Field label="Biggest competitor" col={1} value={d.competitor} onChange={v => updateDiscovery('competitor', v)} />
        <Field label="Busiest days/times" col={1} value={d.busy_times} onChange={v => updateDiscovery('busy_times', v)} />
        <Field label="Typical sale value / price range" col={1} value={d.price_range} onChange={v => updateDiscovery('price_range', v)} />
        <Field label="Business WhatsApp" col={1} value={d.biz_whatsapp} onChange={v => updateDiscovery('biz_whatsapp', v)} type="tel"/>
      </div>

      {/* read-only included deliverables */}
      {template && (
        <div className="rounded-xl border border-darkbg-border bg-darkbg-900/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-soft">Included in this package</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-soft">
            {[...(template.setup_deliverables ?? []), ...(template.recurring_deliverables ?? [])].map((t,i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* custom deliverables */}
      <div className="rounded-xl border border-darkbg-border p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="font-semibold text-white">Custom deliverables</p>
            <p className="text-xs text-soft">For paid extras, add an add-on sale instead. These route to tech queue at no cost.</p>
          </div>
          <button type="button" onClick={addCustom} className="btn-ghost text-xs">
            <Plus size={14}/> Add
          </button>
        </div>
        {form.custom_deliverables.length === 0 ? (
          <p className="text-xs text-soft">No custom deliverables yet.</p>
        ) : (
          <div className="space-y-2">
            {form.custom_deliverables.map((cd, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input className="input" placeholder="Title" value={cd.title} onChange={e => updateCustom(i,'title',e.target.value)}/>
                <input className="input" placeholder="Short note" value={cd.note} onChange={e => updateCustom(i,'note',e.target.value)}/>
                <button type="button" onClick={() => removeCustom(i)} className="rounded-md p-2 text-soft hover:bg-rose-500/15 hover:text-rose-300">
                  <Trash2 size={16}/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── STEP 5 — DATES ─────────────────────────── */
function Step5Dates({ form, set, termMonths }) {
  const contractEnd = useMemo(() => {
    if (!form.contract_start_date || !termMonths) return '';
    const d = new Date(form.contract_start_date);
    d.setMonth(d.getMonth() + termMonths);
    return d.toISOString().slice(0, 10);
  }, [form.contract_start_date, termMonths]);

  const firstInvoice = useMemo(() => {
    if (!form.contract_start_date || !form.debit_day) return '';
    const start = new Date(form.contract_start_date);
    const day = Number(form.debit_day);
    const candidate = new Date(start.getFullYear(), start.getMonth(), day);
    if (candidate < start) candidate.setMonth(candidate.getMonth() + 1);
    return candidate.toISOString().slice(0, 10);
  }, [form.contract_start_date, form.debit_day]);

  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl">Dates & notes</h2>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Close date" type="date" value={form.close_date} onChange={v => set('close_date', v)}/>
        <Field label="Expected go-live date" type="date" value={form.expected_start_date} onChange={v => set('expected_start_date', v)}/>
      </div>

      <div className="rounded-xl border border-darkbg-border bg-darkbg-900/40 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-soft">Contract</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contract start date *" type="date" value={form.contract_start_date}
                 onChange={v => set('contract_start_date', v)}/>
          <div>
            <label className="label">Contract end date (auto)</label>
            <input className="input opacity-60" type="date" value={contractEnd} readOnly
                   title={`Auto-computed: start + ${termMonths} months`}/>
          </div>
        </div>
        <div>
          <label className="label">Debit day *</label>
          <div className="flex gap-2">
            {[['1','1st of month'],['15','15th of month']].map(([v, lbl]) => (
              <button key={v} type="button" onClick={() => set('debit_day', v)}
                      className={`flex-1 rounded-xl border p-3 text-left transition ${
                        form.debit_day === v ? 'border-brandred bg-brandred/10' : 'border-darkbg-border hover:bg-darkbg-border/30'
                      }`}>
                <p className="font-semibold text-white">{lbl}</p>
              </button>
            ))}
          </div>
          {firstInvoice && (
            <p className="mt-2 text-xs text-emerald-400">
              First invoice date: <strong>{firstInvoice}</strong>
              {form.contract_start_date !== firstInvoice && ' (pro-rata first period)'}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="label">Internal notes</label>
        <textarea className="input min-h-[80px]" value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="Anything else worth recording?"/>
      </div>
    </div>
  );
}

/* ─────────────────────────── STEP 6 — BANKING ──────────────────────────── */
const ACCOUNT_HOLDER_TYPES = [
  ['client_own',      'Client\'s own account'],
  ['owner_personal',  'Owner\'s personal account'],
  ['third_party',     'Third-party account'],
];
const ACCOUNT_TYPES = [
  ['cheque',       'Cheque / Current'],
  ['savings',      'Savings'],
  ['transmission', 'Transmission'],
];
const SA_BANKS = [
  'ABSA', 'Capitec', 'First National Bank (FNB)', 'Nedbank', 'Standard Bank',
  'African Bank', 'Bidvest Bank', 'Discovery Bank', 'Investec', 'Mercantile Bank',
  'TymeBank', 'Other',
];

function Step6Banking({ form, set, setForm }) {
  if (form.banking_captured) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-xl">Banking</h2>
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <ShieldCheck size={28} className="text-emerald-400 shrink-0"/>
          <div>
            <p className="font-semibold text-emerald-300">Banking captured ✓</p>
            <p className="text-xs text-soft mt-0.5">
              Account details are encrypted and stored. Only finance (owner/admin with MFA) can view the full number.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isThirdParty = form.account_holder_type !== 'client_own';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl">Banking details</h2>
        <p className="mt-1 text-sm text-amber-300/80">
          POPIA: these fields clear from your screen after submit. Only finance can view the account number.
        </p>
      </div>

      <div className="rounded-xl border border-darkbg-border bg-darkbg-900/40 p-4 space-y-4">
        <div>
          <label className="label">Bank name</label>
          <select className="input" value={form.bank_name} onChange={e => set('bank_name', e.target.value)}>
            <option value="">— Select bank —</option>
            {SA_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Account holder type</label>
          <div className="grid grid-cols-3 gap-2">
            {ACCOUNT_HOLDER_TYPES.map(([v, lbl]) => (
              <button key={v} type="button" onClick={() => set('account_holder_type', v)}
                      className={`rounded-xl border p-2 text-left text-xs transition ${
                        form.account_holder_type === v
                          ? 'border-brandred bg-brandred/10 text-white'
                          : 'border-darkbg-border text-soft'
                      }`}>
                {lbl}
              </button>
            ))}
          </div>
          {isThirdParty && (
            <p className="mt-2 text-xs text-amber-300/80">
              Common for township SMEs — we accept this. Mandate consent required below.
            </p>
          )}
        </div>
        <Field label="Account holder name" value={form.account_holder_name}
               onChange={v => set('account_holder_name', v)}
               placeholder="As it appears on the bank account"/>
        <Field label="ID number / company reg (optional)" value={form.account_holder_id}
               onChange={v => set('account_holder_id', v)}
               placeholder="For AVS verification"/>
        <Field label="Account number" value={form.account_number}
               onChange={v => set('account_number', v)}
               placeholder="Enter carefully — this will be encrypted"/>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Account type</label>
            <select className="input" value={form.account_type} onChange={e => set('account_type', e.target.value)}>
              {ACCOUNT_TYPES.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
            </select>
          </div>
          <Field label="Branch code (optional)" value={form.branch_code}
                 onChange={v => set('branch_code', v)} placeholder="e.g. 632005"/>
        </div>

        {isThirdParty && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5"
                     checked={form.third_party_consent}
                     onChange={e => set('third_party_consent', e.target.checked)}/>
              <span className="text-xs text-amber-200">
                The account holder authorises Marketing iO to debit this account on behalf of{' '}
                <strong>{form.client_business_name || 'the client'}</strong>.
                I confirm this consent was obtained verbally or in writing.
              </span>
            </label>
            {!form.third_party_consent && (
              <p className="mt-2 text-[10px] text-rose-300">
                Consent required to proceed with a third-party account.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-soft">
        All fields above are cleared from your screen after the sale is saved.
        The account number is encrypted with AES-256 and can only be revealed by finance with MFA.
        You will only see a "Banking captured ✓" badge on return.
      </p>
    </div>
  );
}

/* ─────────────────────────── STEP 7 — REVIEW ─────────────────────────── */
function Step7Review({ form, preview, template, ratesLoading }) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl">Review</h2>
      <ReviewBlock title="Client">
        {form.use_existing_client
          ? <p>Existing client</p>
          : <>
              <p><strong className="text-white">{form.client_business_name || '—'}</strong>{form.client_industry && ` · ${form.client_industry}`}</p>
              <p className="text-soft">{form.client_email || '—'} · {form.client_phone || form.client_whatsapp || '—'}</p>
            </>}
      </ReviewBlock>
      <ReviewBlock title="Package">
        <p><strong className="text-white">{form.package || '—'}</strong> · {form.contract_term_months || '—'} months</p>
        <p className="text-soft">Setup {ZAR(form.setup_fee)} · Monthly {ZAR(form.monthly_retainer)}</p>
      </ReviewBlock>
      <ReviewBlock title="Contract & debit">
        <p>Start: <strong className="text-white">{form.contract_start_date || '—'}</strong>
          {' · '}Debit day: <strong className="text-white">{form.debit_day ? `${form.debit_day}${form.debit_day === '1' ? 'st' : 'th'}` : '—'}</strong>
        </p>
        {form.banking_captured
          ? <p className="text-emerald-400 text-xs mt-0.5">Banking captured ✓ (encrypted)</p>
          : form.bank_name
            ? <p className="text-amber-400 text-xs mt-0.5">Banking filled — will be encrypted on submit</p>
            : <p className="text-soft text-xs mt-0.5">No banking captured yet</p>}
      </ReviewBlock>
      <ReviewBlock title="Brief">
        <p>{form.brief || <span className="text-soft">none</span>}</p>
        {form.brand_notes && <p className="text-soft">Brand: {form.brand_notes}</p>}
      </ReviewBlock>
      <ReviewBlock title="Custom deliverables">
        {form.custom_deliverables.filter(d => d.title.trim()).length === 0
          ? <p className="text-soft">None</p>
          : <ul className="list-disc space-y-0.5 pl-5">
              {form.custom_deliverables.filter(d => d.title.trim()).map((d,i) => <li key={i}>{d.title}</li>)}
            </ul>}
      </ReviewBlock>
      {ratesLoading && <p className="text-sm text-soft"><Loader2 className="inline animate-spin" size={14}/> Loading rates…</p>}
      {!preview ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          <AlertTriangle className="mr-1 inline" size={14}/> No preview yet — fill the package step.
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="font-semibold text-emerald-300">This sale will pay {preview.closer?.name ?? 'the closer'}:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {(preview.closer?.rows ?? []).map((r,i) => (
              <li key={i}>{r.type.replace(/_/g,' ')}: {r.rate ? `${r.rate}% × ${ZAR(r.base)} = ` : ''}<strong>{ZAR(r.amount)}</strong></li>
            ))}
          </ul>
          <p className="mt-2 text-base font-semibold">Closer total: <span className="text-emerald-300">{ZAR(preview.closer?.total)}</span></p>
          {preview.cpc_sourcing && (
            <p className="mt-2 text-sm">CPC {preview.cpc_sourcing.name}: R87 + R250 = <strong>{ZAR(preview.cpc_sourcing.total)}</strong></p>
          )}
          {preview.admin && (
            <p className="text-sm">Admin {preview.admin.name}: <strong>{ZAR(preview.admin.amount)}</strong> contract-load</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── COMMISSION PREVIEW BAR ─────────────────────────── */
function CommissionPreviewBar({ preview, loading, form, closerOverride }) {
  return (
    <aside className="space-y-3">
      <div className="card p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-soft">Live commission preview</p>
        {loading ? (
          <p className="mt-3 text-sm text-soft"><Loader2 className="inline animate-spin" size={14}/> calculating…</p>
        ) : !preview ? (
          <p className="mt-3 text-sm text-soft">Fill the package step to see your earnings.</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-soft">
              {preview.closer?.role?.toUpperCase()} · {preview.closer?.term_months ?? '—'} months
            </p>
            <p className="mt-1 font-display text-3xl text-brandred">
              {ZAR(preview.closer?.total)}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-soft">
              {(preview.closer?.rows ?? []).map((r,i) => (
                <li key={i} className="flex justify-between">
                  <span>{r.type.replace(/_/g,' ')}</span>
                  <span className="text-white">{ZAR(r.amount)}</span>
                </li>
              ))}
            </ul>
            {preview.cpc_sourcing && (
              <p className="mt-2 border-t border-darkbg-border pt-2 text-xs">
                + CPC {preview.cpc_sourcing.name}: <span className="text-white">{ZAR(preview.cpc_sourcing.total)}</span>
              </p>
            )}
            {preview.admin && (
              <p className="text-xs">+ Admin: <span className="text-white">{ZAR(preview.admin.amount)}</span></p>
            )}
            {closerOverride && preview.closer?.total != null && (
              <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-[11px] text-amber-200">
                <p className="font-semibold uppercase tracking-widest">Owner closer override</p>
                <p className="mt-1 flex justify-between">
                  <span>{closerOverride.closerName} (closer): {closerOverride.closerPct}%</span>
                  <span className="text-white">{ZAR(preview.closer.total * closerOverride.closerPct / 100)}</span>
                </p>
                <p className="flex justify-between">
                  <span>{closerOverride.originatorName} (field agent): {closerOverride.originatorPct}%</span>
                  <span className="text-white">{ZAR(preview.closer.total * closerOverride.originatorPct / 100)}</span>
                </p>
                <p className="mt-1 text-[10px] opacity-70">Preview only — until Slice 3's split engine ships, the full amount above pays the field agent (who is set as closer for rate purposes).</p>
              </div>
            )}
          </>
        )}
      </div>
      <div className="card p-3 text-xs text-soft">
        On submit: deal created · contract drafted · setup invoice issued · onboarding kicked off · deliverables seeded.
      </div>
    </aside>
  );
}

/* ─────────────────────────── SUCCESS ─────────────────────────── */
function SuccessCard({ done, onAnother, onView }) {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <CheckCircle2 size={48} className="mx-auto mb-3 text-emerald-400"/>
      <h2 className="font-display text-2xl">Sale logged ✅</h2>
      <p className="mt-1 text-sm text-soft">
        Deal {done?.deal_id?.slice(0,8)} · {done?.commission_rows_written} commission rows · {done?.deliverables_created + (done?.custom_deliverables_created || 0)} deliverables
        {done?.idempotent_replay && ' · (replay of original)'}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button onClick={onAnother} className="btn-ghost">Log another sale</button>
        <button onClick={onView} className="btn-primary">View deals</button>
      </div>
    </div>
  );
}

/* ─── Error boundary so a step crash doesn't blank the whole route ─── */
class StepErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('[LogSale step crash]', err, info); }
  componentDidUpdate(prev) {
    if (prev.step !== this.props.step && this.state.err) this.setState({ err: null });
  }
  render() {
    if (this.state.err) {
      return (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm space-y-2">
          <p className="font-semibold text-rose-300">This step crashed.</p>
          <pre className="overflow-auto rounded bg-black/40 p-2 text-xs text-rose-200">
            {String(this.state.err?.message || this.state.err)}
          </pre>
          <p className="text-xs text-soft">Use Back to return to the previous step, or screenshot this and share.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─────────────────────────── tiny atoms ─────────────────────────── */
function Field({ label, value, onChange, type = 'text', placeholder, required, col = 1, disabled }) {
  return (
    <div className={col === 2 ? 'col-span-2' : ''}>
      <label className="label">{label}{required && ' *'}</label>
      <input className="input" type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
             placeholder={placeholder} required={required} disabled={disabled}/>
    </div>
  );
}
function ReviewBlock({ title, children }) {
  return (
    <div className="rounded-xl border border-darkbg-border bg-darkbg-900/40 p-3 text-sm">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-soft">{title}</p>
      {children}
    </div>
  );
}
