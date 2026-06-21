import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  User, Phone, Mail, MapPin, Briefcase, Target,
  Heart, Calendar, Save, ChevronRight, AlertCircle,
  Camera, ImageIcon, Sparkles, Loader2, Upload, Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const DREAM_TYPES = [
  { value: 'property',    label: 'Buy / Build Property' },
  { value: 'vehicle',     label: 'Buy a Vehicle' },
  { value: 'education',   label: 'Education / Studies' },
  { value: 'travel',      label: 'Travel / Experiences' },
  { value: 'business',    label: 'Start / Grow a Business' },
  { value: 'family',      label: 'Provide for Family' },
  { value: 'freedom',     label: 'Financial Freedom' },
  { value: 'other',       label: 'Something Else' },
];

const EMPLOYMENT_TYPES = [
  { value: 'full_time',   label: 'Full Time' },
  { value: 'part_time',   label: 'Part Time' },
  { value: 'fixed_term',  label: 'Fixed Term Contract' },
  { value: 'contractor',  label: 'Independent Contractor' },
  { value: 'intern',      label: 'Intern' },
];

const NATIONALITIES = [
  'South African', 'Zimbabwean', 'Mozambican', 'Malawian',
  'Nigerian', 'Zambian', 'Botswanan', 'Namibian', 'Other',
];

const SA_CITIES = [
  'Polokwane', 'Johannesburg', 'Pretoria', 'Cape Town',
  'Durban', 'Bloemfontein', 'Port Elizabeth', 'East London',
  'Nelspruit', 'Kimberley', 'Rustenburg', 'Other',
];

const RELATIONSHIPS = ['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Other'];

// ─── Layout atoms ─────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, color = 'text-brandred', children }) {
  return (
    <div className="rounded-xl border border-darkbg-border bg-darkbg-800/60 p-6">
      <div className="mb-5 flex items-center gap-2">
        <Icon size={16} className={color} />
        <h2 className="font-display text-base font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-soft uppercase tracking-wider">
        {label}{required && <span className="ml-1 text-brandred">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-soft/60">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', readOnly, ...rest }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`input w-full ${readOnly ? 'cursor-not-allowed opacity-60' : ''}`}
      {...rest}
    />
  );
}

function Select({ value, onChange, children, disabled }) {
  return (
    <select
      value={value ?? ''}
      onChange={onChange}
      disabled={disabled}
      className="input w-full"
    >
      {children}
    </select>
  );
}

function SaveBar({ saving, dirty, onSave }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-4 z-20 flex justify-end">
      <button
        onClick={onSave}
        disabled={saving}
        className="btn-primary flex items-center gap-2 shadow-xl"
      >
        <Save size={14} />
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}

// ─── Image upload helpers (Brick G1) ─────────────────────────────────────────

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

