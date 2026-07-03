import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Upload, Save, Send, Trash2, PenLine, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const SA_BANKS = [
  'ABSA', 'Capitec', 'FNB (First National Bank)', 'Nedbank',
  'Standard Bank', 'African Bank', 'Bidvest Bank', 'Discovery Bank',
  'Investec', 'TymeBank', 'Other',
];
const ACCOUNT_TYPES = ['Cheque / Current', 'Savings', 'Transmission'];
const DEBIT_DAYS = ['1st', '15th'];
const BRAND_READY = [['ready','Ready to send'],['partial','Some assets, need help'],['none','Nothing yet']];
const GOALS = [
  ['more_calls','More phone calls'],['more_walk_in','More walk-ins'],
  ['more_orders','More online orders'],['brand_known','Be known in my area'],
  ['launch_new','Launch something new'],
];

export default function PublicOnboarding() {
  const { token } = useParams();
  const [form, setForm] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [errMsg, setErrMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const debounceRef = useRef(null);

  const dataQ = useQuery({
    queryKey: ['public-onboarding', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_onboarding_by_token', { p_token: token });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data;
    },
  });

  useEffect(() => {
    if (!dataQ.data || form !== null) return;
    const c = dataQ.data.client || {};
    const d = dataQ.data.deal || {};
    setForm({
      business_name: c.business_name ?? '',
      contact_person: c.contact_person ?? '',
      phone: c.phone ?? '',
      whatsapp_number: c.whatsapp_number ?? '',
      website: c.website ?? '',
      address: c.address ?? '',
      industry: c.industry ?? '',
      gmaps_url: c.gmaps_url ?? '',
      logo_url: c.logo_url ?? '',
      brand_colors: c.brand_colors ?? '',
      brand_fonts: c.brand_fonts ?? '',
      tone_of_voice: c.tone_of_voice ?? '',
      languages: c.languages ?? '',
      words_to_avoid: c.words_to_avoid ?? '',
      posting_preference: c.posting_preference ?? '',
      google_account_email: c.google_account_email ?? '',
      facebook_page_url: c.facebook_page_url ?? '',
      instagram_handle: c.instagram_handle ?? '',
      tiktok_handle: c.tiktok_handle ?? '',
      preferred_call_time: c.preferred_call_time ?? '',
      onboarding_notes: c.onboarding_notes ?? '',
      brand_assets_urls: c.brand_assets_urls ?? [],
      mandate_bank_name: c.mandate_bank_name ?? '',
      mandate_account_holder: c.mandate_account_holder ?? '',
      mandate_account_number: '',
      mandate_account_number_masked: c.mandate_account_number_masked ?? '',
      mandate_account_type: c.mandate_account_type ?? '',
      mandate_branch_code: c.mandate_branch_code ?? '',
      mandate_debit_day: c.mandate_debit_day ?? '',
      mandate_signature_data_url: c.mandate_signature_data_url ?? '',
      mandate_authorized_at: c.mandate_authorized_at ?? null,
      discovery: {
        biz_does: d?.discovery?.biz_does ?? '',
        ideal_customer: d?.discovery?.ideal_customer ?? '',
        goal: d?.discovery?.goal ?? '',
        differentiator: d?.discovery?.differentiator ?? '',
        brand_ready: d?.discovery?.brand_ready ?? '',
        location: d?.discovery?.location ?? '',
        avoid: d?.discovery?.avoid ?? '',
      },
    });
  }, [dataQ.data, form]);

  const persist = useCallback(async (payload) => {
    const { discovery, mandate_account_number, mandate_signature_data_url, ...rest } = payload;
    const body = { ...rest, brand_assets_urls: payload.brand_assets_urls, discovery };
    const { data, error } = await supabase.rpc('save_onboarding_by_token', { p_token: token, p_payload: body });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data.error);
  }, [token]);

  const scheduleSave = useCallback((next) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus('saving');
    debounceRef.current = setTimeout(async () => {
      try { await persist(next); setSaveStatus('saved'); setErrMsg(''); }
      catch (err) { setSaveStatus('error'); setErrMsg(err?.message ?? 'Save failed'); }
    }, 800);
  }, [persist]);

  const setField = (key, value) => setForm(prev => {
    const next = { ...prev, [key]: value };
    scheduleSave(next);
    return next;
  });
  const setDiscovery = (key, value) => setForm(prev => {
    const next = { ...prev, discovery: { ...prev.discovery, [key]: value } };
    scheduleSave(next);
    return next;
  });

  const handleFileUpload = async (file, field) => {
    if (!file) return;
    const path = `public-onboarding/${token}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('client-uploads').upload(path, file, { upsert: true });
    if (error) { setErrMsg(error.message); return; }
    const { data: pub } = supabase.storage.from('client-uploads').getPublicUrl(path);
    setField(field, pub.publicUrl);
  };
  const handleMultiUpload = async (files) => {
    const uploaded = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { setErrMsg(`${file.name} exceeds 10MB`); continue; }
      const path = `public-onboarding/${token}/assets/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from('client-uploads').upload(path, file, { upsert: true });
      if (error) { setErrMsg(error.message); continue; }
      const { data: pub } = supabase.storage.from('client-uploads').getPublicUrl(path);
      uploaded.push(pub.publicUrl);
    }
    if (uploaded.length) setField('brand_assets_urls', [...(form.brand_assets_urls ?? []), ...uploaded]);
  };
  const removeAsset = (url) => {
    setField('brand_assets_urls', (form.brand_assets_urls ?? []).filter(u => u !== url));
  };

  const onSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrMsg('');
    try {
      await persist(form);
      if (form.mandate_bank_name && form.mandate_account_number && form.mandate_signature_data_url) {
        const { error: mErr } = await supabase.rpc('submit_debit_mandate_by_token', {
          p_token: token,
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
      const { data, error } = await supabase.rpc('submit_onboarding_by_token', { p_token: token });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      setSubmitted(true);
    } catch (err) {
      setErrMsg(err?.message ?? 'Submit failed');
      setSubmitting(false);
    }
  };

  if (dataQ.isLoading) {
    return <div className="min-h-screen grid place-items-center bg-darkbg-900 text-soft"><Loader2 size={24} className="animate-spin" /></div>;
  }
  if (dataQ.isError) {
    return (
      <div className="min-h-screen grid place-items-center bg-darkbg-900 px-4">
        <div className="max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
          <XCircle size={40} className="mx-auto text-rose-400 mb-3" />
          <h1 className="font-display text-2xl text-white mb-2">Link invalid or expired</h1>
          <p className="text-sm text-rose-200">This onboarding link is no longer valid. Please contact Marketing iO for a fresh link.</p>
        </div>
      </div>
    );
  }
  if (submitted || dataQ.data?.already_submitted) {
    return (
      <div className="min-h-screen grid place-items-center bg-darkbg-900 px-4">
        <div className="max-w-md rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
          <h1 className="font-display text-2xl text-white mb-2">Thank you!</h1>
          <p className="text-sm text-emerald-200">Your onboarding form has been submitted. Our team will be in touch shortly.</p>
        </div>
      </div>
    );
  }
  if (!form) return null;

  return (
    <div className="min-h-screen bg-darkbg-900 text-white">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        <header className="text-center">
          <p className="font-display text-lg text-gradient">Marketing iO</p>
          <h1 className="font-display text-3xl text-white mt-2">Welcome — let's onboard you</h1>
          <p className="text-sm text-soft mt-2">Fill this in to help us launch your project. Your progress saves automatically.</p>
          <SaveBadge status={saveStatus} error={errMsg} />
        </header>

        <Section title="The basics">
          <Field label="Business name" value={form.business_name} onChange={v => setField('business_name', v)} />
          <Field label="Industry" value={form.industry} onChange={v => setField('industry', v)} placeholder="e.g. Salon, Auto repair, Bakery" />
          <Row>
            <Field label="Contact person" value={form.contact_person} onChange={v => setField('contact_person', v)} />
            <Field label="Phone" value={form.phone} onChange={v => setField('phone', v)} />
          </Row>
          <Row>
            <Field label="WhatsApp number" value={form.whatsapp_number} onChange={v => setField('whatsapp_number', v)} />
            <Field label="Website" value={form.website} onChange={v => setField('website', v)} placeholder="https://" />
          </Row>
          <Field label="Business address" value={form.address} onChange={v => setField('address', v)} />
          <Field label="Google Maps URL" value={form.gmaps_url} onChange={v => setField('gmaps_url', v)} placeholder="https://maps.google.com/..." />
        </Section>

        <Section title="Logo">
          {form.logo_url && (
            <img src={form.logo_url} alt="Logo" className="h-24 w-24 rounded-lg bg-white object-contain p-2 mb-2" />
          )}
          <FileInput accept="image/*" label={form.logo_url ? 'Replace logo' : 'Upload your logo'}
                     onFile={f => handleFileUpload(f, 'logo_url')} />
        </Section>

        <Section title="Discovery — tell us about your business">
          <TextArea label="What does your business do?" value={form.discovery.biz_does} onChange={v => setDiscovery('biz_does', v)} />
          <TextArea label="Who are your ideal customers?" value={form.discovery.ideal_customer} onChange={v => setDiscovery('ideal_customer', v)} />
          <div>
            <label className="label">Your #1 goal with marketing</label>
            <select className="input" value={form.discovery.goal} onChange={e => setDiscovery('goal', e.target.value)}>
              <option value="">— Select —</option>
              {GOALS.map(([k,l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <TextArea label="What makes you different?" value={form.discovery.differentiator} onChange={v => setDiscovery('differentiator', v)} />
          <div>
            <label className="label">Brand assets readiness</label>
            <select className="input" value={form.discovery.brand_ready} onChange={e => setDiscovery('brand_ready', e.target.value)}>
              <option value="">— Select —</option>
              {BRAND_READY.map(([k,l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <Field label="Where do you operate?" value={form.discovery.location} onChange={v => setDiscovery('location', v)} placeholder="e.g. Sandton + Fourways" />
          <TextArea label="Anything to avoid?" value={form.discovery.avoid} onChange={v => setDiscovery('avoid', v)} />
        </Section>

        <Section title="Brand assets">
          <Row>
            <Field label="Brand colours" value={form.brand_colors} onChange={v => setField('brand_colors', v)} placeholder="e.g. #E11D48, #1F2937" />
            <Field label="Brand fonts" value={form.brand_fonts} onChange={v => setField('brand_fonts', v)} placeholder="e.g. Poppins, Inter" />
          </Row>
          <div>
            <label className="label">Upload brand files (logos, photos, guidelines)</label>
            <FileInput accept="image/*,application/pdf" label="Add files" multiple
                       onFile={handleMultiUpload} />
            {form.brand_assets_urls?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {form.brand_assets_urls.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="" className="h-16 w-16 rounded object-cover bg-white" />
                    <button type="button" onClick={() => removeAsset(url)}
                            className="absolute -top-1 -right-1 rounded-full bg-rose-500 p-0.5 opacity-0 group-hover:opacity-100 transition">
                      <Trash2 size={10} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section title="Account access">
          <p className="text-xs text-soft">So we can post on your behalf.</p>
          <Field label="Google account email" value={form.google_account_email} onChange={v => setField('google_account_email', v)} placeholder="youremail@gmail.com" />
          <Field label="Facebook page URL" value={form.facebook_page_url} onChange={v => setField('facebook_page_url', v)} placeholder="https://facebook.com/yourpage" />
          <Row>
            <Field label="Instagram handle" value={form.instagram_handle} onChange={v => setField('instagram_handle', v)} placeholder="@yourhandle" />
            <Field label="TikTok handle" value={form.tiktok_handle} onChange={v => setField('tiktok_handle', v)} placeholder="@yourhandle" />
          </Row>
        </Section>

        <Section title="Content preferences">
          <Field label="Tone of voice" value={form.tone_of_voice} onChange={v => setField('tone_of_voice', v)} placeholder="e.g. Friendly + casual" />
          <Field label="Languages" value={form.languages} onChange={v => setField('languages', v)} placeholder="e.g. English, Zulu" />
          <Field label="Best times to post" value={form.posting_preference} onChange={v => setField('posting_preference', v)} placeholder="e.g. Weekdays 7-9am" />
          <TextArea label="Words or topics to avoid" value={form.words_to_avoid} onChange={v => setField('words_to_avoid', v)} />
        </Section>

        <Section title="Availability">
          <Field label="When can we call you?" value={form.preferred_call_time} onChange={v => setField('preferred_call_time', v)} placeholder="e.g. Weekdays 9am-11am" />
          <TextArea label="Any other notes?" value={form.onboarding_notes} onChange={v => setField('onboarding_notes', v)} />
        </Section>

        <Section title="Debit order authorisation">
          <p className="text-sm text-soft">
            Authorise Marketing iO to collect your monthly fee via debit order. Your full account number is encrypted.
          </p>
          <div>
            <label className="label">Bank</label>
            <select className="input" value={form.mandate_bank_name} onChange={e => setField('mandate_bank_name', e.target.value)}>
              <option value="">— Select your bank —</option>
              {SA_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <Row>
            <Field label="Account holder name" value={form.mandate_account_holder}
                   onChange={v => setField('mandate_account_holder', v)} />
            <Field label="Account number" value={form.mandate_account_number}
                   onChange={v => setField('mandate_account_number', v)}
                   placeholder={form.mandate_account_number_masked || 'e.g. 1234567890'} />
          </Row>
          <Row>
            <div>
              <label className="label">Account type</label>
              <select className="input" value={form.mandate_account_type} onChange={e => setField('mandate_account_type', e.target.value)}>
                <option value="">— Select —</option>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Field label="Branch code" value={form.mandate_branch_code}
                   onChange={v => setField('mandate_branch_code', v)} placeholder="e.g. 250655" />
          </Row>
          <div>
            <label className="label">Debit collection day</label>
            <div className="flex gap-3">
              {DEBIT_DAYS.map(d => (
                <button key={d} type="button" onClick={() => setField('mandate_debit_day', d)}
                        className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition ${
                          form.mandate_debit_day === d
                            ? 'border-brandred bg-brandred/20 text-white'
                            : 'border-darkbg-border bg-darkbg-800 text-soft hover:text-white'
                        }`}>
                  {d} of each month
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Signature — draw below to authorise</label>
            <SignaturePad value={form.mandate_signature_data_url}
                          onChange={v => setField('mandate_signature_data_url', v)} />
          </div>
          <p className="text-[11px] text-soft leading-relaxed">
            By signing, I authorise Marketing iO (Pty) Ltd to debit my account on the selected day each month for the agreed service fees.
            I understand I may cancel this mandate by giving 30 days' written notice.
          </p>
        </Section>

        <div className="sticky bottom-4 z-10 rounded-xl border border-darkbg-border bg-darkbg-800/90 backdrop-blur p-4">
          {errMsg && <p className="mb-2 text-sm text-rose-400">{errMsg}</p>}
          <button onClick={onSubmit} disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brandred hover:bg-brandred/80 text-white px-6 py-3 font-semibold transition">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Submit onboarding form
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-6 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-soft">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function Row({ children }) { return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>; }
function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function TextArea({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea className="input min-h-[70px]" value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
function FileInput({ accept, label, multiple, onFile }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-darkbg-border bg-darkbg-800 hover:border-brandred px-3 py-2 text-xs text-soft hover:text-white cursor-pointer transition">
      <Upload size={12} /> {label}
      <input type="file" accept={accept} multiple={multiple} className="hidden"
             onChange={e => {
               if (multiple) onFile(Array.from(e.target.files || []));
               else onFile(e.target.files?.[0]);
               e.target.value = '';
             }} />
    </label>
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
  const start = (e) => { e.preventDefault(); drawing.current = true;
    const ctx = canvasRef.current.getContext('2d'); const { x, y } = getPos(e); ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault();
    const ctx = canvasRef.current.getContext('2d'); const { x, y } = getPos(e);
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineTo(x, y); ctx.stroke(); };
  const end = () => { if (!drawing.current) return; drawing.current = false;
    setHasStrokes(true); onChange(canvasRef.current.toDataURL('image/png')); };
  const clear = () => { const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); setHasStrokes(false); onChange(''); };
  return (
    <div>
      <div className="relative rounded-lg border border-darkbg-border bg-darkbg-900 overflow-hidden">
        <canvas ref={canvasRef} width={560} height={160}
                className="w-full cursor-crosshair touch-none"
                onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
                onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        {!hasStrokes && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-soft text-sm flex items-center gap-1"><PenLine size={14}/> Sign here</span>
          </div>
        )}
      </div>
      {hasStrokes && (
        <button type="button" onClick={clear} className="mt-1 text-xs text-rose-400 hover:text-rose-300 transition">
          Clear signature
        </button>
      )}
    </div>
  );
}

function SaveBadge({ status, error }) {
  if (status === 'saving') return <p className="mt-2 text-xs text-soft"><Loader2 size={10} className="inline mr-1 animate-spin" />Saving…</p>;
  if (status === 'saved')  return <p className="mt-2 text-xs text-emerald-400"><CheckCircle2 size={10} className="inline mr-1" />Saved</p>;
  if (status === 'error')  return <p className="mt-2 text-xs text-rose-400">{error || 'Save failed'}</p>;
  return null;
}
