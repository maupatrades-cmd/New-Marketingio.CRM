import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Upload, Save, Send, Trash2, PenLine } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';
import MascotGuide from '../../components/MascotGuide.jsx';

// /client/onboarding — authenticated, RLS-scoped. Prefills from the
// client's row + the latest deal.discovery, lets them fix anything,
// debounced autosave through the SECURITY DEFINER `client_self_update`
// RPC. The RPC enforces the whitelist server-side — the client can
// NEVER set package/pricing/status/lifecycle even if they craft a
// custom payload.

const SA_BANKS = [
  'ABSA', 'Capitec', 'FNB (First National Bank)', 'Nedbank',
  'Standard Bank', 'African Bank', 'Bidvest Bank', 'Discovery Bank',
  'Investec', 'TymeBank', 'Other',
];
const ACCOUNT_TYPES = ['Cheque / Current', 'Savings', 'Transmission'];
const DEBIT_DAYS = ['1st', '15th'];

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
        .select('id, business_name, contact_person, email, phone, whatsapp_number, website, address, industry, gmaps_url, socials, logo_url, onboarding_form_returned, brand_colors, brand_fonts, tone_of_voice, languages, words_to_avoid, posting_preference, google_account_email, facebook_page_url, instagram_handle, tiktok_handle, preferred_call_time, onboarding_notes, brand_assets_urls, mandate_bank_name, mandate_account_holder, mandate_account_number_masked, mandate_account_type, mandate_branch_code, mandate_debit_day, mandate_authorized_at, mandate_signature_data_url')
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
      brand_colors:    data.client.brand_colors    ?? '',
      brand_fonts:     data.client.brand_fonts     ?? '',
      tone_of_voice:   data.client.tone_of_voice   ?? '',
      languages:       data.client.languages       ?? '',
      words_to_avoid:  data.client.words_to_avoid  ?? '',
      posting_preference: data.client.posting_preference ?? '',
      google_account_email: data.client.google_account_email ?? '',
      facebook_page_url: data.client.facebook_page_url ?? '',
      instagram_handle: data.client.instagram_handle ?? '',
      tiktok_handle:   data.client.tiktok_handle   ?? '',
      preferred_call_time: data.client.preferred_call_time ?? '',
      onboarding_notes: data.client.onboarding_notes ?? '',
      brand_assets_urls: data.client.brand_assets_urls ?? [],
      mandate_bank_name: data.client.mandate_bank_name ?? '',
      mandate_account_holder: data.client.mandate_account_holder ?? '',
      mandate_account_number: '',
      mandate_account_number_masked: data.client.mandate_account_number_masked ?? '',
      mandate_account_type: data.client.mandate_account_type ?? '',
      mandate_branch_code: data.client.mandate_branch_code ?? '',
      mandate_debit_day: data.client.mandate_debit_day ?? '',
      mandate_signature_data_url: data.client.mandate_signature_data_url ?? '',
      mandate_authorized_at: data.client.mandate_authorized_at ?? null,
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
        brand_colors:    snapshot.brand_colors,
        brand_fonts:     snapshot.brand_fonts,
        tone_of_voice:   snapshot.tone_of_voice,
        languages:       snapshot.languages,
        words_to_avoid:  snapshot.words_to_avoid,
        posting_preference: snapshot.posting_preference,
        google_account_email: snapshot.google_account_email,
        facebook_page_url: snapshot.facebook_page_url,
        instagram_handle: snapshot.instagram_handle,
        tiktok_handle:   snapshot.tiktok_handle,
        preferred_call_time: snapshot.preferred_call_time,
        onboarding_notes: snapshot.onboarding_notes,
        brand_assets_urls: snapshot.brand_assets_urls,
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

  const handleMultiUpload = async (files) => {
    if (!files?.length || !user) return;
    setSaveStatus('saving');
    const newUrls = [...(form.brand_assets_urls || [])];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { setErrMsg(`${file.name} exceeds 10MB`); continue; }
      const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase();
      const path = `${user.id}/brand-assets/${Date.now()}_${Math.random().toString(36).slice(2,6)}.${ext}`;
      const { error } = await supabase.storage.from('client-uploads').upload(path, file, { upsert: true, contentType: file.type });
      if (error) { setErrMsg(`Upload failed: ${file.name}`); continue; }
      const { data: pub } = supabase.storage.from('client-uploads').getPublicUrl(path);
      newUrls.push(pub.publicUrl);
    }
    setForm(f => ({ ...f, brand_assets_urls: newUrls }));
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(s => (s === 'saved' ? 'idle' : s)), 1800);
  };
  const removeAsset = (index) => {
    setForm(f => ({ ...f, brand_assets_urls: f.brand_assets_urls.filter((_, i) => i !== index) }));
  };

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const onSubmit = async () => {
    if (submitting || !form) return;
    setSubmitting(true);
    try {
      await persist(form);

      if (form.mandate_bank_name && form.mandate_account_number && form.mandate_signature_data_url) {
        const { error: mErr } = await supabase.rpc('submit_debit_mandate', {
          p_bank_name: form.mandate_bank_name,
          p_account_holder: form.mandate_account_holder || null,
          p_account_number: form.mandate_account_number || null,
          p_account_type: form.mandate_account_type || null,
          p_branch_code: form.mandate_branch_code || null,
          p_debit_day: form.mandate_debit_day || null,
          p_signature_data_url: form.mandate_signature_data_url || null,
        });
        if (mErr) throw mErr;
      }

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
      <div className="grid min-h-screen place-items-center bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50">
        <MascotGuide phase="thinking" size={120} message="Loading your onboarding..." position="inline" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!data?.client) return <Navigate to="/owner" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50 px-4 py-10 text-[#0B2143]">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="space-y-2">
          <h1 className="font-display text-3xl text-[#0B2143]">Confirm your business details</h1>
          <p className="text-sm text-gray-500">
            Tell us anything that's not quite right and we'll get straight to work. Changes save automatically.
          </p>
          <SaveBadge status={saveStatus} error={errMsg} />
          {data.client.onboarding_form_returned && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
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
              <div className="grid h-20 w-20 place-items-center rounded-lg border border-gray-200 text-xs text-gray-500">No logo</div>
            )}
            <label className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition hover:text-red-500 hover:border-red-300">
              <Upload size={14} className="mr-1 inline" /> Upload logo
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => onUploadLogo(e.target.files?.[0])} />
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-500">PNG, JPG, WebP or SVG — up to 10MB.</p>
        </Section>

        <Section title="Discovery — what we should know">
          <Field label="What does the business do / sell? *" value={form.discovery.biz_does} onChange={v => updateDiscovery(setForm, 'biz_does', v)} required />
          <Field label="Who are your ideal customers? *" value={form.discovery.ideal_customer} onChange={v => updateDiscovery(setForm, 'ideal_customer', v)} required />
          <div>
            <label className="label-light">What's your #1 goal? *</label>
            <select className="input-light" value={form.discovery.goal} onChange={e => updateDiscovery(setForm, 'goal', e.target.value)}>
              <option value="">— Pick one —</option>
              {GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Field label="What makes you different?" value={form.discovery.differentiator} onChange={v => updateDiscovery(setForm, 'differentiator', v)} />
          <div>
            <label className="label-light">Brand assets ready?</label>
            <select className="input-light" value={form.discovery.brand_ready} onChange={e => updateDiscovery(setForm, 'brand_ready', e.target.value)}>
              <option value="">—</option>
              {BRAND_READY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Field label="Location / service area" value={form.discovery.location} onChange={v => updateDiscovery(setForm, 'location', v)} />
          <Field label="Anything we should avoid?" value={form.discovery.avoid} onChange={v => updateDiscovery(setForm, 'avoid', v)} />
          <Field label="Existing social handles" value={form.discovery.socials_existing} onChange={v => updateDiscovery(setForm, 'socials_existing', v)} placeholder="@theirIG · @theirFB" />
          <div>
            <label className="label-light">How do customers find you now?</label>
            <select className="input-light" value={form.discovery.how_found} onChange={e => updateDiscovery(setForm, 'how_found', e.target.value)}>
              <option value="">—</option>
              {HOW_FOUND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Field label="Biggest competitor" value={form.discovery.competitor} onChange={v => updateDiscovery(setForm, 'competitor', v)} />
          <Field label="Busiest days/times" value={form.discovery.busy_times} onChange={v => updateDiscovery(setForm, 'busy_times', v)} />
          <Field label="Typical sale value / price range" value={form.discovery.price_range} onChange={v => updateDiscovery(setForm, 'price_range', v)} />
          <Field label="Business WhatsApp" value={form.discovery.biz_whatsapp} onChange={v => updateDiscovery(setForm, 'biz_whatsapp', v)} type="tel" />
        </Section>

        <Section title="Your brand assets">
          <p className="text-sm text-gray-500 mb-3">
            Help us match your look. If you don't have these yet, select "Nothing yet" under Brand Ready above — we'll create them for you.
          </p>
          <Row>
            <Field label="Brand colours" value={form.brand_colors} onChange={v => setField('brand_colors', v)}
                   placeholder="e.g. Navy blue, red, white — or hex codes like #0B2143"/>
            <Field label="Brand fonts" value={form.brand_fonts} onChange={v => setField('brand_fonts', v)}
                   placeholder="e.g. Montserrat for headings, Open Sans for body"/>
          </Row>
          <div>
            <label className="label-light">Upload brand files (logo, photos, flyers, any existing materials)</label>
            <input type="file" multiple accept="image/*,.pdf,.ai,.psd,.eps,.svg"
                   onChange={e => handleMultiUpload(e.target.files)} className="input-light"/>
            {form.brand_assets_urls?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {form.brand_assets_urls.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="" className="h-16 w-16 rounded object-cover bg-white"/>
                    <button onClick={() => removeAsset(i)}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <Trash2 size={10}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Images, PDFs, or design files. Max 10MB each.</p>
          </div>
        </Section>

        <Section title="Account access">
          <p className="text-sm text-gray-500 mb-3">
            We need access to set up or manage your profiles. You can share login details or add us as an admin/editor after submitting.
          </p>
          <Row>
            <Field label="Google account email" value={form.google_account_email}
                   onChange={v => setField('google_account_email', v)}
                   placeholder="your.business@gmail.com" type="email"/>
            <Field label="Facebook page URL" value={form.facebook_page_url}
                   onChange={v => setField('facebook_page_url', v)}
                   placeholder="https://facebook.com/yourbusiness"/>
          </Row>
          <Row>
            <Field label="Instagram handle" value={form.instagram_handle}
                   onChange={v => setField('instagram_handle', v)}
                   placeholder="@yourbusiness"/>
            <Field label="TikTok handle (if applicable)" value={form.tiktok_handle}
                   onChange={v => setField('tiktok_handle', v)}
                   placeholder="@yourbusiness"/>
          </Row>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Tip: Instead of sharing passwords, you can add <strong>info@marketingio.co.za</strong> as an admin on your Facebook page and grant access to your Google Business Profile via the Google dashboard. We'll guide you through this on the onboarding call.
          </div>
        </Section>

        <Section title="Content preferences">
          <Field label="Tone of voice" value={form.tone_of_voice}
                 onChange={v => setField('tone_of_voice', v)}
                 placeholder="e.g. Professional but warm, never pushy or salesy"/>
          <Row>
            <Field label="Languages" value={form.languages}
                   onChange={v => setField('languages', v)}
                   placeholder="e.g. English, Sepedi, Tshivenda"/>
            <Field label="Best posting times" value={form.posting_preference}
                   onChange={v => setField('posting_preference', v)}
                   placeholder="e.g. Mornings Mon-Fri, avoid weekends"/>
          </Row>
          <Field label="Words or topics to avoid" value={form.words_to_avoid}
                 onChange={v => setField('words_to_avoid', v)}
                 placeholder="e.g. Never mention competitor names, avoid the word 'cheap'"/>
        </Section>

        <Section title="Availability for onboarding call">
          <Field label="When can we call you?" value={form.preferred_call_time}
                 onChange={v => setField('preferred_call_time', v)}
                 placeholder="e.g. Weekdays 9am-11am, or after 3pm"/>
          <div>
            <label className="label-light">Any other notes for our team?</label>
            <textarea className="input-light min-h-[80px]" value={form.onboarding_notes}
                      onChange={e => setField('onboarding_notes', e.target.value)}
                      placeholder="Anything else we should know before we start?"/>
          </div>
        </Section>

        <Section title="Debit order authorisation">
          {form.mandate_authorized_at && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 mb-3">
              <CheckCircle2 size={14} className="mr-1 inline" /> Mandate already signed — you can update and re-sign below.
            </div>
          )}
          <p className="text-sm text-gray-500 mb-3">
            Authorise Marketing iO to collect your monthly fee via debit order. Your full account number is encrypted and never visible to staff.
          </p>
          <div>
            <label className="label-light">Bank *</label>
            <select className="input-light" value={form.mandate_bank_name} onChange={e => setField('mandate_bank_name', e.target.value)}>
              <option value="">— Select your bank —</option>
              {SA_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <Row>
            <Field label="Account holder name *" value={form.mandate_account_holder}
                   onChange={v => setField('mandate_account_holder', v)}
                   placeholder="As it appears on your bank statement"/>
            <Field label="Account number *" value={form.mandate_account_number}
                   onChange={v => setField('mandate_account_number', v)}
                   placeholder={form.mandate_account_number_masked || 'e.g. 1234567890'}/>
          </Row>
          <Row>
            <div>
              <label className="label-light">Account type *</label>
              <select className="input-light" value={form.mandate_account_type} onChange={e => setField('mandate_account_type', e.target.value)}>
                <option value="">— Select —</option>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Field label="Branch code *" value={form.mandate_branch_code}
                   onChange={v => setField('mandate_branch_code', v)}
                   placeholder="e.g. 250655"/>
          </Row>
          <div>
            <label className="label-light">Debit collection day *</label>
            <div className="flex gap-3">
              {DEBIT_DAYS.map(d => (
                <button key={d} type="button"
                        onClick={() => setField('mandate_debit_day', d)}
                        className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition ${
                          form.mandate_debit_day === d
                            ? 'border-red-500 bg-red-50 text-red-600'
                            : 'border-gray-200 bg-white text-gray-500 hover:text-[#0B2143]'
                        }`}>
                  {d} of each month
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label-light">Signature — draw your signature below to authorise *</label>
            <SignaturePad
              value={form.mandate_signature_data_url}
              onChange={v => setField('mandate_signature_data_url', v)}
            />
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            By signing above, I authorise Marketing iO (Pty) Ltd to debit my account on the selected day each month for the agreed service fees. I understand I may cancel this mandate by giving 30 days' written notice.
          </p>
        </Section>

        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white/90 p-4 backdrop-blur">
          <SaveBadge status={saveStatus} error={errMsg} />
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-4 py-2 text-[#0B2143] hover:border-red-300 transition" onClick={() => persist(form)} disabled={saveStatus === 'saving'}>
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
    <section className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5">
      <h2 className="mb-4 font-display text-lg text-[#0B2143]">{title}</h2>
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
      <label className="label-light">{label}</label>
      <input
        className="input-light"
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        required={required}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  useEffect(() => {
    if (value && canvasRef.current) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.drawImage(img, 0, 0);
        setHasStrokes(true);
      };
      img.src = value;
    }
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches?.[0] ?? e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0B2143';
    ctx.lineCap = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setHasStrokes(true);
    onChange(canvasRef.current.toDataURL('image/png'));
  };
  const clear = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasStrokes(false);
    onChange('');
  };

  return (
    <div>
      <div className="relative rounded-lg border border-gray-300 bg-white overflow-hidden">
        <canvas ref={canvasRef} width={560} height={160}
                className="w-full cursor-crosshair touch-none"
                onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
                onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        {!hasStrokes && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-gray-400 text-sm flex items-center gap-1"><PenLine size={14}/> Sign here</span>
          </div>
        )}
      </div>
      {hasStrokes && (
        <button type="button" onClick={clear} className="mt-1 text-xs text-red-600 hover:text-red-500 transition">
          Clear signature
        </button>
      )}
    </div>
  );
}

function SaveBadge({ status, error }) {
  if (status === 'saving') return <span className="text-xs text-gray-500"><Loader2 size={12} className="mr-1 inline animate-spin" /> Saving…</span>;
  if (status === 'saved')  return <span className="text-xs text-emerald-600"><CheckCircle2 size={12} className="mr-1 inline" /> All changes saved</span>;
  if (status === 'error')  return <span className="text-xs text-red-600">Save failed: {error}</span>;
  return <span className="text-xs text-gray-500">Changes save automatically</span>;
}
