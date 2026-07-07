import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Loader2, User, Building2, Mail, MessageCircle, Save, Palette, Share2, ImagePlus,
  FileText, KeyRound, ShieldCheck, Camera, Briefcase, CheckCircle2, Circle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';
import MascotGuide from '../../components/MascotGuide.jsx';

const PACKAGE_LABEL = { ignite: 'Ignite', accelerate: 'Accelerate', dominate: 'Dominate', add_on: 'Add-on', custom: 'Custom' };

const PREF_ROWS = [
  { key: 'email_invoice_issued',    param: 'p_invoice',     label: 'Email me when an invoice is issued' },
  { key: 'email_deliverable_ready', param: 'p_deliverable', label: 'Email me when a deliverable is ready' },
  { key: 'email_monthly_report',    param: 'p_report',      label: 'Email me when a monthly report is available' },
  { key: 'email_payment_received',  param: 'p_payment',     label: 'Email me when a payment is received' },
];

export default function ClientProfile() {
  const qc = useQueryClient();
  const profQ = useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (error) throw error;
      if (data?.ok === false) throw new Error('Not a client');
      return data;
    },
  });

  const [form, setForm] = useState(null);
  useEffect(() => {
    if (profQ.data?.client && !form) {
      const c = profQ.data.client;
      setForm({
        contact_person:       c.contact_person ?? '',
        phone:                c.phone ?? '',
        whatsapp_number:      c.whatsapp_number ?? '',
        website:              c.website ?? '',
        address:              c.address ?? '',
        industry:             c.industry ?? '',
        trading_name:         c.trading_name ?? '',
        registration_number:  c.registration_number ?? '',
        vat_number:           c.vat_number ?? '',
        employee_count:       c.employee_count ?? '',
        years_in_business:    c.years_in_business ?? '',
        brand_colors:         c.brand_colors ?? '',
        brand_fonts:          c.brand_fonts ?? '',
        tone_of_voice:        c.tone_of_voice ?? '',
        languages:            c.languages ?? '',
        words_to_avoid:       c.words_to_avoid ?? '',
        facebook_page_url:    c.facebook_page_url ?? '',
        instagram_handle:     c.instagram_handle ?? '',
        tiktok_handle:        c.tiktok_handle ?? '',
        twitter_handle:       c.twitter_handle ?? '',
        google_account_email: c.google_account_email ?? '',
        brand_assets_urls:    Array.isArray(c.brand_assets_urls) ? c.brand_assets_urls : [],
      });
    }
  }, [profQ.data, form]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('client_self_update', { p_payload: form });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Profile saved'); qc.invalidateQueries({ queryKey: ['my-profile'] }); },
    onError: (err) => toast.error(err.message),
  });

  const prefMut = useMutation({
    mutationFn: async ({ param, value }) => {
      const { error } = await supabase.rpc('update_my_notification_prefs', { [param]: value });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-profile'] }),
    onError: (err) => toast.error(err.message),
  });

  if (profQ.isLoading || !form) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="thinking" size={80} message="Fetching your profile..." position="inline" />
    </div>
  );
  if (profQ.isError) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="sad" size={80} message={profQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
    </div>
  );

  const c = profQ.data.client;
  const deal = profQ.data.deal;
  const prefs = profQ.data.preferences || {};

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Your account details.</p>
      </div>

      {/* Read-only */}
      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
        <p className="text-xs uppercase tracking-widest text-gray-500">Account</p>
        <Row icon={Building2} label="Business" value={c.business_name} />
        <Row icon={Mail} label="Email" value={c.email} />
        <Row icon={User} label="Package" value={PACKAGE_LABEL[deal?.package] ?? deal?.package ?? '—'} />
        <Row icon={User} label="Member since" value={c.created_at ? new Date(c.created_at).toLocaleDateString('en-ZA') : '—'} />
      </section>

      {/* Editable */}
      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
        <p className="text-xs uppercase tracking-widest text-gray-500">Contact details</p>
        <Field label="Contact person" value={form.contact_person} onChange={v => setForm({ ...form, contact_person: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
          <Field label="WhatsApp" value={form.whatsapp_number} onChange={v => setForm({ ...form, whatsapp_number: v })} />
        </div>
        <Field label="Website" value={form.website} onChange={v => setForm({ ...form, website: v })} />
        <Field label="Address" value={form.address} onChange={v => setForm({ ...form, address: v })} />
      </section>

      {/* Business info */}
      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase size={14} className="text-[#E2293B]" />
          <p className="text-xs uppercase tracking-widest text-gray-500">Business information</p>
        </div>
        <Field label="Industry" placeholder="e.g. Retail, Hospitality, Professional Services"
               value={form.industry} onChange={v => setForm({ ...form, industry: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Trading name" placeholder="If different from business name"
                 value={form.trading_name} onChange={v => setForm({ ...form, trading_name: v })} />
          <Field label="Registration number" placeholder="e.g. 2020/123456/07"
                 value={form.registration_number} onChange={v => setForm({ ...form, registration_number: v })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="VAT number" placeholder="Leave blank if not registered"
                 value={form.vat_number} onChange={v => setForm({ ...form, vat_number: v })} />
          <Field label="Employees" type="number" placeholder="Number of staff"
                 value={form.employee_count} onChange={v => setForm({ ...form, employee_count: v })} />
        </div>
        <Field label="Years in business" type="number" placeholder="How many years have you been trading?"
               value={form.years_in_business} onChange={v => setForm({ ...form, years_in_business: v })} />
      </section>

      {/* Business logo */}
      <BusinessLogoSection logoUrl={c.logo_url} clientId={c.id} onChanged={() => qc.invalidateQueries({ queryKey: ['my-profile'] })} />

      {/* Brand */}
      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Palette size={14} className="text-[#E2293B]" />
          <p className="text-xs uppercase tracking-widest text-gray-500">Your brand</p>
        </div>
        <p className="text-xs text-gray-500">
          Anything you fill in here goes straight to the team producing your content.
        </p>
        <Field label="Brand colours" placeholder="e.g. Navy blue, Red, White"
               value={form.brand_colors} onChange={v => setForm({ ...form, brand_colors: v })} />
        <Field label="Brand fonts" placeholder="e.g. Montserrat headings, Open Sans body"
               value={form.brand_fonts} onChange={v => setForm({ ...form, brand_fonts: v })} />
        <Field label="Tone of voice" placeholder="e.g. Professional but warm"
               value={form.tone_of_voice} onChange={v => setForm({ ...form, tone_of_voice: v })} />
        <Field label="Languages" placeholder="e.g. English, Sepedi"
               value={form.languages} onChange={v => setForm({ ...form, languages: v })} />
        <TextareaField label="Words to avoid" placeholder="Anything you never want us to use…"
               value={form.words_to_avoid} onChange={v => setForm({ ...form, words_to_avoid: v })} />
      </section>

      {/* Social accounts */}
      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Share2 size={14} className="text-[#E2293B]" />
          <p className="text-xs uppercase tracking-widest text-gray-500">Social accounts</p>
        </div>
        <Field label="Facebook page URL" placeholder="https://facebook.com/yourbusiness"
               value={form.facebook_page_url} onChange={v => setForm({ ...form, facebook_page_url: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Instagram handle" placeholder="@yourbusiness"
                 value={form.instagram_handle} onChange={v => setForm({ ...form, instagram_handle: v })} />
          <Field label="TikTok handle" placeholder="@yourbusiness"
                 value={form.tiktok_handle} onChange={v => setForm({ ...form, tiktok_handle: v })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="X (Twitter) handle" placeholder="@yourbusiness"
                 value={form.twitter_handle} onChange={v => setForm({ ...form, twitter_handle: v })} />
          <Field label="Google account email" placeholder="your.business@gmail.com" type="email"
                 value={form.google_account_email} onChange={v => setForm({ ...form, google_account_email: v })} />
        </div>
      </section>

      {/* Single save button — covers Contact + Brand + Social */}
      <div className="flex items-center gap-2">
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                className="inline-flex items-center gap-1 rounded-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 text-sm transition">
          {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save changes
        </button>
        <p className="text-xs text-gray-500">Saves Contact, Brand and Social.</p>
      </div>

      {/* Brand assets gallery — read-only pointer to /client/uploads */}
      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ImagePlus size={14} className="text-[#E2293B]" />
            <p className="text-xs uppercase tracking-widest text-gray-500">Brand assets</p>
          </div>
          <Link to="/client/uploads" className="text-xs text-red-500 font-semibold hover:underline">
            Manage uploads →
          </Link>
        </div>
        {form.brand_assets_urls?.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {form.brand_assets_urls.map((url, i) => {
              const isImg = /\.(jpe?g|png|gif|webp|svg)$/i.test(url);
              return isImg ? (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt="" className="w-full h-20 object-cover rounded-lg bg-gray-100" />
                </a>
              ) : (
                <a key={i} href={url} target="_blank" rel="noreferrer"
                   className="w-full h-20 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center">
                  <FileText size={20} className="text-gray-400" />
                </a>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No brand assets uploaded yet.
            <Link to="/client/uploads" className="text-red-500 ml-1 font-semibold hover:underline">Upload some →</Link>
          </p>
        )}
      </section>

      {/* Password */}
      <PasswordSection clientEmail={c.email} />

      {/* Security questions */}
      <SecurityQuestionsSection alreadySet={c.security_questions_set}
                                q1Initial={c.security_question_1 || ''}
                                q2Initial={c.security_question_2 || ''} />

      {/* Notification preferences */}
      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
        <p className="text-xs uppercase tracking-widest text-gray-500">Email notifications</p>
        {PREF_ROWS.map(({ key, param, label }) => {
          const on = prefs[key] ?? true;
          return (
            <label key={key} className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm text-[#0B2143]">{label}</span>
              <input type="checkbox" checked={on}
                     onChange={e => prefMut.mutate({ param, value: e.target.checked })}
                     className="h-4 w-4 rounded border-gray-200 accent-red-500" />
            </label>
          );
        })}
      </section>

      <TeamSection />

      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs uppercase tracking-widest text-gray-500">Need to update your business name or email?</p>
        <a href="https://wa.me/27768038987" target="_blank" rel="noreferrer"
           className="mt-1 inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 transition">
          <MessageCircle size={14} /> Message us on WhatsApp
        </a>
      </div>
    </div>
  );
}

function TeamSection() {
  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_dashboard');
      if (error) throw error;
      return data;
    },
  });
  const team = dashQ.data?.team ?? [];
  if (!team.length) return null;
  return (
    <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6">
      <p className="text-xs uppercase tracking-widest text-gray-500 mb-4">Your Marketing iO Team</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {team.map((m, i) => (
          <div key={i} className="rounded-xl border border-gray-100 p-4 text-center">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-100 to-purple-100 mx-auto mb-3 flex items-center justify-center text-lg font-bold text-[#0B2143]">
              {m.name?.charAt(0) ?? '?'}
            </div>
            <p className="font-semibold text-[#0B2143] text-sm">{m.name}</p>
            <p className="text-xs text-gray-400">{m.role}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function BusinessLogoSection({ logoUrl, clientId, onChanged }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2MB'); return; }
    if (!clientId) return;
    setUploading(true);
    try {
      const ext  = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${clientId}/logo/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('client-uploads').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('client-uploads').getPublicUrl(path);
      const { error: rpcErr } = await supabase.rpc('client_self_update', { p_payload: { logo_url: pub.publicUrl } });
      if (rpcErr) throw rpcErr;
      toast.success('Logo updated');
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <Camera size={14} className="text-[#E2293B]" />
        <p className="text-xs uppercase tracking-widest text-gray-500">Business logo</p>
      </div>
      <div className="flex items-center gap-4">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="w-20 h-20 rounded-xl object-contain bg-white border border-gray-200" />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
            <Camera size={22} />
          </div>
        )}
        <div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden"
                 onChange={e => upload(e.target.files?.[0] ?? null)} />
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
                  className="text-sm text-[#E2293B] font-semibold hover:underline disabled:opacity-50 inline-flex items-center gap-1">
            {uploading && <Loader2 size={12} className="animate-spin" />}
            {logoUrl ? 'Change logo' : 'Upload logo'}
          </button>
          <p className="text-xs text-gray-400 mt-0.5">PNG or JPG, max 2MB.</p>
        </div>
      </div>
    </section>
  );
}

function PasswordSection({ clientEmail }) {
  const { user } = useAuth();
  const hasPassword = !!user?.identities?.some(i => i.provider === 'email');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const meetsLen = newPw.length >= 8;
  const hasNum   = /\d/.test(newPw);
  const hasUpper = /[A-Z]/.test(newPw);
  const matches  = newPw.length > 0 && newPw === confirmPw;
  const canSave  = hasPassword && meetsLen && hasNum && hasUpper && matches;

  const changePassword = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      toast.success('Password updated');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setUpPassword = async () => {
    if (!clientEmail) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(clientEmail, {
        redirectTo: `${window.location.origin}/set-password`,
      });
      if (error) throw error;
      toast.success('Setup email sent — check your inbox.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={14} className="text-[#E2293B]" />
        <p className="text-xs uppercase tracking-widest text-gray-500">Password</p>
      </div>

      {hasPassword ? (
        <>
          <Field label="Current password" type="password" value={currentPw} onChange={setCurrentPw} />
          <Field label="New password" type="password" value={newPw} onChange={setNewPw} />
          <Field label="Confirm new password" type="password" value={confirmPw} onChange={setConfirmPw} />
          <div className="space-y-1 mt-1">
            <StrengthRow met={meetsLen} label="At least 8 characters" />
            <StrengthRow met={hasNum}   label="Contains a number" />
            <StrengthRow met={hasUpper} label="Contains an uppercase letter" />
            <StrengthRow met={matches}  label="Passwords match" />
          </div>
          <button onClick={changePassword} disabled={!canSave || saving}
                  className="inline-flex items-center gap-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-full px-5 py-2 text-sm font-semibold transition">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Update password
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500">You're currently using email links to sign in.</p>
          <button onClick={setUpPassword} disabled={sending}
                  className="inline-flex items-center gap-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-full px-5 py-2 text-sm font-semibold transition">
            {sending && <Loader2 size={14} className="animate-spin" />}
            Set a password
          </button>
        </>
      )}
    </section>
  );
}

const SECURITY_Q_OPTIONS = [
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What is your favourite childhood food?",
  "What street did you grow up on?",
  "What is your pet's name?",
  "What was your first car?",
  "What is your favourite sports team?",
];

function SecurityQuestionsSection({ alreadySet, q1Initial, q2Initial }) {
  const [q1, setQ1] = useState(q1Initial);
  const [q2, setQ2] = useState(q2Initial);
  const [a1, setA1] = useState('');
  const [a2, setA2] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!q1 || !a1.trim()) { toast.error('Question 1 and its answer are required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_my_security_questions', {
        p_q1: q1, p_a1: a1.trim(),
        p_q2: q2 || null, p_a2: (q2 && a2.trim()) ? a2.trim() : null,
      });
      if (error) throw error;
      toast.success('Security questions saved');
      setA1(''); setA2('');
    } catch (err) {
      const label = [err.message, err.details, err.hint].filter(Boolean).join(' — ');
      toast.error(label || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={14} className="text-[#E2293B]" />
        <p className="text-xs uppercase tracking-widest text-gray-500">Security questions</p>
      </div>
      <p className="text-xs text-gray-500">
        {alreadySet
          ? 'Answers are stored one-way encrypted — we only compare them when you contact us for support. Re-answering below replaces the current questions.'
          : 'These help us verify your identity if you contact us for support. Answers are stored one-way encrypted; we never see them in plain text.'}
      </p>

      <div>
        <label className="label-light">Question 1</label>
        <select className="input-light" value={q1} onChange={e => setQ1(e.target.value)}>
          <option value="">— Select a question —</option>
          {SECURITY_Q_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        <input className="input-light mt-2" placeholder="Your answer"
               value={a1} onChange={e => setA1(e.target.value)} />
      </div>

      <div>
        <label className="label-light">Question 2 (optional)</label>
        <select className="input-light" value={q2} onChange={e => setQ2(e.target.value)}>
          <option value="">— None —</option>
          {SECURITY_Q_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        {q2 && (
          <input className="input-light mt-2" placeholder="Your answer"
                 value={a2} onChange={e => setA2(e.target.value)} />
        )}
      </div>

      <button onClick={save} disabled={saving || !q1 || !a1.trim()}
              className="inline-flex items-center gap-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-full px-5 py-2 text-sm font-semibold transition">
        {saving && <Loader2 size={14} className="animate-spin" />}
        Save security questions
      </button>
    </section>
  );
}

function StrengthRow({ met, label }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {met ? <CheckCircle2 size={12} className="text-emerald-500" />
           : <Circle size={12} className="text-gray-300" />}
      <span className={met ? 'text-[#0B2143]' : 'text-gray-400'}>{label}</span>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={16} className="mt-1 text-gray-500 shrink-0" />
      <div>
        <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
        <p className="text-sm text-[#0B2143] mt-0.5">{value || <span className="text-gray-500 italic">Not set</span>}</p>
      </div>
    </div>
  );
}
function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="label-light">{label}</label>
      <input className="input-light" type={type} value={value ?? ''} placeholder={placeholder}
             onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function TextareaField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="label-light">{label}</label>
      <textarea className="input-light min-h-[64px]" value={value ?? ''} placeholder={placeholder}
                onChange={e => onChange(e.target.value)} />
    </div>
  );
}
