import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Upload, Save, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';

// /client/onboarding — authenticated, RLS-scoped. Prefills from the
// client's row + the latest deal.discovery, lets them fix anything,
// debounced autosave through the SECURITY DEFINER `client_self_update`
// RPC. The RPC enforces the whitelist server-side — the client can
// NEVER set package/pricing/status/lifecycle even if they craft a
// custom payload.

const BRAND_READY = [
  ['ready', 'Ready to send'],
  ['partial', 'Some assets, need help with the rest'],
  ['none', 'Nothing yet'],
];
const HOW_FOUND = [
  ['walk_in', 'Walk-in / drive past'],
  ['referral', 'Word of mouth'],
  ['social', 'Social media'],
  ['google', 'Google search'],
  ['flyers', 'Flyers / street'],
  ['other', 'Other'],
];
const GOALS = [
  ['more_calls', 'More phone calls'],
  ['more_walk_in', 'More walk-ins'],
  ['more_orders', 'More online orders'],
  ['brand_known', 'Be known in my area'],
  ['launch_new', 'Launch something new'],
];

export default function ClientOnboarding() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [errMsg, setErrMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef(null);
  const initialFromServer = useRef(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['client-onboarding', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: client, error: cErr } = await supabase
        .from('clients')
        .select('id, business_name, contact_person, email, phone, whatsapp_number, website, address, industry, gmaps_url, socials, logo_url, onboarding_form_returned')
        .eq('client_user_id', user.id)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!client) return { client: null, deal: null };

      const { data: deals } = await supabase
        .from('deals')
        .select('id, package, discovery, stage, created_at')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(5);
      const closedWon = deals?.find(d => d.stage === 'closed_won');
      const latest = closedWon ?? deals?.[0] ?? null;
      return { client, deal: latest };
    },
  });

  const [form, setForm] = useState(null);
  useEffect(() => {
    if (!data?.client) return;
    if (form !== null) return;
    const initial = {
      business_name:   data.client.business_name   ?? '',
      contact_person:  data.client.contact_person  ?? '',
      phone:           data.client.phone           ?? '',
      whatsapp_number: data.client.whatsapp_number ?? '',
      website:         data.client.website         ?? '',
      address:         data.client.address         ?? '',
      industry:        data.client.industry        ?? '',
      gmaps_url:       data.client.gmaps_url       ?? '',
      socials_json:    data.client.socials ? JSON.stringify(data.client.socials, null, 0) : '',
      logo_url:        data.client.logo_url        ?? '',
      discovery: {
        biz_does:         data.deal?.discovery?.biz_does         ?? '',
        ideal_customer:   data.deal?.discovery?.ideal_customer   ?? '',
        goal:             data.deal?.discovery?.goal             ?? '',
        differentiator:   data.deal?.discovery?.differentiator   ?? '',
        brand_ready:      data.deal?.discovery?.brand_ready      ?? '',
        location:         data.deal?.discovery?.location         ?? '',
        avoid:            data.deal?.discovery?.avoid            ?? '',
        socials_existing: data.deal?.discovery?.socials_existing ?? '',
        how_found:        data.deal?.discovery?.how_found        ?? '',
        competitor:       data.deal?.discovery?.competitor       ?? '',
        busy_times:       data.deal?.discovery?.busy_times       ?? '',
        price_range:      data.deal?.discovery?.price_range      ?? '',
        biz_whatsapp:     data.deal?.discovery?.biz_whatsapp     ?? '',
      },
    };
    initialFromServer.current = initial;
    setForm(initial);
  }, [data, form]);

  const persist = useCallback(async (snapshot) => {
    setSaveStatus('saving');
    setErrMsg('');
    try {
      let socials = null;
      if (snapshot.socials_json?.trim()) {
        try { socials = JSON.parse(snapshot.socials_json); }
        catch { socials = { raw: snapshot.socials_json }; }
      }
      const payload = {
        business_name:   snapshot.business_name,
        contact_person:  snapshot.contact_person,
        phone:           snapshot.phone,
        whatsapp_number: snapshot.whatsapp_number,
        website:         snapshot.website,
        address:         snapshot.address,
        industry:        snapshot.industry,
        gmaps_url:       snapshot.gmaps_url,
        logo_url:        snapshot.logo_url,
        socials,
        discovery:       snapshot.discovery,
      };
      const { error } = await supabase.rpc('client_self_update', { p_payload: payload });
      if (error) throw error;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(s => (s === 'saved' ? 'idle' : s)), 1800);
    } catch (err) {
      setSaveStatus('error');
      setErrMsg(err?.message ?? 'Save failed');
    }
  }, []);

  // Debounced autosave: 1500ms after last change.
  useEffect(() => {
    if (!form || !initialFromServer.current) return;
    if (JSON.stringify(form) === JSON.stringify(initialFromServer.current)) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(form), 1500);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [form, persist]);

  const onUploadLogo = async (file) => {
    if (!file || !user) return;
    setSaveStatus('saving');
    try {
      const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();
      const path = `${user.id}/logo/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('client-uploads').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('client-uploads').getPublicUrl(path);
      setForm(f => ({ ...f, logo_url: pub.publicUrl }));
    } catch (err) {
      setSaveStatus('error');
      setErrMsg(err?.message ?? 'Logo upload failed');
    }
  };

  const onSubmit = async () => {
    if (submitting || !form) return;
    setSubmitting(true);
    try {
      await persist(form);
      const { error } = await supabase.rpc('client_mark_onboarding_returned');
      if (error) throw error;
      await refetch();
      navigate('/client', { replace: true });
    } catch (err) {
      setErrMsg(err?.message ?? 'Submit failed');
      setSubmitting(false);
    }
  };

  if (authLoading || isLoading || form === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-darkbg-900">
        <Loader2 size={24} className="animate-spin text-soft" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!data?.client) return <Navigate to="/owner" replace />;

  return (
    <div className="min-h-screen bg-darkbg-900 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="space-y-2">
          <h1 className="font-display text-3xl text-gradient">Confirm your business details</h1>
          <p className="text-sm text-soft">
            Tell us anything that's not quite right and we'll get straight to work. Changes save automatically.
          </p>
          <SaveBadge status={saveStatus} error={errMsg} />
          {data.client.onboarding_form_returned && (
            <div className="rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-4 py-2 text-sm text-emerald-300">
              <CheckCircle2 size={14} className="mr-1 inline" /> Profile already submitted — you can still edit and re-save.
            </div>
          )}
        </header>

        <Section title="The basics">
          <Row>
            <Field label="Business name" value={form.business_name} onChange={v => setForm(f => ({ ...f, business_name: v }))} />
            <Field label="Industry" value={form.industry} onChange={v => setForm(f => ({ ...f, industry: v }))} />
          </Row>
          <Row>
            <Field label="Main contact" value={form.contact_person} onChange={v => setForm(f => ({ ...f, contact_person: v }))} />
            <Field label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} type="tel" />
          </Row>
          <Row>
            <Field label="WhatsApp" value={form.whatsapp_number} onChange={v => setForm(f => ({ ...f, whatsapp_number: v }))} type="tel" />
            <Field label="Website" value={form.website} onChange={v => setForm(f => ({ ...f, website: v }))} placeholder="https://…" />
          </Row>
          <Field label="Address" value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} />
          <Field label="Google Maps URL" value={form.gmaps_url} onChange={v => setForm(f => ({ ...f, gmaps_url: v }))} placeholder="https://maps.google.com/…" />
          <Field
            label="Social handles (free text or JSON)"
            value={form.socials_json}
            onChange={v => setForm(f => ({ ...f, socials_json: v }))}
            placeholder='e.g. {"instagram":"@yours","facebook":"@yours"} or @yourIG · @yourFB'
          />
        </Section>

        <Section title="Logo">
          <div className="flex items-center gap-4">
            {form.logo_url ? (
              <img src={form.logo_url} alt="logo" className="h-20 w-20 rounded-lg bg-white object-contain p-2" />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded-lg border border-darkbg-border text-xs text-soft">No logo</div>
            )}
            <label className="cursor-pointer rounded-lg border border-darkbg-border bg-darkbg-800 px-4 py-2 text-sm text-soft transition hover:text-white">
              <Upload size={14} className="mr-1 inline" /> Upload logo
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => onUploadLogo(e.target.files?.[0])} />
            </label>
          </div>
          <p className="mt-2 text-xs text-soft">PNG, JPG, WebP or SVG — up to 10MB.</p>
        </Section>

        <Section title="Discovery — what we should know">
          <Field label="What does the business do / sell? *" value={form.discovery.biz_does} onChange={v => updateDiscovery(setForm, 'biz_does', v)} required />
          <Field label="Who are your ideal customers? *" value={form.discovery.ideal_customer} onChange={v => updateDiscovery(setForm, 'ideal_customer', v)} required />
          <div>
            <label className="label">What's your #1 goal? *</label>
            <select className="input" value={form.discovery.goal} onChange={e => updateDiscovery(setForm, 'goal', e.target.value)}>
              <option value="">— Pick one —</option>
              {GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Field label="What makes you different?" value={form.discovery.differentiator} onChange={v => updateDiscovery(setForm, 'differentiator', v)} />
          <div>
            <label className="label">Brand assets ready?</label>
            <select className="input" value={form.discovery.brand_ready} onChange={e => updateDiscovery(setForm, 'brand_ready', e.target.value)}>
              <option value="">—</option>
              {BRAND_READY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Field label="Location / service area" value={form.discovery.location} onChange={v => updateDiscovery(setForm, 'location', v)} />
          <Field label="Anything we should avoid?" value={form.discovery.avoid} onChange={v => updateDiscovery(setForm, 'avoid', v)} />
          <Field label="Existing social handles" value={form.discovery.socials_existing} onChange={v => updateDiscovery(setForm, 'socials_existing', v)} placeholder="@theirIG · @theirFB" />
          <div>
            <label className="label">How do customers find you now?</label>
            <select className="input" value={form.discovery.how_found} onChange={e => updateDiscovery(setForm, 'how_found', e.target.value)}>
              <option value="">—</option>
              {HOW_FOUND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Field label="Biggest competitor" value={form.discovery.competitor} onChange={v => updateDiscovery(setForm, 'competitor', v)} />
          <Field label="Busiest days/times" value={form.discovery.busy_times} onChange={v => updateDiscovery(setForm, 'busy_times', v)} />
          <Field label="Typical sale value / price range" value={form.discovery.price_range} onChange={v => updateDiscovery(setForm, 'price_range', v)} />
          <Field label="Business WhatsApp" value={form.discovery.biz_whatsapp} onChange={v => updateDiscovery(setForm, 'biz_whatsapp', v)} type="tel" />
        </Section>

        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-darkbg-border bg-darkbg-900/95 p-4 backdrop-blur">
          <SaveBadge status={saveStatus} error={errMsg} />
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => persist(form)} disabled={saveStatus === 'saving'}>
              <Save size={14} className="mr-1 inline" /> Save now
            </button>
            <button className="btn-primary" onClick={onSubmit} disabled={submitting}>
              {submitting ? <><Loader2 size={14} className="mr-1 inline animate-spin" /> Submitting…</> : <><Send size={14} className="mr-1 inline" /> Submit & continue</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function updateDiscovery(setForm, k, v) {
  setForm(f => ({ ...f, discovery: { ...f.discovery, [k]: v } }));
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-5">
      <h2 className="mb-4 font-display text-lg text-white">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function Row({ children }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}
function Field({ label, value, onChange, type = 'text', placeholder, required }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        required={required}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
function SaveBadge({ status, error }) {
  if (status === 'saving') return <span className="text-xs text-soft"><Loader2 size={12} className="mr-1 inline animate-spin" /> Saving…</span>;
  if (status === 'saved')  return <span className="text-xs text-emerald-400"><CheckCircle2 size={12} className="mr-1 inline" /> All changes saved</span>;
  if (status === 'error')  return <span className="text-xs text-rose-400">Save failed: {error}</span>;
  return <span className="text-xs text-soft">Changes save automatically</span>;
}