async function uploadImage({ bucket, userId, file, filename }) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image must be under 5MB.');

  const ext  = (file.name.split('.').pop() || 'png').toLowerCase();
  // RLS requires the first path segment to be the user's id.
  const path = `${userId}/${filename}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  // Cache-bust so the new image replaces the cached one immediately.
  return `${data.publicUrl}?v=${Date.now()}`;
}

function AvatarUploader({ userId, value, onChange }) {
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadImage({ bucket: 'avatars', userId, file, filename: 'avatar' });
      onChange(url);
      toast.success('Photo updated.');
    } catch (err) {
      toast.error(err.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 flex-none overflow-hidden rounded-full border-2 border-darkbg-border bg-darkbg-900">
        {value
          ? <img src={value} alt="Avatar" className="h-full w-full object-cover" />
          : <div className="flex h-full w-full items-center justify-center text-soft"><User size={28} /></div>}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/50">
            <Loader2 size={20} className="animate-spin text-white" />
          </div>
        )}
      </div>
      <div>
        <label className="btn-secondary cursor-pointer text-sm">
          <Camera size={14} /> {value ? 'Change photo' : 'Upload photo'}
          <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={busy} />
        </label>
        <p className="mt-1.5 text-[11px] text-soft/60">JPG or PNG, up to 5MB.</p>
      </div>
    </div>
  );
}

function DreamHeroUploader({ userId, value, dreamType, dreamDetails, onChange }) {
  const [busy, setBusy]   = useState(false);
  const [genBusy, setGen] = useState(false);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadImage({ bucket: 'dream-heroes', userId, file, filename: 'hero' });
      onChange(url);
      toast.success('Dream image updated.');
    } catch (err) {
      toast.error(err.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!dreamType) {
      toast.error('Pick a dream type first, then generate.');
      return;
    }
    setGen(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-dream-hero', {
        body: { dream_type: dreamType, dream_details: dreamDetails || '' },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Generation failed.');
      onChange(data.url);
      toast.success('Your dream image is ready ✨');
    } catch (err) {
      toast.error(err.message || 'Could not generate image.');
    } finally {
      setGen(false);
    }
  }

  return (
    <div>
      <div className="relative mb-3 aspect-[16/7] w-full overflow-hidden rounded-xl border border-darkbg-border bg-darkbg-900">
        {value
          ? <img src={value} alt="Dream hero" className="h-full w-full object-cover" />
          : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-soft/50">
              <ImageIcon size={28} />
              <p className="text-xs">No dream image yet</p>
            </div>
          )}
        {(busy || genBusy) && (
          <div className="absolute inset-0 grid place-items-center bg-black/60">
            <div className="flex flex-col items-center gap-2 text-white">
              <Loader2 size={24} className="animate-spin" />
              <p className="text-xs">{genBusy ? 'Generating your dream…' : 'Uploading…'}</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="btn-secondary cursor-pointer text-sm">
          <Upload size={14} /> Upload image
          <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={busy || genBusy} />
        </label>
        <button
          type="button"
          onClick={generate}
          disabled={busy || genBusy}
          className="btn-primary text-sm"
        >
          <Sparkles size={14} /> {value ? 'Regenerate with AI' : 'Generate with AI'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={busy || genBusy}
            className="btn-ghost text-sm"
          >
            <Trash2 size={14} /> Remove
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-soft/60">
        Upload your own, or let AI paint your dream from your dream type and details. Shows on your My Day.
      </p>
    </div>
  );
}

// ─── Onboarding prompt (for partners with incomplete profiles) ───────────────

function OnboardingBanner({ profile, role, onDismiss }) {
  const missing = [];
  if (!profile?.phone) missing.push('phone number');
  if (!profile?.date_of_birth) missing.push('date of birth');
  if (!profile?.emergency_contact_name) missing.push('emergency contact');
  if ((role === 'field_agent' || role === 'cpc') && !profile?.dream_caption) missing.push('your dream');

  if (missing.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4">
      <AlertCircle size={16} className="mt-0.5 flex-none text-yellow-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-yellow-300">Complete your profile</p>
        <p className="mt-0.5 text-xs text-yellow-200/70">
          Missing: {missing.join(', ')}. A complete profile helps your team and is required for payroll.
        </p>
      </div>
      <button onClick={onDismiss} className="text-yellow-400/60 hover:text-yellow-300 text-xs flex-none">
        Dismiss
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Profile() {
  const { role, user, refreshProfile } = useAuth();
  const nav = useNavigate();
  const qc  = useQueryClient();

  // Image URLs persist immediately (separate from the Save-button form).
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [heroUrl, setHeroUrl]     = useState(null);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['full-profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const [showBanner, setShowBanner] = useState(true);
  const [saving, setSaving]         = useState(false);
  const [dirty, setDirty]           = useState(false);

  // ── Form state — NARROW ALLOWLIST ONLY ──────────────────────────────────
  const [form, setForm] = useState({
    full_name:                    '',
    phone:                        '',
    date_of_birth:                '',
    nationality:                  'South African',
    residential_address:          '',
    emergency_contact_name:       '',
    emergency_contact_phone:      '',
    emergency_contact_relationship: '',
    // Motivation
    dream_caption:                '',
    dream_type:                   '',
    dream_details:                '',
    monthly_goal_wins:            5,
    monthly_earning_goal_zar:     '',
    // Employment (read-only for non-owner, editable by owner/admin)
    employee_id:                  '',
    workspace_email:              '',
    employment_type:              '',
    start_date:                   '',
    base_city:                    'Polokwane',
    household_size:               1,
  });

  useEffect(() => {
    if (profile) {
      setForm({
        full_name:                      profile.full_name ?? '',
        phone:                          profile.phone ?? '',
        date_of_birth:                  profile.date_of_birth ?? '',
        nationality:                    profile.nationality ?? 'South African',
        residential_address:            profile.residential_address ?? '',
        emergency_contact_name:         profile.emergency_contact_name ?? '',
        emergency_contact_phone:        profile.emergency_contact_phone ?? '',
        emergency_contact_relationship: profile.emergency_contact_relationship ?? '',
        dream_caption:                  profile.dream_caption ?? '',
        dream_type:                     profile.dream_type ?? '',
        dream_details:                  profile.dream_details ?? '',
        monthly_goal_wins:              profile.monthly_goal_wins ?? 5,
        monthly_earning_goal_zar:       profile.monthly_earning_goal_zar ?? '',
        employee_id:                    profile.employee_id ?? '',
        workspace_email:                profile.workspace_email ?? '',
        employment_type:                profile.employment_type ?? '',
        start_date:                     profile.start_date ?? '',
        base_city:                      profile.base_city ?? 'Polokwane',
        household_size:                 profile.household_size ?? 1,
      });
      setAvatarUrl(profile.avatar_url ?? null);
      setHeroUrl(profile.dream_hero_image_url ?? null);
    }
  }, [profile]);

  // Persist a single image column immediately and refresh auth + query cache
  // so My Day reflects it without a reload.
  async function persistImage(column, url) {
    const prevAvatar = avatarUrl;
    const prevHero   = heroUrl;
    if (column === 'avatar_url') setAvatarUrl(url);
    if (column === 'dream_hero_image_url') setHeroUrl(url);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [column]: url, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['full-profile', user.id] });
      refreshProfile?.();
    } catch (err) {
      // Roll back optimistic UI on failure
      setAvatarUrl(prevAvatar);
      setHeroUrl(prevHero);
      toast.error(err.message || 'Could not save image.');
    }
  }

  function set(key) {
    return (e) => {
      setForm(f => ({ ...f, [key]: e.target.value }));
      setDirty(true);
    };
  }

  function setNum(key) {
    return (e) => {
      setForm(f => ({ ...f, [key]: Number(e.target.value) || 0 }));
      setDirty(true);
    };
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      // NARROW ALLOWLIST — only these columns can be self-updated
      const SELF_ALLOWLIST = [
        'full_name', 'phone', 'date_of_birth', 'nationality',
        'residential_address', 'emergency_contact_name',
        'emergency_contact_phone', 'emergency_contact_relationship',
        'dream_caption', 'dream_type', 'dream_details',
        'monthly_goal_wins', 'monthly_earning_goal_zar',
        'base_city', 'household_size',
      ];

      // Owner/admin can also update employment fields
      const ADMIN_EXTRA = ['employee_id', 'workspace_email', 'employment_type', 'start_date'];

      const allowed = (role === 'owner' || role === 'admin')
        ? [...SELF_ALLOWLIST, ...ADMIN_EXTRA]
        : SELF_ALLOWLIST;

      const payload = Object.fromEntries(
        Object.entries(form).filter(([k]) => allowed.includes(k))
      );

      // Coerce types
      if (payload.monthly_goal_wins !== undefined)
        payload.monthly_goal_wins = Number(payload.monthly_goal_wins) || 0;
      if (payload.household_size !== undefined)
        payload.household_size = Number(payload.household_size) || 1;

      // Empty strings must become null for typed / CHECK-constrained columns,
      // otherwise Postgres rejects them (date parse error / constraint violation).
      const NULLABLE_IF_BLANK = [
        'monthly_earning_goal_zar', 'date_of_birth', 'start_date',
        'employment_type', 'dream_type', 'emergency_contact_relationship',
        'employee_id', 'workspace_email',
      ];
      for (const k of NULLABLE_IF_BLANK) {
        if (payload[k] === '') payload[k] = null;
      }

      payload.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id);

      if (error) throw error;

      qc.invalidateQueries({ queryKey: ['full-profile', user.id] });
      refreshProfile?.();
      toast.success('Profile saved.');
      setDirty(false);
    } catch (err) {
      toast.error(err.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  const canEditEmployment = role === 'owner' || role === 'admin';

  if (profileLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-48 animate-pulse rounded-xl bg-darkbg-700/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">
            <span className="text-gradient">My Profile</span>
          </h1>
          <p className="mt-0.5 text-sm text-soft">Your identity, motivation, and employment details.</p>
        </div>

        {/* Security shortcut */}
        <button
          onClick={() => nav('/owner/profile/security')}
          className="flex items-center gap-1.5 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-2 text-xs font-semibold text-soft transition hover:border-brandred hover:text-white"
        >
          Password & Security <ChevronRight size={12} />
        </button>
      </div>

      {showBanner && (
        <OnboardingBanner
          profile={profile}
          role={role}
          onDismiss={() => setShowBanner(false)}
        />
      )}

      {/* ── SECTION 1: Identity ───────────────────────────────────────────── */}
      <Section icon={User} title="Identity">
        <div className="mb-5 border-b border-darkbg-border/40 pb-5">
          <AvatarUploader userId={user.id} value={avatarUrl} onChange={(url) => persistImage('avatar_url', url)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full Name" required>
            <Input value={form.full_name} onChange={set('full_name')} placeholder="Your full name" />
          </Field>

          <Field label="Login Email" hint="Contact support to change your email address.">
            <Input value={profile?.email ?? ''} readOnly />
          </Field>

          <Field label="Mobile Number">
            <Input
              value={form.phone}
              onChange={set('phone')}
              placeholder="0XX XXX XXXX"
              type="tel"
            />
          </Field>

          <Field label="Date of Birth">
            <Input
              value={form.date_of_birth}
              onChange={set('date_of_birth')}
              type="date"
            />
          </Field>

          <Field label="Nationality">
            <Select value={form.nationality} onChange={set('nationality')}>
              {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>

          <Field label="Base City">
            <Select value={form.base_city} onChange={set('base_city')}>
              {SA_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>

          <Field label="Residential Address" hint="Used for payroll and HR records only.">
            <Input
              value={form.residential_address}
              onChange={set('residential_address')}
              placeholder="Street, Suburb, City, Code"
            />
          </Field>

          <Field label="Household Size" hint="Number of dependants including yourself.">
            <Input
              value={form.household_size}
              onChange={setNum('household_size')}
              type="number"
              min={1}
              max={20}
            />
          </Field>
        </div>
      </Section>

      {/* ── SECTION 2: Emergency Contact ──────────────────────────────────── */}
      <Section icon={Phone} title="Emergency Contact" color="text-red-400">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Contact Name">
            <Input
              value={form.emergency_contact_name}
              onChange={set('emergency_contact_name')}
              placeholder="Full name"
            />
          </Field>

          <Field label="Contact Phone">
            <Input
              value={form.emergency_contact_phone}
              onChange={set('emergency_contact_phone')}
              placeholder="0XX XXX XXXX"
              type="tel"
            />
          </Field>

          <Field label="Relationship">
            <Select
              value={form.emergency_contact_relationship}
              onChange={set('emergency_contact_relationship')}
            >
              <option value="">Select…</option>
              {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
        </div>
      </Section>

      {/* ── SECTION 3: Motivation ─────────────────────────────────────────── */}
      {(role === 'field_agent' || role === 'cpc' || role === 'admin' || role === 'owner') && (
        <Section icon={Heart} title="My Dream & My Number" color="text-pink-400">
          <p className="mb-4 text-xs text-soft">
            Your "why" — visible on your My Day dashboard to keep you locked in.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Dream Type">
              <Select value={form.dream_type} onChange={set('dream_type')}>
                <option value="">Select your dream…</option>
                {DREAM_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </Select>
            </Field>

            <Field label="Monthly Winning Goal" hint="How many sales closes per month?">
              <Input
                value={form.monthly_goal_wins}
                onChange={setNum('monthly_goal_wins')}
                type="number"
                min={1}
                max={100}
              />
            </Field>

            <Field label="Monthly Earning Goal (R)" hint="Your income target per month.">
              <Input
                value={form.monthly_earning_goal_zar}
                onChange={set('monthly_earning_goal_zar')}
                type="number"
                min={0}
                placeholder="e.g. 30000"
              />
            </Field>

            <Field label="Your Dream in One Line" hint="e.g. 'Own a home in Tzaneen by December 2027'">
              <Input
                value={form.dream_caption}
                onChange={set('dream_caption')}
                placeholder="My dream is…"
              />
            </Field>

            <Field label="Dream Details" hint="Optional — more context for yourself.">
              <textarea
                value={form.dream_details}
                onChange={set('dream_details')}
                placeholder="Tell us more about what drives you…"
                rows={3}
                className="input w-full resize-none"
              />
            </Field>
          </div>

          {/* Dream hero image — upload or AI-generate (Brick G1 + I) */}
          <div className="mt-5 border-t border-darkbg-border/40 pt-5">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-soft">
              <ImageIcon size={13} /> Dream Image
            </p>
            <DreamHeroUploader
              userId={user.id}
              value={heroUrl}
              dreamType={form.dream_type}
              dreamDetails={form.dream_details}
              onChange={(url) => persistImage('dream_hero_image_url', url)}
            />
            {form.dream_type !== profile?.dream_type && (
              <p className="mt-2 text-[11px] text-yellow-400/80">
                Tip: save your dream type first so AI generation uses your latest choice.
              </p>
            )}
          </div>
        </Section>
      )}

      {/* ── SECTION 4: Employment ─────────────────────────────────────────── */}
      <Section icon={Briefcase} title="Employment" color="text-blue-400">
        {!canEditEmployment && (
          <p className="mb-4 text-xs text-soft italic">
            Employment details are managed by your owner or admin.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Employee ID">
            <Input
              value={form.employee_id}
              onChange={set('employee_id')}
              placeholder="MIO-001"
              readOnly={!canEditEmployment}
            />
          </Field>

          <Field label="Workspace Email">
            <Input
              value={form.workspace_email}
              onChange={set('workspace_email')}
              placeholder="name@marketingio.co.za"
              type="email"
              readOnly={!canEditEmployment}
            />
          </Field>

          <Field label="Employment Type">
            <Select
              value={form.employment_type}
              onChange={set('employment_type')}
              disabled={!canEditEmployment}
            >
              <option value="">Select…</option>
              {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>

          <Field label="Start Date">
            <Input
              value={form.start_date}
              onChange={set('start_date')}
              type="date"
              readOnly={!canEditEmployment}
            />
          </Field>
        </div>
      </Section>

      {/* ── SECTION 5: Quick links to sub-pages ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Password & Security', sub: 'Change password, 2FA, recent logins', path: '/owner/profile/security', icon: '🔐' },
          { label: 'Notifications',       sub: 'Email & alert preferences',           path: '/owner/profile/notifications', icon: '🔔' },
          { label: 'Documents',           sub: 'ID copy, contract & certificates',    path: '/owner/profile/documents', icon: '📄' },
        ].map(({ label, sub, path, icon }) => (
          <button
            key={path}
            onClick={() => nav(path)}
            className="flex items-start gap-3 rounded-xl border border-darkbg-border bg-darkbg-800/40 p-4 text-left transition hover:border-brandred"
          >
            <span className="text-xl">{icon}</span>
            <div>
              <p className="text-sm font-semibold text-white">{label}</p>
              <p className="text-xs text-soft">{sub}</p>
            </div>
            <ChevronRight size={14} className="ml-auto mt-1 flex-none text-soft/40" />
          </button>
        ))}
      </div>

      <SaveBar saving={saving} dirty={dirty} onSave={handleSave} />
    </div>
  );
}
