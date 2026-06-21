import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  User, Phone, Mail, MapPin, Briefcase, Target,
  Heart, Calendar, Save, ChevronRight, AlertCircle,
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
  const { role, user } = useAuth();
  const nav = useNavigate();
  const qc  = useQueryClient();

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
    }
  }, [profile]);

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
